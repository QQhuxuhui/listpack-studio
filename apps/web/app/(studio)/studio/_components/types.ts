/**
 * Shared client-side types — mirror what the /api/studio/* routes
 * return. Kept narrow on purpose so the UI doesn't accidentally
 * depend on internal DB shape.
 */

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetSummary {
  id: string;
  mime: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  type: string;
  publicUrl: string;
  createdAt: string;
}

export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface ChatMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  text: string | null;
  model: string | null;
  params: Record<string, unknown> | null;
  refAssetIds: string[] | null;
  outputAssetIds: string[] | null;
  status: MessageStatus;
  error: { message?: string } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ChatDetail {
  chat: ChatSummary;
  messages: ChatMessage[];
  assets: AssetSummary[];
}

export interface StudioModel {
  id: string;
  label: string;
  group: 'codex' | 'banana';
  endpoint: 'images' | 'chat';
  supportsImg2Img: boolean;
  supportsMask: boolean;
  defaultSize?: string;
  defaultAspectRatio?: string;
  maxN: number;
}

export interface ModelsResponse {
  defaultModel: string;
  models: StudioModel[];
}
