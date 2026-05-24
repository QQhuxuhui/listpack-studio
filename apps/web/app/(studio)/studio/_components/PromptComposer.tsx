'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Paperclip, Send, Loader2, Settings, BookOpen, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PresetState, RefRole, RefWithUrl, StudioModel } from './types';
import { RefSlots } from './RefSlots';
import { SettingsDrawer, type SettingsState } from './SettingsDrawer';
import { CapabilityGated } from './CapabilityGated';

interface Props {
  chatId: string;
  models: StudioModel[];
  defaultModel: string;
  presetState: PresetState | null;
  consumePreset: () => void;
  onGenerated: () => void;
  pendingGenerate: boolean;
  onOpenMoodboardDrawer: () => void;
}

export interface ComposerHandle {
  getSnapshot(): {
    prompt: string;
    model: string;
    size: string;
    aspectRatio: string;
    refs: RefWithUrl[];
  };
}

export const PromptComposer = forwardRef<ComposerHandle, Props>(function PromptComposer(
  { chatId, models, defaultModel, presetState, consumePreset, onGenerated, pendingGenerate, onOpenMoodboardDrawer },
  ref,
) {
  const [text, setText] = useState('');
  const [modelId, setModelId] = useState(defaultModel);
  const [n, setN] = useState(1);
  const [size, setSize] = useState('1024x1024');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [refs, setRefs] = useState<RefWithUrl[]>([]);
  const [conversational, setConversational] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    quality: 'auto', seed: null, transparentBackground: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [moodboardId, setMoodboardId] = useState<string | null>(null);
  const [parentMessageId, setParentMessageId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [pendingUploadRole, setPendingUploadRole] = useState<RefRole | null>(null);

  const model = models.find((m) => m.id === modelId) ?? models[0]!;

  // Apply preset (from Moodboard or Remix)
  useEffect(() => {
    if (!presetState) return;
    if (presetState.prompt !== undefined) setText(presetState.prompt);
    if (presetState.model) setModelId(presetState.model);
    if (presetState.size) setSize(presetState.size);
    if (presetState.aspectRatio) setAspectRatio(presetState.aspectRatio);
    if (presetState.refs) setRefs(presetState.refs);
    setMoodboardId(presetState.moodboardId ?? null);
    setParentMessageId(presetState.parentMessageId ?? null);
    if (presetState.focus) textRef.current?.focus();
    consumePreset();
  }, [presetState, consumePreset]);

  // Clamp n when switching model
  useEffect(() => {
    if (n > model.maxN) setN(model.maxN);
  }, [model, n]);

  // Auto-close conversational if model loses both capabilities
  useEffect(() => {
    if (conversational && !model.capabilities.imageInput && !model.capabilities.multiTurn) {
      setConversational(false);
      setError('已切换到不支持上下文的模型，对话上下文已关闭');
    }
  }, [model, conversational]);

  // Expose snapshot for Moodboard "save as" flow (Task 16)
  useImperativeHandle(ref, () => ({
    getSnapshot: () => ({ prompt: text, model: modelId, size, aspectRatio, refs }),
  }), [text, modelId, size, aspectRatio, refs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingUploadRole) return;
    if (refs.length >= 8) { setError('最多附加 8 张参考图'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', 'user_upload');
    fd.append('category', 'studio');
    const res = await fetch('/api/assets', { method: 'POST', body: fd });
    if (!res.ok) { setError('上传失败'); return; }
    const json = await res.json() as { id: string; publicUrl: string };
    setRefs((cur) => [...cur, { asset_id: json.id, publicUrl: json.publicUrl, role: pendingUploadRole }]);
    setPendingUploadRole(null);
  }

  function triggerUpload(role: RefRole) {
    setPendingUploadRole(role);
    fileRef.current?.click();
  }

  async function handleSubmit() {
    const prompt = text.trim();
    if (!prompt || submitting || pendingGenerate) return;
    setSubmitting(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        prompt, model: model.id, n,
        ...(model.endpoint === 'images' ? { size } : { aspectRatio }),
        refs: refs.map(({ asset_id, role }) => ({ asset_id, role })),
        ...(conversational ? { conversational: true } : {}),
        ...(moodboardId ? { moodboardId } : {}),
        ...(parentMessageId ? { parentMessageId } : {}),
        ...(settings.seed !== null && model.capabilities.seed ? { seed: settings.seed } : {}),
        ...(settings.transparentBackground && model.capabilities.transparentBackground ? { transparentBackground: true } : {}),
      };
      const res = await fetch(`/api/studio/chats/${chatId}/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.message ?? j.error ?? `请求失败 (${res.status})`);
        return;
      }
      setText(''); setRefs([]); setParentMessageId(null); setMoodboardId(null);
      onGenerated();
    } finally { setSubmitting(false); }
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

      {/* 顶部 toggle 条 */}
      <div className="flex items-center gap-3 mb-2 text-xs">
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 rounded border border-orange-200 text-orange-700 hover:bg-orange-50"
          onClick={onOpenMoodboardDrawer}
          title="Moodboard"
        >
          <BookOpen className="h-3.5 w-3.5" /> Moodboard
        </button>
        <CapabilityGated modelId={model.id} cap="multiTurn" capLabel="对话上下文">
          {({ enabled: nativeMulti }) => {
            const useNative = nativeMulti;
            const useAutoChain = !nativeMulti && model.capabilities.imageInput;
            const possible = useNative || useAutoChain;
            const label = useNative ? '对话上下文' : useAutoChain ? '自动接龙参考图' : '上下文';
            return (
              <button
                type="button"
                className={`flex items-center gap-1 px-2 py-1 rounded border ${conversational ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-300 text-gray-600'} ${!possible ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                onClick={() => possible && setConversational((v) => !v)}
                title={possible ? `点击${conversational ? '关闭' : '开启'}` : '当前模型不支持上下文'}
                disabled={!possible}
              >
                <MessageSquare className="h-3.5 w-3.5" /> {label}
              </button>
            );
          }}
        </CapabilityGated>
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-gray-600">
          <span className="text-gray-400">模型</span>
          <select className="rounded border border-gray-300 px-1.5 py-0.5" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-gray-600">
          <span className="text-gray-400">数量</span>
          <select className="rounded border border-gray-300 px-1.5 py-0.5" value={n} onChange={(e) => setN(Number(e.target.value))}>
            {Array.from({ length: model.maxN }, (_, i) => i + 1).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        {model.endpoint === 'images' ? (
          <label className="flex items-center gap-1 text-gray-600">
            <span className="text-gray-400">尺寸</span>
            <select className="rounded border border-gray-300 px-1.5 py-0.5" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="1024x1024">1024×1024</option>
              <option value="1024x1792">1024×1792</option>
              <option value="1792x1024">1792×1024</option>
            </select>
          </label>
        ) : (
          <label className="flex items-center gap-1 text-gray-600">
            <span className="text-gray-400">比例</span>
            <select className="rounded border border-gray-300 px-1.5 py-0.5" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
              <option value="1:1">1:1</option>
              <option value="3:4">3:4</option>
              <option value="4:3">4:3</option>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
            </select>
          </label>
        )}
        <button type="button" className="rounded border border-gray-300 px-1.5 py-0.5 text-gray-600 hover:bg-gray-50" onClick={() => setSettingsOpen(true)} title="高级设置">
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Refs 槽位区 */}
      <RefSlots refs={refs} model={model} onRemove={(id) => setRefs((cur) => cur.filter((r) => r.asset_id !== id))} />

      {/* 主输入行 */}
      <div className="flex items-end gap-2">
        <button
          type="button"
          title="附加参考图"
          disabled={!model.capabilities.imageInput || submitting || pendingGenerate}
          onClick={() => {
            // 弹个最简 role picker：用 prompt() 临时实现，Phase 1 内可换 native menu
            const choice = window.prompt('参考图角色: c=内容 / s=风格 / r=主体一致', 'c');
            const role: RefRole | null = choice === 'c' ? 'content' : choice === 's' ? 'style' : choice === 'r' ? 'character' : null;
            if (!role) return;
            if (role === 'character' && !model.capabilities.multiTurn) {
              alert('当前模型不支持 character 角色，请切换到 Gemini');
              return;
            }
            triggerUpload(role);
          }}
          className="text-gray-500 hover:text-orange-500 disabled:text-gray-300 self-center"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} />
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
          rows={2}
          placeholder="描述你想生成的图像… (⌘/Ctrl+Enter 提交)"
          disabled={submitting || pendingGenerate}
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <span className="text-[10px] text-gray-500 self-center px-2 py-1 bg-gray-50 rounded">本次扣 {n} 张</span>
        <Button onClick={handleSubmit} disabled={submitting || pendingGenerate || !text.trim()}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} model={model} value={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />
    </div>
  );
});
