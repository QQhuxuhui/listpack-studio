'use client';

import { useEffect, useRef } from 'react';
import { Download, Sparkles, ImageIcon } from 'lucide-react';
import type { AssetSummary, ChatMessage } from './types';

interface Props {
  messages: ChatMessage[];
  assetMap: Map<string, AssetSummary>;
  loading: boolean;
}

export function ChatCanvas({ messages, assetMap, loading }: Props) {
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
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-8">
        <Sparkles className="h-10 w-10 text-orange-300 mb-3" />
        <p className="text-base font-medium text-gray-700 mb-1">
          描述你想生成的图像
        </p>
        <p className="text-sm">
          支持文生图,也可附加参考图进行图生图编辑。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
      {messages.map((m) => (
        <MessageBlock key={m.id} message={m} assetMap={assetMap} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function MessageBlock({
  message,
  assetMap,
}: {
  message: ChatMessage;
  assetMap: Map<string, AssetSummary>;
}) {
  if (message.role === 'user') {
    const refs = (message.refAssetIds ?? [])
      .map((id) => assetMap.get(id))
      .filter((a): a is AssetSummary => !!a);
    return (
      <div className="flex flex-col items-end">
        {refs.length > 0 && (
          <div className="flex gap-2 mb-2">
            {refs.map((a) => (
              <Thumb key={a.id} asset={a} size="sm" />
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
          <Thumb key={a.id} asset={a} size="lg" />
        ))}
      </div>
    </div>
  );
}

function Thumb({
  asset,
  size,
}: {
  asset: AssetSummary;
  size: 'sm' | 'lg';
}) {
  const box =
    size === 'sm'
      ? 'h-16 w-16'
      : 'aspect-square w-full';
  return (
    <div className={`relative group ${box}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.publicUrl}
        alt=""
        className="w-full h-full object-cover rounded-md border border-gray-200 bg-white"
      />
      {size === 'lg' && (
        <a
          href={asset.publicUrl}
          download
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition rounded-full bg-white/90 p-1.5 shadow"
          title="下载"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-3.5 w-3.5 text-gray-700" />
        </a>
      )}
    </div>
  );
}
