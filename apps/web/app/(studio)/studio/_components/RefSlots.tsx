'use client';
import { X } from 'lucide-react';
import type { RefRole, RefWithUrl, StudioModel } from './types';

interface RefSlotsProps {
  refs: RefWithUrl[];
  model: StudioModel;
  onRemove: (asset_id: string) => void;
}

const ROLE_LABEL: Record<RefRole, string> = {
  content: '内容参考',
  style: '风格参考',
  character: '主体一致',
};
const ROLE_RING: Record<RefRole, string> = {
  content: 'ring-gray-300',
  style: 'ring-purple-300',
  character: 'ring-emerald-300',
};

export function RefSlots({ refs, model, onRemove }: RefSlotsProps) {
  if (refs.length === 0) return null;

  const groups: Array<{ role: RefRole; entries: RefWithUrl[] }> = (
    [
      { role: 'content', entries: refs.filter((r) => r.role === 'content') },
      { role: 'style', entries: refs.filter((r) => r.role === 'style') },
      { role: 'character', entries: refs.filter((r) => r.role === 'character') },
    ] as Array<{ role: RefRole; entries: RefWithUrl[] }>
  ).filter((g) => g.entries.length > 0);

  return (
    <div className="flex gap-6 flex-wrap mb-2">
      {groups.map(({ role, entries }) => {
        const stale = role === 'character' && !model.capabilities.multiTurn;
        return (
          <div key={role}>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              {ROLE_LABEL[role]}
              {stale && <span className="ml-1 text-amber-500">· 该模型不读取</span>}
            </div>
            <div className="flex gap-2">
              {entries.map((r) => (
                <div key={r.asset_id} className={`relative h-12 w-12 ring-2 rounded ${ROLE_RING[role]} ${stale ? 'opacity-50' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.publicUrl} alt="" className="w-full h-full object-cover rounded" />
                  <button
                    type="button"
                    onClick={() => onRemove(r.asset_id)}
                    className="absolute -top-1 -right-1 bg-white border border-gray-300 rounded-full p-0.5"
                    title="移除"
                  >
                    <X className="h-3 w-3 text-gray-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
