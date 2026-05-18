# 01 · 系统设计

> **技术中立**：本文只写"系统必须具备什么能力"，不锁定具体框架/语言。选型留到实施阶段。
> 但每条能力都写到"能直接拿去做选型 RFP"的颗粒度。

---

## 1. 系统分层（一张图说清）

```
┌─────────────────────────────────────────────────────────────────────┐
│  L1 接入层（Edge / Web / Integration）                              │
│  ─────────────────────────────────────────────────────────────────  │
│  · 营销站 + 落地页（SEO，SSR/SSG）                                  │
│  · Web 应用（创作工作台）                                            │
│  · Shopify App（嵌入 Shopify Admin）                                │
│  · REST API（v3 才对外，v1 仅内部用）                               │
│  · Webhook 接收（Shopify / Amazon SP-API / 支付）                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────────┐
│  L2 编排层（Orchestration）                                          │
│  ─────────────────────────────────────────────────────────────────  │
│  · Agent Runner（多步规划、状态机、可暂停/分支/重试）               │
│  · Task Queue（异步长任务，Agent run 平均 60-300s）                 │
│  · Workflow Engine（合规检查 → 生图 → 评估 → 修复 串行/并行）       │
│  · Event Bus（用量计费、审计日志、Webhook 出向）                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────────┐
│  L3 能力层（Domain Capabilities）                                    │
│  ─────────────────────────────────────────────────────────────────  │
│  · 合规检查引擎（详见 03-compliance-engine.md）                     │
│  · 生图能力（场景图 / 主图 / A+ / Banner / 动图）                   │
│  · 视觉评估（VLM critic，详见 02-agent-orchestration.md）          │
│  · 多平台尺寸适配器                                                  │
│  · 品牌资产库（v2）                                                  │
│  · 合规元数据写入（C2PA / EU AI Act）                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────────┐
│  L4 模型路由层（Model Router）                                       │
│  ─────────────────────────────────────────────────────────────────  │
│  · 多模型路由（gpt-image-2 / Nano Banana / Flux Kontext / VLM）     │
│  · 成本预算 + fallback + 重试                                        │
│  · 走中转 API（用户已有的 sparkcode 中转）                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────────┐
│  L5 数据层（Persistence）                                            │
│  ─────────────────────────────────────────────────────────────────  │
│  · 关系型 DB（用户 / 租户 / 计费 / Agent run 状态）                 │
│  · 对象存储（图片资产，CDN 加速读）                                 │
│  · 向量库（v2，品牌相似度 / 历史素材检索）                          │
│  · 规则库（合规规则版本化，详见 03）                                │
│  · 缓存（生图结果去重、合规检查复用）                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────────┐
│  L6 可观测性 + 计费（横切）                                          │
│  ─────────────────────────────────────────────────────────────────  │
│  · Trace（一个 Agent run 全链路追踪）                               │
│  · Metric（pass-first-time / agent-completion-rate / 模型成本）     │
│  · Usage Metering（每张图标记成本、归属、订阅 vs overage）          │
│  · 审计日志（合规重要，欧盟 / 加州法规要求可追溯）                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 各层能力要求

### 2.1 L1 接入层

| 能力 | 要求 |
|---|---|
| 营销站 SEO | 必须 SSR 或 SSG，目标关键词：`amazon listing image`, `temu product photo ai`, `shopify product image ai compliance` |
| Web 应用 | 创作工作台 SPA，对实时性要求高（Agent 流式输出，progress 可见） |
| Shopify App | 必须做（Shopify App Store 是 B 段核心入口）；OAuth + Admin API + 嵌入式 UI |
| 上传 | 支持单图 / 批量（最大 50 张/次）/ URL 引用 / 摄像头直拍（移动端） |
| 上传限制 | 单图 ≤ 20MB、格式 JPEG/PNG/HEIC/WEBP；批量自动并发处理 |
| 文件类型校验 | 拒绝可执行 / SVG（XSS 风险）/ 隐写嵌入 |
| 鉴权 | 邮箱 + 密码 + magic link；社交：Google / Shopify SSO（B 段必备） |
| 限流 | 按用户 / 按 IP / 按订阅档；防爬虫和滥用 |

### 2.2 L2 编排层

| 能力 | 要求 |
|---|---|
| Agent Runner | 必须支持：多步规划、中间状态持久化（断电恢复）、人工干预（暂停/分支/重试单步）、流式输出给前端 |
| Task Queue | 必须支持：长任务（60s-15min）、优先级（付费 > Free）、重试（指数退避）、死信队列 |
| Workflow | 编排单个 Agent run 内部 step（合规 → 生图 → 评估 → 修复）；支持并发 fan-out / fan-in |
| Event Bus | 异步事件：usage.recorded / agent.completed / compliance.failed / shopify.synced |
| Webhook 出向 | 用户配置 webhook URL，listing pack 完成时回调（Agency 段刚需） |
| Idempotency | 必须支持 `Idempotency-Key`，前端重传不重复扣 SKU 配额 |

**关键约束**：编排层**不能假设单机内存**——Agent 状态必须可持久化，节点宕机后另一个节点能接着跑。

### 2.3 L3 能力层

每个能力都是独立模块（domain service），互不依赖：

| 能力模块 | 输入 | 输出 | 关键约束 |
|---|---|---|---|
| **ComplianceChecker** | 图 + 目标平台 + 品类 | `ComplianceReport`（pass/fail + 红线条款 + 修复建议） | 详见 [`03-compliance-engine.md`](03-compliance-engine.md) |
| **SceneGenerator** | 商品图 + 场景描述（或场景库 ID）| 3-5 张候选图 + 每张 metadata | 必须保真商品（参考 Omost 场景 JSON 模式） |
| **MainImageGenerator** | 商品图 + 平台规格 | 平台合规主图（自动满足 RGB / 占比 / 尺寸） | 主图禁止 AI 生成产品本身（Amazon 政策），只能换背景 |
| **APlusContentBuilder** | 商品图 + 卖点 + 模块选择 | 970×600 模块化长图 | 文字面积 ≤ 30%，字号 ≥ 24pt 等效 |
| **BannerBuilder** | 商品 + 文案 + 风格 | Banner（含图内文字，参考 Ideogram） | 文字渲染优先用 Nano Banana / Ideogram-class 模型 |
| **MotionGenerator** | 商品图 | 2-3s 旋转/zoom 动图（MP4/GIF） | v1 不做完整短视频 |
| **PlatformAdapter** | 一张源图 + 平台列表 | 多平台 × 多尺寸的图集 | 平台规格表见 [`03-compliance-engine § 各平台规则`](03-compliance-engine.md) |
| **VLMCritic** | 图 + 评估卡（critic card）| 评分 + 改进方向（JSON） | 详见 [`02-agent-orchestration § Painter-Commenter`](02-agent-orchestration.md) |
| **C2PAStamper** | 任意输出图 | 同图 + C2PA metadata + EU AI Act 兼容 watermark | 对用户不可见，输出全部图必须经过 |
| **BrandKit**（v2） | 30-50 张品牌图 | 品牌色 / 字体 / 版式 / LoRA 权重 | 详见 v2 PRD |

### 2.4 L4 模型路由层

| 能力 | 要求 |
|---|---|
| 多模型路由 | 至少支持 4 类：图生成（gpt-image-2/Nano Banana/Flux）、图编辑（Flux Kontext/Nano Banana Edit）、VLM（GPT-4V/Gemini 2.5 Vision）、OCR（PaddleOCR/Google Vision） |
| 路由策略 | 按任务类型 + 成本预算 + 质量目标自动选；可手动 override |
| Fallback | 主模型失败/超时自动切备用；失败原因记 log |
| 重试 | 网络错误 3 次指数退避；语义错误（输出违规、被 API 拒）不重试 |
| 成本预算 | 每个 Agent run 预设 cost cap（例：Pro 档 $0.30/listing pack），超出预算降级或终止 |
| 中转 API | 接入用户已有 sparkcode 中转（API base 可配置） |
| 模型版本锁定 | 关键路径必须显式锁版本（避免上游模型升级造成回归） |

**模型成本基准**（用于预算）：
- Nano Banana：$0.039/张
- gpt-image-2：~$0.04-0.08/张
- Flux Kontext：~$0.05/张
- GPT-4V：~$0.01-0.03/次调用
- Imagen 4 Fast：~$0.02/张

### 2.5 L5 数据层

| 能力 | 要求 |
|---|---|
| 关系型 DB | 用户 / 租户 / 订阅 / 计费 / Agent run 状态 / 合规报告 / 平台连接 |
| 对象存储 | 原图 + 中间产物 + 最终输出。多区域可选（欧盟用户存 EU 区，合规要求） |
| CDN | 输出图必须 CDN 加速；签名 URL（过期 24h）防盗链 |
| 向量库（v2） | 品牌图嵌入 + 历史素材嵌入，用于 BrandKit 风格相似度 |
| 规则库 | 平台合规规则 + 品类规则。版本化（每条规则有 effective_from / superseded_at） |
| 缓存 | 同输入幂等去重（hash(图+参数) → 已生图直接返回，省成本） |
| 数据保留 | 用户图保留：Free 30 天 / 付费 ∞；删除请求 30 天内执行（GDPR） |
| 备份 | 关系型 DB 每日全量 + 每小时 WAL；对象存储跨区域复制 |

---

## 3. 数据模型（schema 级，不绑 ORM）

### 3.1 核心实体关系

```
User ──owns──> Workspace ──has──> Member (role: owner/admin/editor/viewer)
                  │
                  ├──has──> Subscription (plan, status, period, overage_cap)
                  │             │
                  │             └──tracks──> UsageRecord
                  │
                  ├──has──> PlatformConnection (shopify/amazon/etsy oauth tokens)
                  │
                  ├──has──> Asset (uploaded image)
                  │
                  └──has──> ListingPack ──contains──> Output (multiple platform×size images)
                                │
                                └──triggers──> AgentRun ──has──> AgentStep[]
                                                            │
                                                            └──has──> ComplianceReport

