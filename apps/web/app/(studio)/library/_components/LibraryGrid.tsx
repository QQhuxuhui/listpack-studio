'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import type {
  LibraryItem,
  StudioModel,
  AssetSummary,
} from '../../studio/_components/types';
import { Lightbox } from '../../studio/_components/Lightbox';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  models: StudioModel[];
}

interface LibraryPageResponse {
  items: LibraryItem[];
  nextCursor: string | null;
}

export function LibraryGrid({ models }: Props) {
  const router = useRouter();
  const [modelFilter, setModelFilter] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [accum, setAccum] = useState<LibraryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LibraryItem | null>(null);

  // Build query string based on current filter + cursor
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    modelFilter.forEach((m) => p.append('model', m));
    if (cursor) p.set('before', cursor);
    return p.toString();
  }, [modelFilter, cursor]);

  const { data } = useSWR<LibraryPageResponse>(
    `/api/studio/library?${qs}`,
    fetcher,
  );

  useEffect(() => {
    if (!data) return;
    if (!cursor) {
      // First load OR filter changed: replace
      setAccum(data.items);
    } else {
      // Pagination: append
      setAccum((prev) => [...prev, ...data.items]);
    }
    setNextCursor(data.nextCursor);
  }, [data, cursor]);

  function toggleModel(id: string) {
    setCursor(null); // reset pagination
    setAccum([]);
    setModelFilter((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function resetFilter() {
    setModelFilter(new Set());
    setCursor(null);
    setAccum([]);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryItem[]>();
    for (const it of accum) {
      const d = new Date(it.createdAt);
      const key = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [accum]);

  function handleRemix(item: LibraryItem) {
    setLightbox(null);
    // Jump back to studio with ?remix=<messageId>; StudioApp auto-selects
    // first chat (or creates one) and the URL effect triggers handleRemix.
    router.push(`/studio?remix=${item.messageId}`);
  }

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-4 flex-wrap">
        {models.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => toggleModel(m.id)}
            className={`text-xs px-3 py-1 rounded-full border ${
              modelFilter.has(m.id)
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            {m.label}
          </button>
        ))}
        {modelFilter.size > 0 && (
          <button
            onClick={resetFilter}
            className="text-xs text-gray-500 hover:underline ml-2"
          >
            重置
          </button>
        )}
      </div>

      {accum.length === 0 && data && (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-3">
            还没生成过图片，去 Studio 开始你的第一张吧
          </p>
          <a
            href="/studio"
            className="inline-block px-4 py-2 bg-orange-500 text-white rounded"
          >
            去 Studio
          </a>
        </div>
      )}

      {grouped.map(([month, group]) => (
        <div key={month} className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{month}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {group.map((it) => (
              <button
                key={it.assetId}
                className="aspect-square overflow-hidden rounded border border-gray-200 hover:border-orange-300"
                onClick={() => setLightbox(it)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.publicUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      ))}

      {nextCursor && (
        <div className="text-center mt-4">
          <button
            onClick={() => setCursor(nextCursor)}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded"
          >
            加载更多
          </button>
        </div>
      )}

      {lightbox &&
        (() => {
          const asset: AssetSummary = {
            id: lightbox.assetId,
            publicUrl: lightbox.publicUrl,
            mime: lightbox.mime,
          };
          const sourceMessage = {
            id: lightbox.messageId,
            chatId: lightbox.chatId,
            role: 'assistant' as const,
            model: lightbox.model,
            text: lightbox.promptExcerpt,
            params: null,
            refs: null,
            outputAssetIds: [lightbox.assetId],
            status: 'completed' as const,
            error: null,
            createdAt: lightbox.createdAt,
            completedAt: null,
            parentMessageId: null,
          };
          const model = models.find((m) => m.id === lightbox.model) ?? null;
          return (
            <Lightbox
              open
              asset={asset}
              sourceMessage={sourceMessage}
              model={model}
              pendingGenerate={false}
              onClose={() => setLightbox(null)}
              onReroll={() =>
                alert('在图库内 Reroll 暂未实现，请进入 Studio 对该图操作')
              }
              onVariations={() => alert('同上')}
              onRemix={() => handleRemix(lightbox)}
            />
          );
        })()}
    </div>
  );
}
