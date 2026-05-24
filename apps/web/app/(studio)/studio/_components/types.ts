import type { ModelCapabilities } from '@/lib/studio/models';
import type { RefRole, RefEntry } from '@/lib/studio/refs-type';

// Re-export so component consumers get one canonical type source
export type { RefRole, RefEntry, ModelCapabilities };

export interface StudioModel {
  id: string;
  label: string;
  group: 'codex' | 'banana';
  endpoint: 'images' | 'chat';
  defaultSize?: string;
  defaultAspectRatio?: string;
  maxN: number;
  capabilities: ModelCapabilities;
}

export interface AssetSummary {
  id: string;
  publicUrl: string;
  mime: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  text: string | null;
  model: string | null;
  params: Record<string, unknown> | null;
  refs: RefEntry[] | null;
  outputAssetIds: string[] | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error: { message?: string } | null;
  createdAt: string;
  completedAt: string | null;
  parentMessageId: string | null;
}

export interface ChatSummary {
  id: string;
  title: string;
}

export interface MoodboardSummary {
  id: string;
  title: string;
  model: string | null;
  coverUrl: string | null;
  updatedAt: string;
}

export interface MoodboardDetail extends MoodboardSummary {
  promptTemplate: string;
  size: string | null;
  aspectRatio: string | null;
  refs: Array<RefEntry & { publicUrl: string | null; mime: string }>;
  notes: string | null;
}

export interface LibraryItem {
  assetId: string;
  publicUrl: string;
  mime: string;
  createdAt: string;
  model: string | null;
  chatId: string;
  chatTitle: string;
  messageId: string;
  promptExcerpt: string;
}

/** 已解析 publicUrl 的 ref 条目 — Composer / Moodboard / Lightbox 共用 */
export interface RefWithUrl extends RefEntry {
  publicUrl: string;
}

/**
 * 由 Moodboard 应用、Remix、空状态样例 prompt 注入到 Composer 的"预设"状态。
 * Composer useEffect 监听后填入对应字段并调用 consumePreset() 清除。
 */
export interface PresetState {
  prompt?: string;
  model?: string;
  size?: string;
  aspectRatio?: string;
  refs?: RefWithUrl[];
  moodboardId?: string;
  parentMessageId?: string;
  focus?: boolean;  // 是否 autofocus textarea（Remix 时 true）
}