Catalog (system-managed):
  PlatformRule (platform × category × rule_type × version)
  CategoryRule (违禁词、必备元素，按品类)
  CriticCard (VLM 评估模板，参考 autocritic)
```

### 3.2 关键实体字段（节选，详细 schema 在 v0 实施前定稿）

#### `Workspace`
```
id              uuid pk
slug            string unique (用于 URL 和 Shopify App)
name            string
owner_user_id   uuid fk → User
plan_id         enum (free/starter/pro/brand/agency/enterprise)
                # 注：Developer API（v3）走独立计费链路，不占 plan_id —— 详见 04-open-source-stack 路径
created_at      timestamp
deleted_at      timestamp nullable (soft delete)
```

#### `Subscription`
```
id                  uuid pk
workspace_id        uuid fk
plan                enum
status              enum (active/past_due/canceled/trialing)
current_period_start timestamp
current_period_end   timestamp
sku_quota           int (本期配额)
sku_used            int (已用)
overage_enabled     bool (用户是否同意 overage)
overage_cap_pct     int default 50 (超额上限 % of quota)
billing_provider    enum (stripe/lemonsqueezy)
external_id         string (Stripe sub id 等)
```

#### `Asset`
```
id              uuid pk
workspace_id    uuid fk
uploader_id     uuid fk → User
type            enum (source_photo/output/intermediate/brand_reference)
storage_key     string (S3/R2 key)
cdn_url         string
mime            string
width           int
height          int
file_size       bigint
hash            string (sha256, 去重用)
category        string nullable (服装/家居/3C/…)
metadata        jsonb (EXIF、品牌、品类、AI gen flag、C2PA manifest 等)
created_at      timestamp
```

#### `ListingPack`
```
id              uuid pk
workspace_id    uuid fk
name            string (用户可命名，默认 "Listing Pack #N")
source_asset_id uuid fk → Asset
target_platforms text[] (["amazon", "shopify", "temu"])
category        string
status          enum (queued/running/completed/failed/partial)
created_at      timestamp
completed_at    timestamp nullable
sku_count       int default 1 (用于配额计算)
```

#### `AgentRun`
```
id              uuid pk
listing_pack_id uuid fk
status          enum (pending/planning/running/paused/awaiting_user/completed/failed/canceled)
current_step    string (e.g. "compliance_check", "scene_generation", "vlm_evaluation")
plan            jsonb (Agent 制定的多步计划)
state           jsonb (中间状态，断电恢复用)
cost_cap_usd    numeric(10,4)
cost_spent_usd  numeric(10,4)
started_at      timestamp
ended_at        timestamp nullable
error           jsonb nullable
```

#### `ComplianceReport`
```
id              uuid pk
asset_id        uuid fk
target_platform string (amazon/shopify/temu/shein/ebay)
target_category string nullable
overall         enum (pass/warn/fail)
rule_results    jsonb (每条规则的 pass/fail + 证据)
fix_suggestions jsonb (可一键修复的建议)
ran_at          timestamp
rule_set_version int (合规规则库版本号)
```

#### `UsageRecord`
```
id              uuid pk
workspace_id    uuid fk
event           enum (sku_generated/api_call/overage_warning/overage_charged)
quantity        int
unit_cost_usd   numeric(10,4) (该次成本——用于成本归因)
listing_pack_id uuid fk nullable
agent_run_id    uuid fk nullable
metadata        jsonb (模型、用时、size)
created_at      timestamp
```

#### `PlatformRule`（合规规则库）
```
id                uuid pk
platform          enum
rule_key          string (e.g. "amazon.main_image.background_white")
rule_type         enum (image_property/text_content/category_specific)
spec              jsonb (检测算法 + 阈值，详见 03-compliance-engine.md)
effective_from    date
superseded_at     date nullable
source            string (引用 Amazon 官方页 / 法规原文)
severity          enum (block/warn/info)
```

### 3.3 多租户隔离

- **Row-level**：所有业务表带 `workspace_id`，查询必须强制 `WHERE workspace_id = current_workspace`
- **存储隔离**：对象存储 key 前缀按 workspace（`{workspace_slug}/assets/...`）
- **Enterprise 段**：v3 提供专用 DB schema 或独立部署选项
- **Agency 段** workspace 下的"客户 workspace"通过 `parent_workspace_id` 关联，账单聚合到 parent

---

## 4. 核心 API 契约

REST 风格，JSON 输入输出。所有端点需 `Authorization: Bearer <token>` 和 `X-Workspace-Id`。

### 4.1 资产 API

#### `POST /v1/assets`
上传图片（multipart 或 base64）。返回 `Asset`。

```http
POST /v1/assets
Content-Type: multipart/form-data
Authorization: Bearer ...
X-Workspace-Id: ws_abc

