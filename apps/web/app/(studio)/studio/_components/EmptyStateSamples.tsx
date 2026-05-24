'use client';
import { Sparkles } from 'lucide-react';

export interface SamplePrompt {
  title: string;
  prompt: string;
  modelId: string;
  thumb: string;  // emoji 或单字符当占位
}

const SAMPLES: SamplePrompt[] = [
  {
    title: '写实产品图',
    prompt: '白底，柔光，45 度俯角的陶瓷咖啡杯特写，杯口飘起淡淡蒸汽，电商主图风格',
    modelId: 'gpt-image-2',
    thumb: '☕',
  },
  {
    title: '极简插画',
    prompt: '极简扁平插画风格，一只橙色小猫坐在月亮上看书，柔和粉紫色背景',
    modelId: 'gemini-3.1-flash-image-preview',
    thumb: '🌙',
  },
  {
    title: '赛博朋克场景',
    prompt: '雨夜的霓虹街道，蒸汽朋克未来城市，电影质感，超广角',
    modelId: 'gemini-3-pro-image-preview',
    thumb: '🌃',
  },
  {
    title: '多图融合（i2i）',
    prompt: '把参考图里的猫穿上飞行夹克，背景换成沙漠日落',
    modelId: 'gpt-image-2',
    thumb: '✈️',
  },
];

export function EmptyStateSamples({ onPick }: { onPick: (s: SamplePrompt) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <Sparkles className="h-8 w-8 text-orange-300 mb-3" />
      <p className="text-sm text-gray-600 mb-5">描述你想生成的图像，或从下方示例开始</p>
      <div className="grid grid-cols-2 gap-3 max-w-2xl w-full">
        {SAMPLES.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s)}
            className="flex items-start gap-3 text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-orange-300 transition"
          >
            <div className="text-2xl shrink-0">{s.thumb}</div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">{s.title}</div>
              <div className="text-xs text-gray-500 line-clamp-2">{s.prompt}</div>
              <div className="text-[10px] text-orange-500 mt-1">{s.modelId}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
