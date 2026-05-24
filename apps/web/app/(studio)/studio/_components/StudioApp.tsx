'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChatSidebar } from './ChatSidebar';
import { ChatCanvas } from './ChatCanvas';
import { PromptComposer } from './PromptComposer';
import type {
  ChatDetail,
  ChatSummary,
  ModelsResponse,
} from './types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function StudioApp() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const { data: chatsResp, mutate: mutateChats } = useSWR<{
    chats: ChatSummary[];
  }>('/api/studio/chats', fetcher);
  // Memoise so useEffect deps stay stable across renders that return
  // the same SWR cache snapshot.
  const chats = useMemo<ChatSummary[]>(
    () => chatsResp?.chats ?? [],
    [chatsResp],
  );

  const { data: modelsResp } = useSWR<ModelsResponse>(
    '/api/studio/models',
    fetcher,
  );

  const { data: detail, mutate: mutateDetail } = useSWR<ChatDetail>(
    selectedChatId ? `/api/studio/chats/${selectedChatId}` : null,
    fetcher,
  );

  // Auto-select the most-recent chat (or create one) when the user
  // first opens /studio.
  useEffect(() => {
    if (selectedChatId) return;
    if (!chatsResp) return;
    if (chats.length > 0) {
      setSelectedChatId(chats[0]!.id);
      return;
    }
    // No chats yet — create one synchronously then select it.
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

  const assetMap = useMemo(() => {
    const m = new Map<string, ChatDetail['assets'][number]>();
    for (const a of detail?.assets ?? []) m.set(a.id, a);
    return m;
  }, [detail]);

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
          messages={detail?.messages ?? []}
          assetMap={assetMap}
          loading={!!selectedChatId && !detail}
        />
        {selectedChatId && modelsResp && (
          <PromptComposer
            chatId={selectedChatId}
            models={modelsResp.models}
            defaultModel={modelsResp.defaultModel}
            onGenerated={handleGenerated}
            presetState={null}
            consumePreset={() => {}}
            pendingGenerate={false}
            onOpenMoodboardDrawer={() => {}}
          />
        )}
      </div>
    </div>
  );
}
