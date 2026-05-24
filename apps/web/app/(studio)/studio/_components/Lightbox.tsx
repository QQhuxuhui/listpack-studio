'use client';
import { useEffect } from 'react';
import { X, RotateCw, Grid3x3, Pencil, Download, Move, Maximize2, Lock } from 'lucide-react';
import type { AssetSummary, ChatMessage, StudioModel } from './types';

interface Props {
  open: boolean;
  asset: AssetSummary | null;
  sourceMessage: ChatMessage | null;
  model: StudioModel | null;
  onClose: () => void;
  onReroll: () => void;
  onVariations: () => void;
  onRemix: () => void;
  pendingGenerate: boolean;
}

export function Lightbox({ open, asset, sourceMessage, model, onClose, onReroll, onVariations, onRemix, pendingGenerate }: Props) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open || !asset) return null;

  const inpaintEnabled = !!model?.capabilities.inpaint;
  const outpaintEnabled = !!model?.capabilities.outpaint;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex">
      <div className="flex-1 flex items-center justify-center p-6 cursor-zoom-out" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.publicUrl} alt="" className="max-h-[88vh] max-w-full object-contain rounded shadow-2xl" />
      </div>
      <div className="w-72 bg-zinc-900 text-white p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <div className="text-xs opacity-60">{sourceMessage?.model ?? '—'}</div>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="text-[10px] uppercase opacity-50 mt-2">生成</div>
        <button disabled={pendingGenerate} onClick={onReroll} className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <RotateCw className="h-4 w-4" /> Reroll
        </button>
        <button disabled={pendingGenerate} onClick={onVariations} className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <Grid3x3 className="h-4 w-4" /> Variations
        </button>
        <button disabled={pendingGenerate} onClick={onRemix} className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <Pencil className="h-4 w-4" /> Remix...
        </button>

        <div className="text-[10px] uppercase opacity-50 mt-2">导出</div>
        <a href={asset.publicUrl} download className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm">
          <Download className="h-4 w-4" /> 下载
        </a>

        <div className="text-[10px] uppercase opacity-50 mt-2">高级（capability-gated）</div>
        <button disabled className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 text-sm opacity-40 cursor-not-allowed" title={inpaintEnabled ? '即将上线' : '当前模型不支持局部重绘，请切换到 GPT Image 2'}>
          <Lock className="h-4 w-4" /> Vary Region
        </button>
        <button disabled className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 text-sm opacity-40 cursor-not-allowed" title={outpaintEnabled ? '即将上线' : '当前模型不支持外延，请切换到 GPT Image 2'}>
          <Move className="h-4 w-4" /> Pan
        </button>
        <button disabled className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 text-sm opacity-40 cursor-not-allowed" title={outpaintEnabled ? '即将上线' : '当前模型不支持外延，请切换到 GPT Image 2'}>
          <Maximize2 className="h-4 w-4" /> Zoom Out
        </button>
      </div>
    </div>
  );
}
