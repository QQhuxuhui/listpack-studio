'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';

import { ChatSidebar } from './ChatSidebar';
import { ChatCanvas } from './ChatCanvas';
import { PromptComposer, type ComposerHandle } from './PromptComposer';
import { Lightbox } from './Lightbox';
import { DEFAULT_MODEL_ID } from '@/lib/studio/models';

import type {
  AssetSummary,
  ChatMessage,
  ChatSummary,
  PresetState,
  StudioModel,
} from './types';
import type { SamplePrompt } from './EmptyStateSamples';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ChatDetailResponse {
  chat: { id: string; title: string };
  messages: ChatMessage[];
  assets: AssetSummary[];
}

interface ModelsResponse {
  defaultModel: string;
  models: StudioModel[];
}

export function StudioApp() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const { data: chatsResp, mutate: mutateChats } = useSWR<{
    chats: ChatSummary[];
  }>('/api/studio/chats', fetcher);
  const chats = useMemo<ChatSummary[]>(
    () => chatsResp?.chats ?? [],
    [chatsResp],
  );

  const { data: modelsResp } = useSWR<ModelsResponse>(
    '/api/studio/models',
    fetcher,
  );
  const models = useMemo<StudioModel[]>(() => modelsResp?.models ?? [], [modelsResp]);
  const defaultModelId = modelsResp?.defaultModel ?? DEFAULT_MODEL_ID;

  const { data: detail, mutate: mutateDetail } = useSWR<ChatDetailResponse>(
    selectedChatId ? `/api/studio/chats/${selectedChatId}` : null,
    fetcher,
  );
  const messages = useMemo<ChatMessage[]>(() => detail?.messages ?? [], [detail]);
  const assetMap = useMemo(() => {
    const m = new Map<string, AssetSummary>();
    for (const a of detail?.assets ?? []) m.set(a.id, a);
    return m;
  }, [detail]);

  // ─── Auto-select / auto-create first chat ──────────
  useEffect(() => {
    if (selectedChatId) return;
    if (!chatsResp) return;
    if (chats.length > 0) {
      setSelectedChatId(chats[0]!.id);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/studio/chats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { chat: ChatSummary };
      setSelectedChatId(json.chat.id);
      mutateChats();
    })();
    return () => {
      cancelled = true;
    };
  }, [chatsResp, chats, selectedChatId, mutateChats]);

  // ─── New state for Task 15 ─────────────────
  const [pendingGenerateCount, setPendingGenerateCount] = useState(0);
  const [moodboardDrawerOpen, setMoodboardDrawerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ asset: AssetSummary; msg: ChatMessage } | null>(null);
  const [preset, setPreset] = useState<PresetState | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  void moodboardDrawerOpen; void composerRef;  // Task 16 mounts MoodboardDrawer here

  // ─── Chat list handlers ────────────────────
  const handleNewChat = useCallback(async () => {
    const res = await fetch('/api/studio/chats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { chat: ChatSummary };
    setSelectedChatId(json.chat.id);
    mutateChats();
  }, [mutateChats]);

  const handleDeleteChat = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/studio/chats/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      if (selectedChatId === id) setSelectedChatId(null);
      mutateChats();
    },
    [mutateChats, selectedChatId],
  );

  const handleGenerated = useCallback(() => {
    mutateDetail();
    mutateChats();
  }, [mutateDetail, mutateChats]);

  // ─── Generation orchestration ──────────────
  const fireGenerate = useCallback(
    async (body: Record<string, unknown>) => {
      if (!selectedChatId) return;
      setPendingGenerateCount((c) => c + 1);
      try {
        const res = await fetch(`/api/studio/chats/${selectedChatId}/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          alert(j.message ?? j.error ?? `请求失败 (${res.status})`);
          return;
        }
        mutateDetail();
        mutateChats();
      } finally {
        setPendingGenerateCount((c) => c - 1);
      }
    },
    [selectedChatId, mutateDetail, mutateChats],
  );

  const userPromptForMessage = useCallback(
    (msg: ChatMessage): string | null => {
      const idx = messages.findIndex((m) => m.id === msg.id);
      for (let i = idx - 1; i >= 0; i--) {
        const m = messages[i];
        if (m?.role === 'user' && m.text) return m.text;
      }
      return null;
    },
    [messages],
  );

  const handleReroll = useCallback(
    (msg: ChatMessage) => {
      const prompt = userPromptForMessage(msg);
      if (!prompt || !msg.model) return;
      const params = msg.params ?? {};
      const body: Record<string, unknown> = {
        prompt,
        model: msg.model,
        n: typeof params.n === 'number' ? params.n : 1,
        refs: (msg.refs ?? []).map(({ asset_id, role }) => ({ asset_id, role })),
        parentMessageId: msg.id,
      };
      if (params.size) body.size = params.size;
      if (params.aspectRatio) body.aspectRatio = params.aspectRatio;
      void fireGenerate(body);
    },
    [fireGenerate, userPromptForMessage],
  );

  const handleVariations = useCallback(
    (msg: ChatMessage, sourceAssetId: string) => {
      const prompt = userPromptForMessage(msg);
      if (!prompt || !msg.model) return;
      const model = models.find((m2) => m2.id === msg.model);
      const n = Math.min(4, model?.maxN ?? 4);
      const params = msg.params ?? {};
      const baseRefs = (msg.refs ?? []).map(({ asset_id, role }) => ({ asset_id, role }));
      const body: Record<string, unknown> = {
        prompt,
        model: msg.model,
        n,
        refs: [...baseRefs, { asset_id: sourceAssetId, role: 'content' as const }],
        parentMessageId: msg.id,
      };
      if (params.size) body.size = params.size;
      if (params.aspectRatio) body.aspectRatio = params.aspectRatio;
      void fireGenerate(body);
    },
    [fireGenerate, userPromptForMessage, models],
  );

  const handleRemix = useCallback(
    (msg: ChatMessage, sourceAsset: AssetSummary) => {
      const prompt = userPromptForMessage(msg);
      setPreset({
        prompt: prompt ?? '',
        model: msg.model ?? undefined,
        refs: [
          {
            asset_id: sourceAsset.id,
            role: 'content',
            publicUrl: sourceAsset.publicUrl,
          },
        ],
        parentMessageId: msg.id,
        focus: true,
      });
      setLightbox(null);
    },
    [userPromptForMessage],
  );

  const handlePickSample = useCallback((s: SamplePrompt) => {
    setPreset({
      prompt: s.prompt,
      model: s.modelId,
      focus: true,
    });
  }, []);

  // ─── URL ?remix= support ────────────────────
  const search = useSearchParams();
  const remixParam = search?.get('remix') ?? null;
  useEffect(() => {
    if (!remixParam || messages.length === 0) return;
    const msg = messages.find((m) => m.id === remixParam);
    if (!msg) return;
    const firstAssetId = msg.outputAssetIds?.[0];
    if (!firstAssetId) return;
    const asset = assetMap.get(firstAssetId);
    if (!asset) return;
    handleRemix(msg, asset);
    const url = new URL(window.location.href);
    url.searchParams.delete('remix');
    window.history.replaceState({}, '', url.toString());
  }, [remixParam, messages, assetMap, handleRemix]);

  const consumePreset = useCallback(() => setPreset(null), []);

  return (
    <div className="flex h-full">
      <ChatSidebar
        chats={chats}
        selectedId={selectedChatId}
        onSelect={setSelectedChatId}
        onNew={handleNewChat}
        onDelete={handleDeleteChat}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ChatCanvas
          messages={messages}
          assetMap={assetMap}
          loading={!!selectedChatId && !detail}
          pendingGenerate={pendingGenerateCount > 0}
          onOpenLightbox={(asset, msg) => setLightbox({ asset, msg })}
          onCardReroll={handleReroll}
          onPickSample={handlePickSample}
        />
        {selectedChatId && modelsResp && (
          <PromptComposer
            ref={composerRef}
            chatId={selectedChatId}
            models={models}
            defaultModel={defaultModelId}
            presetState={preset}
            consumePreset={consumePreset}
            onGenerated={handleGenerated}
            pendingGenerate={pendingGenerateCount > 0}
            onOpenMoodboardDrawer={() => setMoodboardDrawerOpen(true)}
          />
        )}
      </div>
      <Lightbox
        open={!!lightbox}
        asset={lightbox?.asset ?? null}
        sourceMessage={lightbox?.msg ?? null}
        model={lightbox ? (models.find((m) => m.id === lightbox.msg.model) ?? null) : null}
        pendingGenerate={pendingGenerateCount > 0}
        onClose={() => setLightbox(null)}
        onReroll={() => {
          if (lightbox) handleReroll(lightbox.msg);
        }}
        onVariations={() => {
          if (lightbox) handleVariations(lightbox.msg, lightbox.asset.id);
        }}
        onRemix={() => {
          if (lightbox) handleRemix(lightbox.msg, lightbox.asset);
        }}
      />
      {/* Task 16 will mount MoodboardDrawer here: moodboardDrawerOpen / setMoodboardDrawerOpen / composerRef */}
    </div>
  );
}
