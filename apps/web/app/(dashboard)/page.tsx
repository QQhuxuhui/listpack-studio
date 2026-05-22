import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Check,
  Sparkles,
  ImageIcon,
  Layers,
  MessagesSquare,
  Wand2,
  Cpu,
} from 'lucide-react';
import { publicPlans } from '@/lib/payments/plans';

export default async function HomePage() {
  const plans = publicPlans();

  return (
    <main className="bg-white">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" /> 多模型 AI 出图工作台
          </span>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight sm:text-5xl lg:text-6xl">
            一句话画图,
            <span className="block text-orange-500">一张图改图。</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            ListPack Studio 把 GPT 与 Gemini 系列出图模型整合到同一个对话界面 ——
            文生图、图生图、参考图编辑,一次搞定。
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="rounded-full text-base px-6">
                免费开始
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full text-base px-6"
              >
                查看价格
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            无需信用卡 · 每月赠 5 张 · 随时取消
          </p>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-3">
            三步出图
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            登录就是一个对话框,告诉它你想要什么,模型直接给图。
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <Step
              n={1}
              icon={<MessagesSquare className="h-5 w-5" />}
              title="描述你想要的画面"
              body="中文 / 英文都行,可选数量、尺寸或比例。需要图生图就拖一张参考图进来。"
            />
            <Step
              n={2}
              icon={<Wand2 className="h-5 w-5" />}
              title="选模型,一键生成"
              body="GPT Image / Gemini 3.1 Flash / Gemini 3 Pro,按风格和速度自由切换。"
            />
            <Step
              n={3}
              icon={<ImageIcon className="h-5 w-5" />}
              title="下载、再迭代"
              body="所有产出按对话保留,可以接着追问微调,也可以下载本地。"
            />
          </div>
        </div>
      </section>

      {/* ── Value props ─────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-12">
            为什么选 ListPack Studio
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Value
              icon={<Cpu className="h-5 w-5" />}
              title="多模型同台"
              body="把 GPT 与 Gemini 的图像模型放在同一个对话里,按需切,不必跨平台。"
            />
            <Value
              icon={<Layers className="h-5 w-5" />}
              title="文生图 + 图生图"
              body="纯文本 prompt 也好,拖一张参考图也好,接口都封装好,模型自动按形态走。"
            />
            <Value
              icon={<MessagesSquare className="h-5 w-5" />}
              title="对话式迭代"
              body="每次出图都挂在对话里,可以追问继续改、下载、再当作输入 —— 工作流不被打断。"
            />
            <Value
              icon={<Sparkles className="h-5 w-5" />}
              title="中文 prompt 友好"
              body="自带中文优化,不必为了出图临时切英文,直接用你的口语表达。"
            />
            <Value
              icon={<Check className="h-5 w-5" />}
              title="配额透明"
              body="按张计费,提前公示,绝不自动升档。免费档每月 5 张,慢慢用、不焦虑。"
            />
            <Value
              icon={<ArrowRight className="h-5 w-5" />}
              title="即插即走"
              body="不需要配 API Key、不需要选 GPU,登录就用。所有云端账户和密钥我们这边管。"
            />
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ──────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-3">
            按你的用量付费
          </h2>
          <p className="text-gray-600 mb-10 max-w-2xl mx-auto">
            免费起步,出图多了再升档。超额费率提前公示,永远不会比升一档贵。
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`p-5 rounded-lg border bg-white text-left ${
                  plan.id === 'pro'
                    ? 'border-orange-400'
                    : 'border-gray-200'
                }`}
              >
                <p className="text-sm text-gray-500 mb-1">
                  {plan.displayName}
                </p>
                <p className="text-2xl font-semibold text-gray-900 mb-1">
                  {plan.monthlyPriceCents !== null
                    ? `$${plan.monthlyPriceCents / 100}`
                    : '定制'}
                  {plan.monthlyPriceCents !== null && (
                    <span className="text-sm font-normal text-gray-500">
                      {' '}
                      /月
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-600">
                  {plan.skuQuota} 张 / 月
                  {plan.overagePerSkuUsd !== null
                    ? `,超额 $${plan.overagePerSkuUsd}`
                    : ',不允许超额'}
                </p>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="inline-block mt-8">
            <Button variant="outline" className="rounded-full">
              查看完整价格表
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-12">
            常见问题
          </h2>
          <div className="space-y-6">
            <FAQ
              q="支持哪些模型?"
              a="目前接入 GPT Image 系列、Gemini 3.1 Flash Image、Gemini 3 Pro Image。后续会陆续加入更多。免费档可用 Gemini,Pro 档解锁 GPT Image。"
            />
            <FAQ
              q="可以用自己的 API Key 吗?"
              a="MVP 阶段使用我们统一的中转网关,密钥由服务端持有 —— 你不必维护任何上游账号。后续会开放 BYO Key 模式。"
            />
            <FAQ
              q="数据会留多久?"
              a="对话和产出按工作区独立隔离,默认长期保留,可在账号设置里手动删除。我们不会用你的产出训练任何模型。"
            />
            <FAQ
              q="可以随时取消吗?"
              a="可以。付费档按月计费,取消后当前周期结束停扣,历史产出 30 天内仍可下载。Pro 以上首次开通带 7 天全额退款。"
            />
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-3">
            5 张免费配额,立即开画
          </h2>
          <p className="text-gray-600 mb-8">
            注册即用 —— 不要 API Key、不要 GPU、不要等待审核。
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="rounded-full text-base px-8">
              创建免费账号
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="py-12 border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-sm text-gray-500 flex flex-col md:flex-row justify-between gap-4">
          <span>© {new Date().getFullYear()} ListPack Studio</span>
          <nav className="flex gap-6">
            <Link href="/pricing">价格</Link>
            <Link href="/sign-up">注册</Link>
            <Link href="/sign-in">登录</Link>
            <a
              href="https://github.com/QQhuxuhui/listpack-studio"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="relative pl-14">
      <div className="absolute left-0 top-0 h-10 w-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-semibold">
        {n}
      </div>
      <div className="flex items-center gap-2 mb-2 text-gray-500 text-sm">
        {icon} 第 {n} 步
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function Value({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <div className="h-9 w-9 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-white p-4 open:bg-gray-50">
      <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
        {q}
        <span className="ml-4 text-gray-400 group-open:rotate-45 transition-transform">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">{a}</p>
    </details>
  );
}
