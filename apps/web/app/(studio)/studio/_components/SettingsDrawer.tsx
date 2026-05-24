'use client';
import { X, Dice5 } from 'lucide-react';
import type { StudioModel } from './types';
import { CapabilityGated } from './CapabilityGated';

export interface SettingsState {
  quality: 'low' | 'medium' | 'high' | 'auto';
  seed: number | null;
  transparentBackground: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  model: StudioModel;
  value: SettingsState;
  onChange: (patch: Partial<SettingsState>) => void;
}

export function SettingsDrawer({ open, onClose, model, value, onChange }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">高级设置</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        {/* Quality — 仅 endpoint='images' 显示 */}
        {model.endpoint === 'images' && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">质量</label>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={value.quality}
              onChange={(e) => onChange({ quality: e.target.value as SettingsState['quality'] })}
            >
              <option value="auto">自动</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>
        )}

        {/* Seed — capability gated */}
        <CapabilityGated modelId={model.id} cap="seed" capLabel="seed 复现">
          {({ enabled, tooltip }) => (
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Seed</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  value={value.seed ?? ''}
                  onChange={(e) => onChange({ seed: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                  disabled={!enabled}
                  title={!enabled ? tooltip : ''}
                />
                <button
                  type="button"
                  className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => onChange({ seed: Math.floor(Math.random() * 2147483647) })}
                  disabled={!enabled}
                  title={!enabled ? tooltip : '随机生成 seed'}
                >
                  <Dice5 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </CapabilityGated>

        {/* 透明背景 — capability gated */}
        <CapabilityGated modelId={model.id} cap="transparentBackground" capLabel="透明背景">
          {({ enabled, tooltip }) => (
            <label className={`flex items-center gap-2 text-sm ${!enabled ? 'opacity-50 cursor-not-allowed' : ''}`} title={!enabled ? tooltip : ''}>
              <input
                type="checkbox"
                checked={value.transparentBackground}
                onChange={(e) => onChange({ transparentBackground: e.target.checked })}
                disabled={!enabled}
              />
              输出透明背景
            </label>
          )}
        </CapabilityGated>
      </div>
    </div>
  );
}