file=@product.jpg
type=source_photo
category=apparel
```

**响应** `201 Created`：
```json
{
  "id": "asset_01H...",
  "type": "source_photo",
  "cdn_url": "https://cdn.listpack.io/.../product.jpg",
  "width": 2400,
  "height": 2400,
  "mime": "image/jpeg",
  "metadata": { "exif": {...} }
}
```

#### `GET /v1/assets/:id`
查询单个 asset。

#### `GET /v1/assets?type=&category=&page=`
分页查询。

#### `DELETE /v1/assets/:id`
软删除（30 天保留）。

### 4.2 合规检查 API

#### `POST /v1/compliance/check`
对一张图做合规检查（**不消耗 SKU 配额**，鼓励用户检查）。

```json
{
  "asset_id": "asset_01H...",
  "target_platforms": ["amazon", "shopify"],
  "target_category": "apparel",
  "image_slot": "main"
}
```

**响应**：
```json
{
  "reports": [
    {
      "id": "rep_01H...",
      "platform": "amazon",
      "overall": "fail",
      "rule_results": [
        {
          "rule_key": "amazon.main_image.background_white",
          "pass": false,
          "severity": "block",
          "evidence": {
            "detected_bg_rgb": [248, 248, 250],
            "tolerance": [255, 255, 255]
          },
          "fix_action": "auto_whiten_background",
          "rule_source_url": "https://sellercentral.amazon.com/..."
        },
        {
          "rule_key": "amazon.main_image.product_fill_ratio",
          "pass": true,
          "detected_ratio": 0.87
        }
      ],
      "fix_suggestions": [
        { "action": "auto_whiten_background", "estimated_cost_usd": 0.04 }
      ]
    }
  ]
}
```

#### `POST /v1/compliance/check/:id/auto-fix`
对失败的 report 一键修复（**消耗 1 SKU 配额**）。

### 4.3 Listing Pack API

#### `POST /v1/listing-packs`
创建一个完整 listing pack 任务（**异步**）。

```json
{
  "source_asset_id": "asset_01H...",
  "name": "Summer dress SKU-1024",
  "category": "apparel",
  "target_platforms": ["amazon", "shopify", "temu"],
  "modules": ["main_image", "lifestyle", "a_plus_content", "banner"],
  "agent_mode": "full",        // full | manual | template
  "cost_cap_usd": 0.50,
  "idempotency_key": "user-supplied-key"
}
```

**响应** `202 Accepted`：
```json
{
  "id": "pack_01H...",
  "status": "queued",
  "agent_run_id": "run_01H...",
  "estimated_duration_seconds": 180,
  "stream_url": "https://api.listpack.io/v1/agent-runs/run_01H.../stream"
}
```

#### `GET /v1/listing-packs/:id`
查询状态 + 当前产出。

#### `GET /v1/agent-runs/:id/stream`（Server-Sent Events）
**SSE 流式输出** Agent 每一步的进度（核心 UX，用户能"watch agent 思考"）。

`Content-Type: text/event-stream`；客户端用浏览器原生 `EventSource` API 订阅。选 SSE 不选 WebSocket 的理由：单向（服务端 → 客户端）、自动重连、HTTP/2 复用、Cloudflare/Vercel 边缘原生支持。

```
event: agent.plan
data: { "steps": [...] }

