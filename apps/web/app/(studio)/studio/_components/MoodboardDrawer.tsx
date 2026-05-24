'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { X, Plus, Trash2 } from 'lucide-react';
import type { MoodboardSummary, MoodboardDetail, PresetState, RefWithUrl } from './types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  open: boolean;
  onClose: () => void;
  /** 返回当前 Composer 的快照（prompt + model + size + aspectRatio + refs） */
  currentComposerSnapshot: () => {
    prompt: string;
    model: string;
    size: string;
    aspectRatio: string;
    refs: RefWithUrl[];
  };
  /** 应用 Moodboard 后，把详情转成 PresetState 设给 Composer */
  onApply: (preset: PresetState) => void;
}

export function MoodboardDrawer({ open, onClose, currentComposerSnapshot, onApply }: Props) {
  const { data } = useSWR<{ items: MoodboardSummary[] }>(
    open ? '/api/studio/moodboards' : null,
    fetcher,
  );
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [includeState, setIncludeState] = useState(true);

  if (!open) return null;

  async function applyClick(id: string) {
    const res = await fetch(`/api/studio/moodboards/${id}`);
    if (!res.ok) {
      alert('加载 Moodboard 失败');
      return;
    }
    const json = (await res.json()) as { moodboard: MoodboardDetail; warnings?: string[] };
    if (json.warnings?.length) {
      alert(`提示：${json.warnings.join(', ')}`);
    }
    const mb = json.moodboard;
    const preset: PresetState = {
      prompt: mb.promptTemplate,
      model: mb.model ?? undefined,
      size: mb.size ?? undefined,
      aspectRatio: mb.aspectRatio ?? undefined,
      refs: mb.refs
        .filter((r) => r.publicUrl !== null)
        .map((r) => ({ asset_id: r.asset_id, role: r.role, publicUrl: r.publicUrl as string })),
      moodboardId: mb.id,
    };
    onApply(preset);
    onClose();
  }

  async function deleteClick(id: string) {
    if (!confirm('删除该 Moodboard？')) return;
    const res = await fetch(`/api/studio/moodboards/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('删除失败');
      return;
    }
    mutate('/api/studio/moodboards');
  }

  async function createSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const snap = includeState ? currentComposerSnapshot() : null;
    const body: Record<string, unknown> = {
      title: title.trim(),
      promptTemplate: snap?.prompt ?? '',
    };
    if (snap?.model) body.model = snap.model;
    if (snap?.size) body.size = snap.size;
    if (snap?.aspectRatio) body.aspectRatio = snap.aspectRatio;
    if (snap?.refs.length) body.refs = snap.refs.map(({ asset_id, role }) => ({ asset_id, role }));
    if (notes.trim()) body.notes = notes.trim();
    const res = await fetch('/api/studio/moodboards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`创建失败: ${j.error ?? res.status}`);
      return;
    }
    setCreating(false);
    setTitle('');
    setNotes('');
    mutate('/api/studio/moodboards');
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">我的 Moodboard</h3>
          <div className="flex gap-2 items-center">
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="text-xs text-orange-600 hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> 新建
              </button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {creating && (
          <form onSubmit={createSubmit} className="mb-4 space-y-2 p-3 bg-gray-50 rounded">
            <input
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="标题"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="备注（可选）"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeState}
                onChange={(e) => setIncludeState(e.target.checked)}
              />
              快照当前 Composer 状态（prompt / model / refs / 尺寸）
            </label>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setTitle('');
                  setNotes('');
                }}
                className="text-xs px-2 py-1 text-gray-600"
              >
                取消
              </button>
              <button type="submit" className="text-xs px-3 py-1 bg-orange-500 text-white rounded">
                保存
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {(data?.items ?? []).map((mb) => (
            <div
              key={mb.id}
              className="group flex items-center gap-2 p-2 rounded border border-gray-200 hover:border-orange-200 cursor-pointer"
              onClick={() => applyClick(mb.id)}
            >
              <div className="h-10 w-10 rounded bg-gradient-to-br from-amber-200 to-orange-300 shrink-0 overflow-hidden">
                {mb.coverUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={mb.coverUrl} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{mb.title}</div>
                <div className="text-[10px] text-gray-500 truncate">{mb.model ?? '—'}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteClick(mb.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                title="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {data && data.items.length === 0 && !creating && (
            <p className="text-xs text-gray-400 text-center py-6">还没有 Moodboard，点上方「+ 新建」</p>
          )}
        </div>
      </div>
    </div>
  );
}
