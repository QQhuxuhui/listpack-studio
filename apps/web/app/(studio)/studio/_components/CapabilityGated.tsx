'use client';
import type { ReactNode } from 'react';
import { modelSupports, firstModelSupporting, type ModelCapabilities } from '@/lib/studio/models';

interface GatedProps {
  modelId: string;
  cap: keyof ModelCapabilities;
  capLabel: string;  // 中文显示名，如 "局部重绘"
  children: (gateState: { enabled: boolean; tooltip: string }) => ReactNode;
}

/**
 * 不渲染任何 DOM，只把"是否 enable + tooltip 文案"作为
 * render prop 传给子节点。这样每个被 gate 的控件保留
 * 自己的样式，但拿到一致的 enable/disable 计算和文案。
 */
export function CapabilityGated({ modelId, cap, capLabel, children }: GatedProps) {
  const enabled = modelSupports(modelId, cap);
  let tooltip = '';
  if (!enabled) {
    const alt = firstModelSupporting(cap);
    tooltip = alt
      ? `当前模型不支持${capLabel}，请切换到 ${alt.label}`
      : `当前没有模型支持${capLabel}`;
  }
  return <>{children({ enabled, tooltip })}</>;
}
