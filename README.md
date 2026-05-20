# ListPack Studio

跨境电商「上架包」AI Agent —— 单图变全套上架素材（主图 / 详情 / Banner / 多平台尺寸 / 一次过审 / EU AI Act 元数据）。

## 项目状态

**Phase 5 完成 (2026-05)** — D1-D33 已实施，SaaS 全栈在线：

- Web (Next.js 15 + Drizzle + Stripe + 邮件) — apps/web
- Agent (FastAPI + LangGraph + 13 detectors + Painter-Commenter 精修) — apps/agent
- 共享 schemas — packages/shared-schemas

详见 [PRD 路线图](docs/prd/04-open-source-stack.md) D1-D45。

## 定位

> Upload one product photo. Pass Amazon / Shopify / eBay / Temu / SHEIN review on first try.
> Get review-ready listing packs + EU AI Act-compliant disclosure in one streamed run.

## 仓库结构

```
listpack-studio/
├── apps/
│   ├── web/         # Next.js 15 App Router — landing, dashboard, billing, OAuth
│   └── agent/       # FastAPI + LangGraph — compliance engine, generation, agent runs
├── packages/
│   └── shared-schemas/  # 跨 stack 共享 Zod / Pydantic 镜像
└── docs/
    ├── prd/         # 5 卷 PRD (00 product / 01 system / 02 agent / 03 compliance / 04 stack)
    └── research/    # 6 篇市场调研报告
```

## 已实施功能

### Web (apps/web)
- **Sign up / Sign in** (bcryptjs + jose JWT, httpOnly cookie)
- **Public landing page** (定位 + 5 平台 badges + 4 plan teaser + FAQ)
- **Pricing page** (Free / Starter $19 / Pro $49 / Brand $149) — Stripe checkout + customer portal
- **Dashboard** (`/dashboard`)
  - Plan & quota usage 卡 (进度条 + 超额警告 + Upgrade CTA)
  - Workspace members + invitations
  - General settings / Activity / Security
- **New run** (`/dashboard/runs/new`) — 实时 SSE 进度 + Pause/Cancel HITL 按钮
- **Recent runs** (`/dashboard/runs`) — auto-refresh 5s, status 颜色 chip
- **Connections** (`/dashboard/connections`) — Shopify OAuth install / disconnect
- **Compliance check** (`/dashboard/compliance`) — D10 上传 → ComplianceReport
- **Agent demo** (`/dashboard/agent-demo`) — D3 hello stream
- **API proxy** (`/api/agent/*`) — token 注入 + SSE pass-through
- **Email** — Resend lazy client + welcome / trial-expiring / overage 模板

### Agent (apps/agent)
- **POST /v1/compliance/check** — 13 detectors × 34 rules
- **POST /v1/compliance/auto-fix** — 7 fixers (border / halo / fill / etc.)
- **POST /v1/agent/listing-pack/runs** — LangGraph 7-node graph SSE 实时
- **POST /v1/agent/listing-pack/runs/{id}/{pause,resume,cancel,fork}** — HITL
- **GET /v1/agent/listing-pack/runs/{id}** — 持久化 snapshot
- **Planner** — LLM 决定 render_scene/a_plus/banner
- **Critic + Painter-Commenter loop** — 6 内置 CriticCard, damping=0.4
- **PlatformAdapter** — 9 slots (Amazon main / Shopify featured / eBay / Temu / SHEIN)
- **C2PA stamper** — EU AI Act XMP metadata
- **Quota enforcement** — workspace.subscription gate + usage_records

## 本地开发

### Web
```bash
cd apps/web
pnpm install
cp .env.example .env  # POSTGRES_URL / STRIPE_SECRET_KEY / AUTH_SECRET ...
pnpm db:migrate
pnpm db:seed
pnpm dev   # http://localhost:3000
pnpm test      # 23 unit tests (Node test runner)
pnpm typecheck
```

### Agent
```bash
cd apps/agent
uv sync
cp .env.example .env  # POSTGRES_URL / SPARKCODE_API_KEY ...
uv run python -m compliance.rules.seed  # 34 rules into platform_rules
uv run uvicorn server:app --reload  # http://localhost:8000
uv run pytest  # 197+ tests (8 sec without PG, 4-5 min with PG integration)
```

## 价格分层

| 档位 | 价格 | 配额 | 超额 | 卖给谁 |
|---|---|---|---|---|
| **Free** | $0 | 5 SKU / mo (含水印) | 不允许 | A 漏斗 |
| **Starter** | $19/mo | 30 SKU | $0.80 / SKU | A 付费转化 |
| **Pro** ⭐ | **$49/mo** | **100 SKU** | **$0.50 / SKU** | **B 入门** |
| **Brand** | $149/mo | 500 SKU | $0.30 / SKU | B 高级 |
| **Agency** | $499/mo | 2500 SKU | $0.20 / SKU | C 客户 |
| **Enterprise** | 定制 | — | 谈定 | 大型 DTC / Agency |

完整价格策略 + refund 规则见 [docs/prd/00-product.md § 5](docs/prd/00-product.md)。

## 关键决策 (来自调研)

- **核心 ICP**: B (DTC 100-2000 SKU); 冷启动顺序 B → A → C
- **MVP 必做**: Amazon 主图合规检查 / 多平台尺寸 / A+ 详情长图 / 场景图 / 品类规则引擎 / 合规元数据
- **MVP 不做**: AI 模特 / 完整短视频 / LoRA 自训 / 完整团队协作 / 中国国内电商
- **避开品类**: 保健品 / 医美 / 珠宝 / 食品
- **窗口期**: 12-18 个月 (模型 commoditize 前转向工作流 + 合规 + 分发)

完整调研见 [docs/research/00-executive-summary.md](docs/research/00-executive-summary.md)。

## License

MIT
