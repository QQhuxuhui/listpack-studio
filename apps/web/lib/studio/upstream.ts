/**
 * Server-only client for the sparkcode.top image-gen gateway.
 *
 * Two upstream shapes, picked per model:
 *
 *   - OpenAI-compatible (gpt-image-*):
 *     - T2I: POST /v1/images/generations   (JSON body)
 *     - I2I: POST /v1/images/edits         (multipart, with `image` parts)
 *     Response: { data: [{ b64_json }, ...] }  — n outputs in one call.
 *
 *   - Chat completions with image modality (gemini-*):
 *     - POST /v1/chat/completions
 *     - body: { model, messages:[{role,content:[text|image_url,...]}],
 *               modalities:['image','text'], stream:false,
 *               extra_body?:{ generationConfig:{ imageConfig:{ aspectRatio } } } }
 *     Response: { choices:[{ message:{ content: dataURL | [{image_url:{url}}] } }] }
 *     Gemini returns one image per call — we loop for n.
 *
 * Keys come from env (server-side only — never exposed to the browser).
 */

import 'server-only';
import { Buffer } from 'node:buffer';
import { getModel, type StudioModel } from './models';
import type { RefRole } from './refs-type';

const DEFAULT_BASE = 'https://api.sparkcode.top/v1';

/**
 * 把 prompt 与 refs 按 role 分组拼成 effective prompt。
 * 设计目标：让单一上游（不论 OpenAI-compat 还是 Gemini chat）
 * 都能从纯文本里捕捉到 "哪张图是内容、哪张图是风格" 的语义，
 * 不依赖 API 提供 role 槽位。
 */
export function buildEffectivePrompt(input: {
  prompt: string;
  refs: Array<{ role: RefRole }>;
}): string {
  if (input.refs.length === 0) return input.prompt;
  const byRole: Record<RefRole, number> = { content: 0, style: 0, character: 0 };
  for (const r of input.refs) byRole[r.role]++;
  const segments: string[] = [];
  if (byRole.content > 0) {
    segments.push(`[content reference]${byRole.content > 1 ? ` (${byRole.content} images)` : ''}`);
  }
  if (byRole.style > 0) {
    segments.push(`[style reference]${byRole.style > 1 ? ` (${byRole.style} images)` : ''}`);
  }
  if (byRole.character > 0) {
    segments.push(`[keep character consistent]${byRole.character > 1 ? ` (${byRole.character} images)` : ''}`);
  }
  return `${segments.join(' ')} ${input.prompt}`;
}

export interface UpstreamInputImage {
  mime: string;
  bytes: Buffer;
  role: RefRole;
}

export interface GenerateInput {
  model: string;
  prompt: string;
  n: number;
  /** OpenAI-style size string, e.g. '1024x1024'. Optional for chat models. */
  size?: string;
  /** Gemini-style aspect ratio, e.g. '1:1'. Optional for images models. */
  aspectRatio?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  background?: 'transparent' | 'opaque' | 'auto';
  inputImages?: UpstreamInputImage[];
}

export interface UpstreamImage {
  mime: string;
  bytes: Buffer;
}

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

function baseUrl(): string {
  return process.env.SPARKCODE_API_BASE_URL ?? DEFAULT_BASE;
}

function keyForGroup(group: 'codex' | 'banana'): string {
  const env =
    group === 'codex'
      ? process.env.SPARKCODE_CODEX_KEY
      : process.env.SPARKCODE_BANANA_KEY;
  if (!env) {
    throw new Error(
      `Missing env: SPARKCODE_${group === 'codex' ? 'CODEX' : 'BANANA'}_KEY`,
    );
  }
  return env;
}

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'bin';
}

function decodeB64Json(b64: string): UpstreamImage {
  // Upstream sends raw base64 (no data: prefix) for /v1/images/* endpoints.
  return { mime: 'image/png', bytes: Buffer.from(b64, 'base64') };
}

function decodeDataUrl(url: string): UpstreamImage | null {
  // Accept the raw data URL OR a markdown image wrapper `![...](data:...)`
  // — sparkcode.top returns the Gemini image as markdown.
  const m = url.match(/data:([^;]+);base64,([A-Za-z0-9+/=]+)/);
  if (!m) return null;
  return { mime: m[1]!, bytes: Buffer.from(m[2]!, 'base64') };
}

/** Main entry point. Routes per model.endpoint. */
export async function generate(input: GenerateInput): Promise<UpstreamImage[]> {
  const model = getModel(input.model);
  if (!model) throw new Error(`Unknown model: ${input.model}`);

  if (!model.capabilities.imageInput && (input.inputImages?.length ?? 0) > 0) {
    throw new Error(`Model ${model.id} does not support image inputs`);
  }

  if (model.endpoint === 'images') {
    return generateViaImages(model, input);
  }
  return generateViaChat(model, input);
}