event: step.started
data: { "step": "compliance_check", "started_at": "..." }

event: step.intermediate
data: { "step": "scene_generation", "candidate_image_url": "...", "vlm_score": 7.2 }

event: step.completed
data: { "step": "scene_generation", "outputs": [...] }

event: agent.completed
data: { "outputs": [...], "cost_usd": 0.34 }
```

#### `POST /v1/agent-runs/:id/intervene`
人工干预（暂停 / 重跑某步 / 改参数）：

```json
{
  "action": "redo_step",
  "step": "scene_generation",
  "params_override": { "scene_id": "outdoor_summer" }
}
```

### 4.4 平台集成 API

#### `POST /v1/platforms/shopify/connect`
启动 Shopify OAuth。

#### `POST /v1/platforms/shopify/publish`
把 listing pack 推到 Shopify 店铺：

```json
{
  "listing_pack_id": "pack_01H...",
  "shopify_product_id": "gid://shopify/Product/...",
  "assignments": {
    "main_image": "shopify_image_position_1",
    "variant_images": [...]
  }
}
```

### 4.5 用量 / 计费 API

#### `GET /v1/usage`
当期用量统计。

```json
{
  "period": { "start": "2026-05-01", "end": "2026-06-01" },
  "plan": "pro",
  "quota": { "sku": 100 },
  "used": { "sku": 73 },
  "overage": { "enabled": true, "cap": 50, "used": 0 },
  "estimated_overage_charge_usd": 0
}
```

#### `POST /v1/webhooks`（v3）
配置 webhook URL，用于 listing pack 完成时回调。

---

## 5. 非功能性要求（NFR）

### 5.1 性能

| 指标 | 目标 |
|---|---|
| 合规检查（单图、单平台） | < 3s（不走 Agent） |
| 单张场景图生成 | 模型出图 < 15s |
| 完整 listing pack（5 平台 × 20 张 + VLM 评估 + 修复） | 平均 90-180s，P95 < 5 min |
| Agent 中途状态可见（首字节） | < 2s |
| 上传到可处理 | < 1s（同步返回 asset_id，处理异步） |
| API P99 延迟（非 Agent） | < 500ms |

### 5.2 可用性

- v1：99.5%（约每月停服 3.6h，独立开发可接受）
- v2：99.9%（约每月 43min）
- v3：99.95% + Enterprise 合同 SLA

### 5.3 安全

| 维度 | 要求 |
|---|---|
| 传输 | 全 HTTPS / TLS 1.2+ |
| 鉴权 | OAuth 2.1 / OIDC；Shopify SSO 必须 |
| 凭证存储 | 平台 OAuth token 加密静态存储（AES-256），密钥分离 |
| 多租户 | row-level 隔离，每个查询带 workspace_id 强制条件 |
| 敏感操作 | 删除 workspace / 大宗下载 / API key 旋转必须二次确认 |
| 上传校验 | MIME 嗅探 + 拒绝可执行 / SVG（XSS）/ 解压炸弹 |
| 输出图签名 URL | 24h 过期；防盗链 |
| 速率限制 | 按订阅档 + 按 IP；超限返 429 |
| 审计日志 | 所有写操作 + 平台发布 + 合规检查必须记 audit log（EU 法规要求） |
| 漏洞响应 | 公开 security@listpack.io；P0 漏洞 24h 内修 |

### 5.4 可观测性

| 维度 | 要求 |
|---|---|
| Trace | 每个请求 + 每个 Agent run 全链路 trace（OpenTelemetry 标准） |
| Metric | 业务指标（北极星、pass-first-time、agent-completion-rate）+ 技术指标（QPS、延迟、错误率） |
| Log | 结构化 JSON log，关键事件带 trace_id + workspace_id + user_id |
| Alert | P0：服务不可用、外部 API 全部失败、计费失败；P1：成本超预算 50%、Agent 失败率 > 10% |
| 用户可见 | 每个 listing pack 可下载"生成报告"（用了什么模型、多少成本、多少时间） |

### 5.5 成本控制

| 机制 | 实现 |
|---|---|
| 单 Agent run cost cap | 创建任务时硬上限（Pro $0.30/pack），超出强制降级或终止 |
| 模型降级 | 高质量模型失败/超预算 → 降到模板生成（保体验，质量打折） |
| 缓存命中 | 同输入图+同参数 hash 命中缓存，0 成本返回旧结果 |
| 月度成本预算 | 全公司总成本 alert：50% / 80% / 100% |
| 用户级降级 | Free 用户超 5 SKU 后排队（不停服，慢一点） |

### 5.6 合规 / 法规

| 法规 | 要求 |
|---|---|
| GDPR | 数据导出 / 删除请求 30 天内执行；EU 用户数据存欧盟区 |
| EU AI Act（2026.8.2 生效） | 所有 AI 生成图嵌 C2PA + 不可见水印（详见 03） |
| 加州 SB 942（2026.1.1） | 月活 100 万+ 时必须提供 AI 检测工具 + 显式 + 隐式标识 |
| 中国《标识办法》（2025.9.1） | 中文版/中国卖家版本需显式 + 隐式双标识 |
| SOC 2 Type I | v2 准备（Enterprise 销售刚需） |
| SOC 2 Type II | v3 必须 |

---

## 6. 部署 / 环境

| 环境 | 用途 | 数据隔离 |
|---|---|---|
| `dev` | 本地开发 | 本地 DB + 测试桶 |
| `preview` | PR 自动部署 | 共享 staging DB |
| `staging` | 内部测试 | 独立 DB，可重置 |
| `production` | 用户使用 | 独立 DB，受保护 |

部署目标：CI/CD 全自动；feature branch → preview 自动起；main → staging 自动；release tag → production 手动审批。

---

## 7. 不在 v1 范围内（明确）

| 主题 | 推迟到 |
|---|---|
| 完整的 API 对外开放 | v3 |
| Webhook 出向 | v3（v1 内部用） |
| 多区域部署（EU/US/APAC 数据隔离） | v2（合规要求触发） |
| 单点登录 SSO | v3 Enterprise |
| 私有部署（Self-hosted） | v3 Enterprise 选项 |
| 移动端原生 App | 不在路线图 |
| Worker / 边缘函数（如果选 Next.js 全栈，初期 Vercel 即可） | 实施时再定 |

---

## 8. 关联文档

| 主题 | 文档 |
|---|---|
| 产品功能清单 | [`00-product.md`](00-product.md) |
| Agent 编排细节 | [`02-agent-orchestration.md`](02-agent-orchestration.md) |
| 合规规则库（PlatformRule 的 spec 字段细节） | [`03-compliance-engine.md`](03-compliance-engine.md) |
| 开源项目集成 + 90 天实施 | [`04-open-source-stack.md`](04-open-source-stack.md) |
| 平台合规调研依据 | [`docs/research/03-platform-compliance.md`](../research/03-platform-compliance.md) |
