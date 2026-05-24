/**
 * Registry of upstream image-generation models routed through the
 * sparkcode.top gateway. Two endpoint shapes:
 *
 *   - 'images': OpenAI-compatible /v1/images/generations + /v1/images/edits
 *               (GPT-family image models)
 *   - 'chat':   /v1/chat/completions with modalities:['image','text']
 *               (Gemini image models)
 *
 * Add a row here when you whitelist a new upstream model. The frontend
 * pulls its picker from /api/studio/models, so changes propagate
 * without a redeploy of the UI.
 */

export type ModelGroup = 'codex' | 'banana';
export type ModelEndpoint = 'images' | 'chat';

export interface ModelCapabilities {
  /** Accepts reference images alongside the prompt. */
  imageInput: boolean;
  /** Supports inpainting (edit a masked region). */
  inpaint: boolean;
  /** Supports outpainting (extend the canvas beyond original bounds). */
  outpaint: boolean;
  /** Honors a deterministic seed parameter. */
  seed: boolean;
  /** Can produce images with a transparent background. */
  transparentBackground: boolean;
  /** Supports multi-turn conversational refinement of generated images. */
  multiTurn: boolean;
}

export interface StudioModel {
  /** Exact upstream model string. Passed through to the gateway. */
  id: string;
  /** Short display name shown in the UI picker. */
  label: string;
  /** API key group selects which env var (codex → GPT, banana → Gemini). */
  group: ModelGroup;
  /** Endpoint shape — affects request/response parsing. */
  endpoint: ModelEndpoint;
  /** Default size string (e.g. '1024x1024'). 'images' endpoint only. */
  defaultSize?: string;
  /** Default aspect ratio (e.g. '1:1'). 'chat' endpoint only. */
  defaultAspectRatio?: string;
  /** Max images per single user prompt. */
  maxN: number;
  /** Per-feature capability flags consulted by UI gating + upstream adapter. */
  capabilities: ModelCapabilities;
}

export const MODELS: Record<string, StudioModel> = {
  'gpt-image-2': {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    group: 'codex',
    endpoint: 'images',
    defaultSize: '1024x1024',
    maxN: 4,
    capabilities: {
      imageInput: true,
      inpaint: true,
      outpaint: true,
      seed: true,
      transparentBackground: true,
      multiTurn: false,
    },
  },
  'gemini-3.1-flash-image-preview': {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image',
    group: 'banana',
    endpoint: 'chat',
    defaultAspectRatio: '1:1',
    maxN: 4,
    capabilities: {
      imageInput: true,
      inpaint: false,
      outpaint: false,
      seed: false,
      transparentBackground: false,
      multiTurn: true,
    },
  },
  'gemini-3-pro-image-preview': {
    id: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    group: 'banana',
    endpoint: 'chat',
    defaultAspectRatio: '1:1',
    maxN: 2,
    capabilities: {
      imageInput: true,
      inpaint: false,
      outpaint: false,
      seed: false,
      transparentBackground: false,
      multiTurn: true,
    },
  },
};

export const DEFAULT_MODEL_ID = 'gpt-image-2';

export function getModel(id: string): StudioModel | null {
  return MODELS[id] ?? null;
}

export function listModels(): StudioModel[] {
  return Object.values(MODELS);
}

export function modelSupports(modelId: string, cap: keyof ModelCapabilities): boolean {
  const m = MODELS[modelId];
  return m ? m.capabilities[cap] : false;
}

export function firstModelSupporting(cap: keyof ModelCapabilities): StudioModel | null {
  return listModels().find((m) => m.capabilities[cap]) ?? null;
}
