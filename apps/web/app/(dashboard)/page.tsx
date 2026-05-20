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

export default function HomePage() {
  const plans = publicPlans();

  return (
    <main className="bg-white">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" /> Listing Pack Agent · v1
          </span>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight sm:text-5xl lg:text-6xl">
            One photo in.{' '}
            <span className="block text-orange-500">
              Review-ready listings out.
            </span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            ListPack Studio turns a single product photo into compliance-checked
            listings for Amazon, Shopify, eBay, Temu and SHEIN — main image,
            multi-platform sizing, A+ content and C2PA-stamped AI disclosure,
            all in one run.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="rounded-full text-base px-6">
                Start free — 5 SKUs / month
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full text-base px-6"
              >
                See pricing
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            No credit card · 7-day refund on every paid tier · cancel anytime
          </p>
        </div>
      </section>

      {/* ── Platform badges ──────────────────────────────────────────── */}
      <section className="py-8 bg-gray-50 border-y border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500 mb-4 uppercase tracking-wider">
            One run, five marketplaces
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
            From photo to first-pass review in 3 steps
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            Our agent runs compliance, image generation, multi-platform sizing
            and AI-disclosure stamping as a single graph — you watch each step
            stream in real time.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <Step
              n={1}
              icon={<ImageIcon className="h-5 w-5" />}
              title="Upload one product photo"
              body="Drop a JPG / PNG / WebP up to 20MB. We check it against the live Amazon / Shopify rule database before any pixel is generated."
            />
            <Step
              n={2}
              icon={<Workflow className="h-5 w-5" />}
              title="Agent plans, generates, refines"
              body="A LangGraph agent picks the right scene template, generates the hero shot, runs a critic loop to fix anything questionable, then resizes for each platform."
            />
            <Step
              n={3}
              icon={<Layers className="h-5 w-5" />}
              title="Export review-ready packs"
              body="Download per-platform image bundles + the AI-disclosure C2PA metadata. Push to Shopify directly (Brand tier) or hand off via CSV."
            />
          </div>
        </div>
      </section>

      {/* ── Value props ─────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-12">
            Why teams pick ListPack over fragmented tools
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Value
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Compliance before generation"
              body="34+ pre-seeded rules from Amazon, Shopify, eBay, Temu and SHEIN — checked against your source before we burn a single LLM token."
            />
            <Value
              icon={<Sparkles className="h-5 w-5" />}
              title="Real Agent, not a single prompt"
              body="A planner agent decides which executors to run (scene / A+ / banner) per intent. A critic loop refines the output. Damped to avoid prompt-swing oscillation."
            />
            <Value
              icon={<Layers className="h-5 w-5" />}
              title="9 platform slots in one pass"
              body="Amazon main / Shopify featured / eBay first / Temu hero / SHEIN PDP — sized, padded and stamped without manual cropping."
            />
            <Value
              icon={<Globe className="h-5 w-5" />}
              title="EU AI Act ready"
              body="Every generated image carries C2PA XMP metadata declaring its AI provenance — meet 2026 disclosure rules without bolt-ons."
            />
            <Value
              icon={<Workflow className="h-5 w-5" />}
              title="Human-in-the-loop"
              body="Pause, cancel, or fork any run. Re-drive from the persisted state. Your team can intervene without rerunning from scratch."
            />
            <Value
              icon={<Check className="h-5 w-5" />}
              title="Transparent pricing"
              body="Quota and overage rates shown up-front. Never auto-upgraded. Promised in the user agreement — see /pricing footer."
            />
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ──────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-3">
            Pricing that scales with your catalogue
          </h2>
          <p className="text-gray-600 mb-10 max-w-2xl mx-auto">
            Start free, upgrade when the SKUs add up. Overage rates are
            calibrated so you never pay more than the next tier.
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
                    : 'Custom'}
                  {plan.monthlyPriceCents !== null && (
                    <span className="text-sm font-normal text-gray-500">
                      {' '}
                      /mo
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-600">
                  {plan.skuQuota} SKUs / month
                  {plan.overagePerSkuUsd !== null
                    ? `, $${plan.overagePerSkuUsd} overage`
                    : ', no overage'}
                </p>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="inline-block mt-8">
            <Button variant="outline" className="rounded-full">
              See full pricing
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-12">
            Frequently asked
          </h2>
          <div className="space-y-6">
            <FAQ
              q="How is this different from Photoroom / Booth.ai / Pebblely?"
              a="Those tools generate one image at a time. ListPack runs an agent that checks compliance, plans the asset bundle, generates each piece, refines via a critic loop and sizes for every platform in one stream. You get a review-ready pack, not a folder of photos to QC."
            />
            <FAQ
              q="Do you store my product photos?"
              a="Source uploads are kept only as long as your retention setting (default 30 days, free tier 7 days). All outputs are yours to export — we never use your assets to train models."
            />
            <FAQ
              q="What about EU AI Act disclosure?"
              a="Every generated image embeds C2PA XMP metadata declaring it as AI-generated. Importers from August 2026 can prove provenance without bolting on a third tool."
            />
            <FAQ
              q="Can I cancel anytime?"
              a="Yes. Paid tiers carry a 7- or 14-day full refund (depends on tier — see /pricing). Cancellation stops billing at period end and you keep export access for 30 days."
            />
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-3">
            Start with 5 free SKUs — no credit card
          </h2>
          <p className="text-gray-600 mb-8">
            Try the full agent against your real product photos in under 3
            minutes.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="rounded-full text-base px-8">
              Create your free account
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
            <Link href="/pricing">Pricing</Link>
            <Link href="/sign-up">Sign up</Link>
            <Link href="/sign-in">Sign in</Link>
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
        {icon} step {n}
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
