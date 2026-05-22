'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudioModel } from './types';

interface Props {
  chatId: string;
  models: StudioModel[];
  defaultModel: string;
  onGenerated: () => void;
}

interface PendingRef {
  id: string;
  publicUrl: string;
}

export function PromptComposer({
  chatId,
  models,
  defaultModel,
  onGenerated,
}: Props) {
  const [text, setText] = useState('');
  const [modelId, setModelId] = useState(defaultModel);
  const [n, setN] = useState<number>(1);
  const [size, setSize] = useState<string>('1024x1024');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [refs, setRefs] = useState<PendingRef[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const model = models.find((m) => m.id === modelId) ?? models[0];

  // Clamp n when the user switches to a model with a smaller maxN.
  useEffect(() => {
    if (model && n > model.maxN) setN(model.maxN);
  }, [model, n]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (refs.length >= 4) {
      setError('最多附加 4 张参考图');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', 'user_upload');
    fd.append('category', 'studio');
    const res = await fetch('/api/assets', { method: 'POST', body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? '上传失败');
      return;
    }
    const json = (await res.json()) as { id: string; publicUrl: string };
    setRefs((cur) => [...cur, { id: json.id, publicUrl: json.publicUrl }]);
  }

  async function handleSubmit() {
    const prompt = text.trim();
    if (!prompt || pending || !model) return;
    setPending(true);
    setError(null);
    try {
      const body = {
        prompt,
        model: model.id,
        n,
        ...(model.endpoint === 'images' ? { size } : { aspectRatio }),
        ...(refs.length > 0 ? { refAssetIds: refs.map((r) => r.id) } : {}),
      };
      const res = await fetch(`/api/studio/chats/${chatId}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.message ?? j.error ?? `请求失败 (${res.status})`);
        return;
      }
      setText('');
      setRefs([]);
      onGenerated();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {error && (
        <div className="text-xs text-red-600 mb-2">{error}</div>
      )}
      {refs.length > 0 && (
        <div className="flex gap-2 mb-2">
          {refs.map((r) => (
            <div key={r.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.publicUrl}
                alt=""
                className="h-12 w-12 object-cover rounded border border-gray-200"
              />
              <button
                type="button"
                className="absolute -top-1 -right-1 bg-white border border-gray-300 rounded-full p-0.5"
                onClick={() => setRefs((cur) => cur.filter((x) => x.id !== r.id))}
                title="移除"
              >
                <X className="h-3 w-3 text-gray-600" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          title="附加参考图"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending || !model?.supportsImg2Img}
          className="text-gray-500 hover:text-orange-500 disabled:text-gray-300 self-center"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          rows={2}
          placeholder="描述你想生成的图像… (⌘/Ctrl+Enter 提交)"
          disabled={pending}
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <Button onClick={handleSubmit} disabled={pending || !text.trim()}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <label className="flex items-center gap-1">
          <span className="text-gray-500">模型</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={pending}
            className="rounded border border-gray-300 px-1.5 py-0.5"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-gray-500">数量</span>
          <select
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            disabled={pending}
            className="rounded border border-gray-300 px-1.5 py-0.5"
          >
            {Array.from({ length: model?.maxN ?? 1 }, (_, i) => i + 1).map(
              (k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ),
            )}
          </select>
        </label>
        {model?.endpoint === 'images' ? (
          <label className="flex items-center gap-1">
            <span className="text-gray-500">尺寸</span>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              disabled={pending}
              className="rounded border border-gray-300 px-1.5 py-0.5"
            >
              <option value="1024x1024">1024×1024</option>
              <option value="1024x1792">1024×1792 (竖)</option>
              <option value="1792x1024">1792×1024 (横)</option>
            </select>
          </label>
        ) : (
          <label className="flex items-center gap-1">
            <span className="text-gray-500">比例</span>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              disabled={pending}
              className="rounded border border-gray-300 px-1.5 py-0.5"
            >
              <option value="1:1">1:1</option>
              <option value="3:4">3:4</option>
              <option value="4:3">4:3</option>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
            </select>
          </label>
        )}
        {!model?.supportsImg2Img && refs.length === 0 && (
          <span className="text-gray-400">(当前模型不支持参考图)</span>
        )}
      </div>
    </div>
  );
}
