import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Sparkles,
  Workflow,
  Image as ImageIcon,
  Layers,
  Globe,
} from 'lucide-react';
import { publicPlans } from '@/lib/payments/plans';
import { getDictionary } from '@/lib/i18n/dictionary';

export default async function HomePage() {
  const plans = publicPlans();
  const { t } = await getDictionary();

  return (
    <main className="bg-white">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" /> {t.landing.badge}
          </span>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight sm:text-5xl lg:text-6xl">
            {t.landing.hero_h1_a}{' '}
            <span className="block text-orange-500">
              {t.landing.hero_h1_b}
            </span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            {t.landing.hero_sub}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="rounded-full text-base px-6">
                {t.landing.cta_start_free}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full text-base px-6"
              >
                {t.landing.cta_see_pricing}
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-500">{t.landing.trust_line}</p>
        </div>
      </section>

      {/* ── Platform badges ──────────────────────────────────────────── */}
      <section className="py-8 bg-gray-50 border-y border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500 mb-4 uppercase tracking-wider">
            {t.landing.platforms_label}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-gray-700 font-medium">
            <span>Amazon</span>
            <span className="text-gray-300">·</span>
            <span>Shopify</span>
            <span className="text-gray-300">·</span>
            <span>eBay</span>
            <span className="text-gray-300">·</span>
            <span>Temu</span>
            <span className="text-gray-300">·</span>
            <span>SHEIN</span>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-3">
            {t.landing.how_h2}
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            {t.landing.how_sub}
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <Step
              n={1}
              icon={<ImageIcon className="h-5 w-5" />}
              title={t.landing.step1_title}
              body={t.landing.step1_body}
            />
            <Step
              n={2}
              icon={<Workflow className="h-5 w-5" />}
              title={t.landing.step2_title}
              body={t.landing.step2_body}
            />
            <Step
              n={3}
              icon={<Layers className="h-5 w-5" />}
              title={t.landing.step3_title}
              body={t.landing.step3_body}
            />
          </div>
        </div>
      </section>

      {/* ── Value props ─────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-12">
            {t.landing.values_h2}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Value
              icon={<ShieldCheck className="h-5 w-5" />}
              title="先合规,再生成"
              body="34+ 条来自 Amazon / Shopify / eBay / Temu / SHEIN 的内置规则,先对原图做合规检查,再决定是否烧 LLM token。"
            />
            <Value
              icon={<Sparkles className="h-5 w-5" />}
              title="真 Agent,不是单条 Prompt"
              body="Planner agent 按意图决定运行哪些执行器(场景图 / A+ / banner),critic 闭环修瑕疵,带阻尼防止震荡。"
            />
            <Value
              icon={<Layers className="h-5 w-5" />}
              title="一次跑完 9 个平台位"
              body="Amazon 主图 / Shopify featured / eBay 首图 / Temu hero / SHEIN PDP —— 自动尺寸、留白、烙水印,无需手动裁切。"
            />
            <Value
              icon={<Globe className="h-5 w-5" />}
              title="符合欧盟 AI 法案"
              body="每张生成图都带 C2PA XMP 元数据声明 AI 来源 —— 不靠外挂工具就能满足 2026 年披露要求。"
            />
            <Value
              icon={<Workflow className="h-5 w-5" />}
              title="人机协同"
              body="任何任务可暂停、取消、分叉,可从持久化状态续跑,团队可中途介入,不必从头重来。"
            />
            <Value
              icon={<Check className="h-5 w-5" />}
              title="价格透明"
              body="配额和超额单价提前公示,绝不自动升档。在用户协议中明确承诺 —— 详见 /pricing 页脚。"
            />
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ──────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-3">
            {t.landing.pricing_teaser_h2}
          </h2>
          <p className="text-gray-600 mb-10 max-w-2xl mx-auto">
            {t.landing.pricing_teaser_sub}
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
                  {plan.skuQuota} SKU / 月
                  {plan.overagePerSkuUsd !== null
                    ? `,超额 $${plan.overagePerSkuUsd}`
                    : ',不允许超额'}
                </p>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="inline-block mt-8">
            <Button variant="outline" className="rounded-full">
              {t.landing.pricing_teaser_link}
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
              q="和 Photoroom / Booth.ai / Pebblely 有什么不同?"
              a="那些工具一次生成一张图。ListPack 跑一个 Agent —— 先做合规检查,再规划素材包,逐张生成,critic 闭环修瑕疵,并按各平台尺寸出图。你拿到的是一份可直接送审的素材包,而不是一堆需要再筛的图。"
            />
            <FAQ
              q="你们会保存我的商品图吗?"
              a="原图只在你设定的保留期内留存(默认 30 天,免费版 7 天)。所有输出归你所有可随时导出 —— 我们绝不会用你的素材训练模型。"
            />
            <FAQ
              q="欧盟 AI 法案披露怎么办?"
              a="每张生成图都内嵌 C2PA XMP 元数据声明 AI 来源。从 2026 年 8 月起,进口商可直接据此证明素材出处,无需额外工具。"
            />
            <FAQ
              q="可以随时取消吗?"
              a="可以。付费档提供 7 或 14 天全额退款(因档位而异,详见 /pricing)。取消后当前计费周期结束停扣,导出权限再保留 30 天。"
            />
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-3">
            {t.landing.final_cta_h2}
          </h2>
          <p className="text-gray-600 mb-8">{t.landing.final_cta_sub}</p>
          <Link href="/sign-up">
            <Button size="lg" className="rounded-full text-base px-8">
              {t.landing.final_cta_btn}
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
            <a href="https://github.com/QQhuxuhui/listpack-studio" target="_blank" rel="noreferrer">
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
