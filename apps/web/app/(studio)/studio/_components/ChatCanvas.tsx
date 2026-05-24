'use client';

import { useEffect, useRef } from 'react';
import { Download, Sparkles, ImageIcon, RotateCw } from 'lucide-react';
import type { AssetSummary, ChatMessage, RefRole } from './types';
import { EmptyStateSamples, type SamplePrompt } from './EmptyStateSamples';

interface Props {
  messages: ChatMessage[];
  assetMap: Map<string, AssetSummary>;
  loading: boolean;
  pendingGenerate: boolean;
  onOpenLightbox: (asset: AssetSummary, msg: ChatMessage) => void;
  onCardReroll: (msg: ChatMessage) => void;
  onPickSample: (s: SamplePrompt) => void;
}

const ROLE_RING: Record<RefRole, string> = {
  content: 'ring-gray-300',
  style: 'ring-purple-300',
  character: 'ring-emerald-300',
};

export function ChatCanvas({ messages, assetMap, loading, pendingGenerate, onOpenLightbox, onCardReroll, onPickSample }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
        加载对话中…
      </div>
    );
  }

  if (messages.length === 0) {
    return <EmptyStateSamples onPick={onPickSample} />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
      {messages.map((m) => (
        <MessageBlock
          key={m.id}
          message={m}
          assetMap={assetMap}
          pendingGenerate={pendingGenerate}
          onOpenLightbox={onOpenLightbox}
          onCardReroll={onCardReroll}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function MessageBlock({
  message,
  assetMap,
  pendingGenerate,
  onOpenLightbox,
  onCardReroll,
}: {
  message: ChatMessage;
  assetMap: Map<string, AssetSummary>;
  pendingGenerate: boolean;
  onOpenLightbox: (asset: AssetSummary, msg: ChatMessage) => void;
  onCardReroll: (msg: ChatMessage) => void;
}) {
  if (message.role === 'user') {
    const refs = (message.refs ?? []).map((r) => {
      const asset = assetMap.get(r.asset_id);
      return asset ? { role: r.role, asset } : null;
    }).filter((x): x is { role: RefRole; asset: AssetSummary } => !!x);
    return (
      <div className="flex flex-col items-end">
        {refs.length > 0 && (
          <div className="flex gap-2 mb-2">
            {refs.map((r) => (
              <div key={r.asset.id} className={`h-12 w-12 ring-2 rounded ${ROLE_RING[r.role]}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.asset.publicUrl} alt="" className="w-full h-full object-cover rounded" />
              </div>
            ))}
          </div>
        )}
        <div className="max-w-[80%] rounded-2xl bg-orange-500 text-white px-4 py-2 text-sm whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    );
  }

  // assistant
  if (message.status === 'generating' || message.status === 'pending') {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Sparkles className="h-4 w-4 animate-pulse text-orange-400" />
        正在生成{' '}
        {typeof message.params?.n === 'number' ? `${message.params.n} ` : ''}
        张图像…
      </div>
    );
  }

  if (message.status === 'failed') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        生成失败:{message.error?.message ?? '未知错误'}
      </div>
    );
  }

  const outputs = (message.outputAssetIds ?? [])
    .map((id) => assetMap.get(id))
    .filter((a): a is AssetSummary => !!a);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <ImageIcon className="h-3 w-3" />
        <span>{message.model}</span>
        {message.params?.size != null && (
          <span>· {String(message.params.size)}</span>
        )}
        {message.params?.aspectRatio != null && (
          <span>· {String(message.params.aspectRatio)}</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {outputs.map((a) => (
          <OutputThumb
            key={a.id}
            asset={a}
            pendingGenerate={pendingGenerate}
            onOpen={() => onOpenLightbox(a, message)}
            onReroll={() => onCardReroll(message)}
          />
        ))}
      </div>
    </div>
  );
}

function OutputThumb({
  asset,
  pendingGenerate,
  onOpen,
  onReroll,
}: {
  asset: AssetSummary;
  pendingGenerate: boolean;
  onOpen: () => void;
  onReroll: () => void;
}) {
  return (
    <div className="relative group aspect-square w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.publicUrl}
        alt=""
        className="w-full h-full object-cover rounded-md border border-gray-200 bg-white cursor-zoom-in"
        onClick={onOpen}
      />
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          type="button"
          disabled={pendingGenerate}
          onClick={(e) => { e.stopPropagation(); onReroll(); }}
          className="rounded-full bg-white/90 p-1.5 shadow disabled:opacity-50 disabled:cursor-not-allowed"
          title={pendingGenerate ? '上次生成还在进行中' : 'Reroll'}
        >
          <RotateCw className="h-3.5 w-3.5 text-gray-700" />
        </button>
        <a href={asset.publicUrl} download className="rounded-full bg-white/90 p-1.5 shadow" title="下载" onClick={(e) => e.stopPropagation()}>
          <Download className="h-3.5 w-3.5 text-gray-700" />
        </a>
      </div>
    </div>
  );
}