// ─── OpenAI-compatible (gpt-image-*) ──────────────────────────────────

async function generateViaImages(
  model: StudioModel,
  input: GenerateInput,
): Promise<UpstreamImage[]> {
  const key = keyForGroup(model.group);
  const size = input.size ?? model.defaultSize ?? '1024x1024';

  const effectivePrompt = buildEffectivePrompt({
    prompt: input.prompt,
    refs: input.inputImages ?? [],
  });

  const hasInputs = (input.inputImages?.length ?? 0) > 0;
  const url = hasInputs
    ? `${baseUrl()}/images/edits`
    : `${baseUrl()}/images/generations`;

  let res: Response;
  if (hasInputs) {
    const fd = new FormData();
    fd.append('model', model.id);
    fd.append('prompt', effectivePrompt);
    fd.append('n', String(input.n));
    fd.append('size', size);
    fd.append('response_format', 'b64_json');
    if (input.quality) fd.append('quality', input.quality);
    if (input.background) fd.append('background', input.background);
    for (const img of input.inputImages!) {
      const blob = new Blob([new Uint8Array(img.bytes)], { type: img.mime });
      fd.append('image', blob, `ref.${extForMime(img.mime)}`);
    }
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        prompt: effectivePrompt,
        n: input.n,
        size,
        quality: input.quality ?? 'high',
        background: input.background ?? 'auto',
        response_format: 'b64_json',
        output_format: 'png',
      }),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new UpstreamError(
      `images endpoint failed: ${res.status}`,
      res.status,
      body.slice(0, 1000),
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const out: UpstreamImage[] = [];
  for (const d of json.data ?? []) {
    if (d.b64_json) {
      out.push(decodeB64Json(d.b64_json));
    } else if (d.url) {
      // Some upstreams may return a URL instead. Fetch and store.
      const r = await fetch(d.url);
      const buf = Buffer.from(await r.arrayBuffer());
      out.push({ mime: r.headers.get('content-type') ?? 'image/png', bytes: buf });
    }
  }
  if (out.length === 0) {
    throw new UpstreamError(
      'images endpoint returned no data',
      200,
      JSON.stringify(json).slice(0, 1000),
    );
  }
  return out;
}

// ─── Chat-completions (gemini-*) ─────────────────────────────────────

async function generateViaChat(
  model: StudioModel,
  input: GenerateInput,
): Promise<UpstreamImage[]> {
  const key = keyForGroup(model.group);

  const effectivePrompt = buildEffectivePrompt({
    prompt: input.prompt,
    refs: input.inputImages ?? [],
  });

  // Build the user message content. Plain text if no inputs; multipart
  // (text + image_url[]) otherwise.
  const inputs = input.inputImages ?? [];
  let content: unknown;
  if (inputs.length === 0) {
    content = effectivePrompt;
  } else {
    const parts: Array<Record<string, unknown>> = [
      { type: 'text', text: effectivePrompt },
    ];
    for (const img of inputs) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mime};base64,${img.bytes.toString('base64')}`,
        },
      });
    }
    content = parts;
  }

  // The gateway returns 1 image per call; loop to honour n.
  const out: UpstreamImage[] = [];
  for (let i = 0; i < input.n; i++) {
    const body: Record<string, unknown> = {
      model: model.id,
      messages: [{ role: 'user', content }],
      modalities: ['image', 'text'],
      stream: false,
    };
    const aspect = input.aspectRatio ?? model.defaultAspectRatio;
    if (aspect) {
      body.extra_body = {
        generationConfig: { imageConfig: { aspectRatio: aspect } },
      };
    }

    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new UpstreamError(
        `chat endpoint failed: ${res.status}`,
        res.status,
        text.slice(0, 1000),
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: { content?: unknown };
      }>;
    };
    const msgContent = json.choices?.[0]?.message?.content;
    const img = extractImageFromChatContent(msgContent);
    if (!img) {
      throw new UpstreamError(
        'chat response had no image',
        200,
        JSON.stringify(json).slice(0, 1000),
      );
    }
    out.push(img);
  }
  return out;
}

function extractImageFromChatContent(content: unknown): UpstreamImage | null {
  if (typeof content === 'string') {
    return decodeDataUrl(content);
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (
        part &&
        typeof part === 'object' &&
        'image_url' in part &&
        typeof (part as { image_url?: { url?: string } }).image_url?.url ===
          'string'
      ) {
        const url = (part as { image_url: { url: string } }).image_url.url;
        const decoded = decodeDataUrl(url);
        if (decoded) return decoded;
      }
    }
  }
  return null;
}

export { UpstreamError };
