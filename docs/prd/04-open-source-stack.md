# 04 · 开源项目集成方案 + 实施路径

> 本文回答两个问题：
> 1. **每个开源项目如何集成到 ListPack**（fork / 借鉴模式 / 调 API / 直接用库）
> 2. **30-45 天 v1 怎么排活**（具体到周/天颗粒度）
>
> 调研依据：[`docs/research/05-competitor-matrix`](../research/05-competitor-matrix.md) 中提到的开源项目，以及之前的扩展调研。

---

## 1. 集成原则

### 1.1 四种集成方式

| 方式 | 适合什么 | 长期成本 | 法律风险 |
|---|---|---|---|
| **Fork（重度修改自维护）** | 核心差异化模块、需要深度改造 | 高（自己维护） | 取决于 License |
| **借鉴模式（重写）** | 论文/参考项目的思想可复用，代码不可直接用 | 低 | 无 |
| **调 API（远程服务）** | 不想自己跑模型、付费可接受 | 中（按用量） | 数据出境 |
| **库依赖（npm/pip install）** | 稳定库、不需要改 | 低 | 看 License |

### 1.2 License 红线

| License | 可用性 |
|---|---|
| MIT / Apache 2.0 / BSD | ✅ 任意使用、可闭源 |
| LGPL | ⚠️ 动态链接 OK，静态/修改需开源 |
| GPL / AGPL | ❌ 商业 SaaS 不用（AGPL 在 SaaS 网络传播也触发） |
| Creative Commons (BY/NC) | ❌ NC（非商业）不能用 |
| 自定义 / 不明 | ❌ 不用 |

---

## 2. 开源项目集成清单

### 2.1 Agent 编排 / 评估类

#### Paper2Poster — Painter-Commenter 反馈环
- **GitHub**: https://github.com/Paper2Poster/Paper2Poster
- **License**: 待核（NeurIPS 2025 项目，通常 MIT/Apache）
- **集成方式**: **借鉴模式（重写）**
- **怎么用**:
  - 读论文 + 看代码理解 Painter-Commenter 模式
  - 不 fork 代码（它的领域是学术 poster，与电商图差太多）
  - 在 ListPack 内重新实现，对应到 [`02-agent-orchestration § 3`](02-agent-orchestration.md)
- **关键收获**：阻尼参数 + 终止条件 + 收敛策略
- **风险**：无，纯思想借鉴

#### autocritic — CriticCard 评估卡
- **GitHub**: https://github.com/mccoyspace/autocritic
- **License**: 待核（小项目，通常 MIT）
- **集成方式**: **借鉴模式（重写）**
- **怎么用**:
  - 抄它的 CriticCard JSON 结构思想（见 [`02 § 10.2`](02-agent-orchestration.md)）
  - 抄阻尼参数的实施细节
  - 不 fork（代码量小、领域不同，自己写更清爽）
- **关键收获**：维度评分 + 改进方向 + 决策结构

#### Omost — 场景 JSON 中间层
- **GitHub**: https://github.com/lllyasviel/Omost
- **License**: Apache 2.0
- **集成方式**: **借鉴模式（重写简化版）**
- **怎么用**:
  - 不实现 Omost 的 region attention（太复杂）
  - 借鉴"LLM 输出结构化场景描述"的核心思想
  - 重写 `scene_spec` JSON Schema（见 [`02 § 4.2`](02-agent-orchestration.md)）
  - PromptCompiler 把 scene_spec → prompt 字符串
- **关键收获**：可控、可缓存、可编辑的中间表示

#### BannerAgency — 分层 schema + 可编辑输出
- **论文**: https://arxiv.org/abs/2503.11060
- **GitHub**: https://github.com/sony/BannerAgency
- **License**: 待核（Sony 学术项目）
- **集成方式**: **借鉴模式（重写）**
- **怎么用**:
  - 抄"banner = 背景层 + 前景结构层 + 文本层"分层思想
  - 实现 `composition_spec` JSON Schema（见 [`02 § 5.2`](02-agent-orchestration.md)）
  - 实现 SVG / PSD 导出（用 [ag-psd](https://github.com/Agamnentzar/ag-psd)）
- **关键收获**：分层 → 各层独立 agent → 可编辑导出

#### tldraw agent-template — Canvas Agent 模式（v2 参考）
- **GitHub**: https://github.com/tldraw/agent-template
- **License**: MIT
- **集成方式**: **v2 才用**，作为画布交互参考
- **怎么用**:
  - v1 不做画布；v2 如果要做"用户拖图层调整"用 tldraw SDK
  - 借鉴"双重画布上下文"（截图 + 结构化形状）给 Agent 喂上下文的方式
- **关键收获**：infinite canvas SDK 是最成熟的画布底座

### 2.2 Prompt 优化类

#### linshenkx/prompt-optimizer
- **GitHub**: https://github.com/linshenkx/prompt-optimizer
- **License**: MIT
- **Stars**: 28.9k
- **集成方式**: **借鉴 + 选择性 fork 子模块**
- **怎么用**:
  - 看它的"对比测试模式"（原始 prompt vs 优化 prompt 并排出图）
  - 它原生支持 T2I/I2I prompt 优化，可以 fork "prompt 重写器" 子模块
  - ListPack 用法：用户输入中文短描述 → 优化器扩为高质量英文 prompt → 喂 SceneJsonExecutor
- **风险**：上游更新频繁，fork 后要持续 sync

### 2.3 图像处理 / 检测模型

#### RMBG-2.0（背景移除）
- **HuggingFace**: https://huggingface.co/briaai/RMBG-2.0
- **License**: 商用需付费 license（开源版仅研究用）⚠️
- **替代**: SAM 2.1（Apache 2.0）+ 后处理 / U2Net (MIT) / Photoroom API
- **集成方式**: **走 API**（不自己跑模型）—— 用 Replicate / Photoroom API / fal.ai
- **理由**：v1 阶段不养 GPU，按用量付 API 费更划算

#### SAM 2.1（Segment Anything 2）
- **GitHub**: https://github.com/facebookresearch/sam2
- **License**: Apache 2.0
- **集成方式**: **走 API**（Replicate / fal.ai 都有）
- **用途**：
  - `product_fill_ratio` detector
  - `crop_to_fill_ratio` auto-fix
  - inpainting 前的 mask 生成

#### LaMa（inpainting）
- **GitHub**: https://github.com/advimman/lama
- **License**: Apache 2.0
- **集成方式**: **走 API**（Replicate）
- **用途**：
  - `remove_text` / `remove_watermark` / `remove_object` auto-fix
- **替代**：Flux Fill（更新但商用 license 复杂）

#### PaddleOCR
- **GitHub**: https://github.com/PaddlePaddle/PaddleOCR
- **License**: Apache 2.0
- **集成方式**: **库依赖（自托管）**
- **理由**：
  - 中英文 OCR 业界最好
  - 跑在自己服务器成本低（CPU 可跑）
  - 不希望 OCR 数据出境（图片可能含敏感信息）

#### YOLOv8（物体检测）
- **GitHub**: https://github.com/ultralytics/ultralytics
- **License**: AGPL-3.0 ⚠️ 或商业 license
- **集成方式**: **走 API**（避免 AGPL 在 SaaS 触发）—— Roboflow / Replicate
- **替代**：DETR (Apache 2.0) / Detectron2 (Apache 2.0)
- **关键**：**不能直接库依赖** YOLOv8（AGPL 在网络传播触发开源），必须走 API 或换 license 兼容的

#### restb.ai watermark detection
- **API**: https://restb.ai/
- **License**: 商业 API
- **集成方式**: **API**
- **替代**：自己训 watermark classifier（不值得）

### 2.4 元数据 / 合规

#### C2PA SDK
- **官方**: https://c2pa.org/
- **Rust 实现**: https://github.com/contentauth/c2pa-rs (Apache 2.0/MIT)
- **Node binding**: https://github.com/contentauth/c2pa-node
- **集成方式**: **库依赖**
- **用途**：
  - `add_c2pa_manifest` auto-fix
  - `c2pa_manifest_present` detector
  - EU AI Act / 加州 SB 942 / 中国《标识办法》合规元数据
- **关键**：v1 必须集成（合规规则引擎依赖）

### 2.5 图像处理基础库

| 库 | License | 用途 |
|---|---|---|
| **Sharp** (Node) / **Pillow** (Python) | Apache 2.0 / HPND | resize / compress / format / color space / 像素操作 |
| **libvips** | LGPL 2.1 | 高性能图像处理（Sharp 的底层） |
| **OpenCV** | Apache 2.0 | border detection / edge / Hough |
| **ag-psd** | MIT | PSD 分层文件导出 |
| **node-canvas / Skia-canvas** | MIT | SVG/text rendering |

### 2.6 参考型项目（不 fork，看了取经）

#### 302_ecom_image_generator
- **GitHub**: https://github.com/302ai/302_ecom_image_generator
- **License**: 待核
- **用途**：
  - 看他们怎么做"商品保真 + 场景重打光"
  - 看 UI / UX 取经
- **不集成**：他们的定位不同（302.AI 中转 SDK，不是 SaaS）

#### Photoroom changelog
- 持续监控：https://www.photoroom.com/inside-photoroom
- 用途：跟踪头部对手做什么新功能

---

## 3. 模型 API 选型（走中转）

ListPack 走用户已有的 sparkcode 中转 API，不直连模型厂商。

### 3.1 模型用途映射

| 用途 | 首选模型 | 备选 | 单次成本估算 |
|---|---|---|---|
| **场景图生成** | Nano Banana Pro | gpt-image-2 / Flux Kontext | $0.04-0.08 |
| **A+ 模块图** | Nano Banana | Ideogram (文字强) | $0.04 |
| **Banner（含文字）** | Ideogram v3 / Nano Banana | — | $0.05 |
| **图编辑（局部）** | Flux Kontext | Nano Banana Edit | $0.05 |
| **抠图 / 背景替换** | RMBG / SAM (via Replicate API) | Photoroom API | $0.02 |
| **inpainting** | LaMa (via Replicate) | Flux Fill | $0.03 |
| **VLM 评估** | GPT-4V / Gemini 2.5 Vision | Claude Vision | $0.01-0.03 |
| **LLM Planner** | Claude Sonnet 4.6 / GPT-5 | Gemini 2.5 Pro | $0.02 |
| **LLM SceneJson** | Claude Sonnet 4.6 | GPT-4o | $0.01 |
| **OCR** | PaddleOCR (自托管) | Google Vision | $0 (自托管) |
| **物体检测** | YOLOv8 via Roboflow | DETR (自托管) | $0.001 |
| **C2PA 签名** | c2pa-node (自托管) | — | $0 |

**单 listing pack 成本估算**（5 平台 × 平均 4 张图 = 20 张图 + Agent 调度）:
- 模型 API: ~$0.20-0.30
- 自托管 (OCR / 检测): 摊销 ~$0.02
- **总计 ~$0.22-0.32 / pack**
- Pro 档收 $0.49/pack（$49 / 100 SKU）→ 毛利 ~30%（合理但偏紧）
- → 必须靠缓存命中 + 模板降级把成本降下来

### 3.2 模型路由策略

```typescript
// 伪代码：模型选择逻辑
function chooseModel(task: Task, context: Context): ModelChoice {
  if (context.subscription === "free") {
    return CHEAPEST_MODEL_FOR_TASK[task]  // 一律最便宜
  }
  
  if (context.cost_remaining < TASK_COST_FLOOR[task]) {
    return TEMPLATE_MODE  // 预算不够降级模板
  }
  
  if (context.refinement_iteration > 0) {
    // refine 时换不同 model 增加多样性
    return DIFFERENT_MODEL_THAN(context.last_model)
  }
  
  return DEFAULT_MODEL_FOR[task]
}
```

---

## 4. 30-45 天 v1 实施路径（细到天）

### 4.1 总览

```
D1-3    选型敲定 + 基础设施
D4-10   合规规则引擎 v1（核心）
D11-18  生成能力（多平台尺寸 / 场景图 / A+ / Banner）
D19-25  Agent 编排（Painter-Commenter + 多步规划 + 流式输出）
D26-30  Shopify App + 计费 + Landing 上线
D31-45  缓冲期：bug 修 / 性能优化 / 5 个种子客户 / Pro 开放付费
```

### 4.2 详细任务清单

#### Phase 1：基础设施（D1-3）

**目标**：repo 跑得起来 + preview 自动部署。

- [ ] 注册域名 `listpack.io` / `listpack.studio` / 备选
- [ ] GitHub repo 创建 + 设置 CI (GitHub Actions)
- [ ] 选定技术栈（基于 [01-system-design 的能力要求](01-system-design.md)）：
  - 推荐组合：**Next.js 14+ App Router** + **PostgreSQL (Supabase / Neon)** + **Drizzle ORM** + **Inngest** (Agent 长任务) + **Cloudflare R2** (对象存储) + **Stripe** (计费) + **Vercel** (部署)
  - 备选：Hono + Cloudflare Workers + D1 + R2 + Workflows
- [ ] 仓库脚手架：monorepo (apps/web + apps/api + packages/shared)
- [ ] 域名 + DNS + SSL
- [ ] 落地页骨架（even 还没产品，先把 waitlist 表单上线）

**注**：因为 PRD 明确"技术中立"，这里只是推荐——选型最终决定权在你。

#### Phase 2：合规规则引擎 v1（D4-10）

**目标**：5 平台基础规则全部上线，Amazon 主图 10 条详细规则覆盖。

- [ ] D4：数据模型 — 实现 `PlatformRule` 表 + seeding 脚本
- [ ] D4：实现 12 个 detector 中的基础 5 个（pixel_dimension / file_size / file_format / color_space / background_color）
- [ ] D5：实现 SAM/RMBG 集成（走 Replicate API）+ `product_fill_ratio` detector
- [ ] D6：实现 PaddleOCR 自托管 + `text_in_image` / `category_forbidden_text` detector
- [ ] D7：实现 YOLOv8 via API + `object_count` / `person_in_image` detector
- [ ] D8：实现 watermark / border / halo detector
- [ ] D9：seeding 全部 Amazon 主图 14 条规则 + Shopify/eBay/Temu/SHEIN 基础规则（约 30 条）
- [ ] D10：实现 `/v1/compliance/check` API + 单测（命中率验证集 ≥ 90%）

**验收**：100 张真实电商图（自己网上找）跑过，pass-first-time 准确率 ≥ 90%。

#### Phase 3：生成能力（D11-18）

**目标**：单图 → 全平台 20 张图能跑通。

- [ ] D11：实现模型路由层（多模型 + fallback + 成本预算）
- [ ] D12：实现 `MainImageGenerator`（白底主图，规则约束生成）+ 一键修复（whiten_background / crop_to_fill_ratio / remove_text / remove_watermark）
- [ ] D13-14：实现 `SceneJsonExecutor`（LLM 生成 scene_spec）+ `PromptCompiler`
- [ ] D15：实现 `ImageExecutor`（生场景图）+ 缓存层
- [ ] D16：实现 `APlusBuilderExecutor`（模块化拼装 970×600 长图）
- [ ] D17：实现 `BannerExecutor`（分层 schema + 文字层代码渲染）
- [ ] D18：实现 `PlatformAdapter`（一图多尺寸输出）+ `C2PAStamper`

**验收**：端到端单图 → 1 个平台 listing pack 能跑通。

#### Phase 4：Agent 编排（D19-25）

**目标**：完整 listing pack（5 平台）端到端跑通 + 流式输出。

- [ ] D19：实现 `AgentRun` 数据模型 + 状态机
- [ ] D20：实现 `Coordinator` + 任务队列（Inngest / BullMQ）
- [ ] D21：实现 `Planner`（LLM 生成 DAG）
- [ ] D22：实现 `CriticCard` 数据结构 + 内置 6 张 card + VLM 调用
- [ ] D23：实现 `RefinementLoop`（Painter-Commenter 闭环）+ 阻尼参数
- [ ] D24：实现 SSE 流式输出 + 前端订阅
- [ ] D25：HITL 干预 API（pause / redo / fork）

**验收**：用户输入意图 → Agent 自动跑完 5 平台 listing pack（180s 内）→ 中途可暂停/重跑。

#### Phase 5：上线准备（D26-30）

**目标**：Landing 上线 + Shopify App 提交 + 计费打通。

- [ ] D26：Shopify OAuth + App 提交（审核要 5-10 工作日，要提前提交）
- [ ] D27：Stripe 集成 + 价格表（按 [00-product § 5](00-product.md) 配置）
- [ ] D28：Overage 计费逻辑 + 用量看板
- [ ] D29：Landing Page 完整版（含落地文案 / 案例图 / 定价表 / FAQ）
- [ ] D30：第一批种子客户邀请（5 个 DTC，从 Phase 0 访谈池里挑）

#### Phase 6：缓冲期（D31-45）

**目标**：bug / 性能 / 反馈 / Pro 档开放付费。

- [ ] D31-35：种子客户试用 + 收 5+ 条 P0 反馈 + 修
- [ ] D36-40：性能优化（缓存命中率、Agent 完成率、成本降低）
- [ ] D41-43：Shopify App 上架（如已通过审核）
- [ ] D44：Pro 档开放付费
- [ ] D45：复盘：付费用户数 / 北极星指标 / 下一阶段决策

---

## 5. Phase 0 用户验证（与代码并行）

代码 30-45 天写完，但**市场验证不靠代码**——靠访谈和 Fake Door。

| 周（与代码并行） | 动作 | Go/No-Go 信号 |
|---|---|---|
| 与 D1-7 并行 | 跑 20 个 DTC 卖家深访 | 真实付费意愿信号 |
| 与 D8-14 并行 | 跑 5 个中国跨境代运营深访 | C 类工作流验证 |
| 与 D15-21 并行 | Landing + Fake Door 测试（Google/Meta 各 $500） | waitlist 转化 >5%，CAC <$80 |
| 与 D22-30 并行 | Wizard-of-Oz（人工产出 10 单 listing pack 给 5 个种子客户） | ≥3 用户预付 $49/mo |

详见 [`docs/research/00-executive-summary § 七`](../research/00-executive-summary.md)。

---

## 6. v2 实施路径（粗，约 60-90 天）

触发条件：v1 月流失率 ≤ 5% 且 Pro 付费用户 ≥ 50（来自 [`00 § 8`](00-product.md)）。

### 6.1 v2 大版图

| 模块 | 关键开源项目 | 估时 |
|---|---|---|
| Brand Kit 上传 + 资产管理 | Sharp / 向量库 (pgvector) | 5 天 |
| 品牌色 / 字体 / 模特特征提取 | Color Thief / Font detection 模型 | 5 天 |
| LoRA 训练管线（轻量） | Replicate train API / fal.ai | 7 天 |
| Brand-aware Scene JSON | LLM Prompt 改造 | 3 天 |
| `brand_consistency_v1` CriticCard | VLM | 3 天 |
| 持续投放素材引擎（每 10 天自动一轮） | cron + 已有 Agent | 7 天 |
| 团队协作 + 评审流 | 已有 Workspace 扩展 | 10 天 |
| Amazon 一键直发 | Amazon SP-API | 10 天 |
| AI 模特 v1（服装垂类） | OpenTryOn / SellerPic 模式 | 15 天 |
| 品类规则引擎扩到 10 类 | seeding + detector | 5 天 |

**v2 估时**：60-90 天（取决于 AI 模特的细致度）。

### 6.2 v2 关键开源补充

- **OpenTryOn**: https://github.com/tryonlabs/opentryon —— 服装试穿 SDK，agent 化 model swap
- **pgvector**: https://github.com/pgvector/pgvector —— 品牌图 embedding 检索
- **Color Thief**: https://github.com/lokesh/color-thief —— 主色提取

---

## 7. v3 实施路径（粗，约 90-120 天）

触发条件：v2 上线后至少 1 个 Agency / Enterprise 客户主动询问。

### 7.1 v3 大版图

| 模块 | 估时 |
|---|---|
| Agency Workspace（多客户隔离） | 15 天 |
| 白标定制（Logo / 域名 / 邮件） | 10 天 |
| REST API 对外（rate limit + API key + 计费按量） | 15 天 |
| Partner Program（30% 分成 + 推荐码 + 后台） | 10 天 |
| A/B 测试 Agent（Amazon Experiments / Shopify A/B 集成） | 20 天 |
| 跨平台 Variant 同步 Agent | 15 天 |
| 合规自证 PDF 报告 | 5 天 |
| SOC 2 Type I 准备 | 30 天（含合规咨询） |

**v3 估时**：90-120 天 + SOC 2 流程。

---

## 8. 风险 / 备选 / 退路

### 8.1 关键风险

| 风险 | 触发条件 | 应对 |
|---|---|---|
| 中转 API 不稳 / 涨价 | 持续 | 多模型路由 + 多 provider fallback；考虑长期直连厂商 |
| Photoroom 6 个月内做了 Temu/SHEIN 合规 | 监控其 changelog | 加速发布 v2 BrandKit 拉差异化；考虑被收购退出 |
| Amazon 自家 AI 图生成上线（2026 Q4 传闻） | 监控 Amazon Seller Forum | 跨平台 + 多平台合规护城河；不在 Amazon 单一平台死磕 |
| 模型 API 价格战使生图免费化 | 12-18 个月内可能 | 转向"工作流 + 合规 + 分发"按订阅，模型层完全 commoditize |
| EU AI Act 8 月强制后被罚 | 2026.8.2 | C2PA + 隐式水印必须 v1 上线（已写在合规引擎） |
| YOLOv8 / 其他 AGPL 库无意中引入 | 持续 | License 检查脚本 CI 集成（自动检测） |

### 8.2 关键退路

如果 Phase 0 验证失败（4 周后没有 3 个预付用户）：

**选项 A**：Pivot 客户群 → 主攻 C 段（Agency / 服务商），SaaS 模式不变
**选项 B**：Pivot 定位 → 不做"上架包"，做"Amazon 合规体检"单点（更窄但更刚）
**选项 C**：开源化 → 把合规规则引擎开源，做 community 起势，再考虑商业模式
**选项 D**：停（沉没成本只是 1 个月时间）

不要继续硬干已知失败的方向。

### 8.3 90 天后如果北极星指标不达标

| 北极星 6 个月目标 | 不达标的最大原因 | 应对 |
|---|---|---|
| Pass-First-Time ≥ 90% | 合规规则覆盖不全 | 扩规则库 + 加品类专属 |
| Agent 完成率 ≥ 70% | 中途模型失败 / 用户中断 | 提高模型 fallback / 优化 UX 减少中断 |
| Pro 用户 100 / MRR $5K | 转化漏斗某节点漏 | 看具体节点：注册 → 试用 → 付费 |
| 月流失率 ≤ 5% | 第二个月用户没找到价值 | 加 onboarding / 主动续费提醒 / 增值 feature |

---

## 9. 开源贡献回流（计划）

ListPack 用了很多开源项目，长期应该回馈：

| 时机 | 贡献内容 |
|---|---|
| v1 上线后 | 把合规规则库的 schema 部分开源（不含商业规则数据）作为标准 |
| v1 上线后 | 把 CriticCard JSON Schema 开源（参考 autocritic 致谢） |
| v2 上线后 | 开源 scene_spec / composition_spec Schema 作为电商图领域标准 |
| v3 上线后 | 把"Amazon 主图自动合规检测"做成单独开源 CLI 工具，引流到 SaaS |

---

## 10. 文档关联

| 主题 | 文档 |
|---|---|
| 产品定义（v1/v2/v3 功能清单） | [`00-product.md`](00-product.md) |
| 系统设计（开源项目对应到哪一层） | [`01-system-design.md`](01-system-design.md) |
| Agent 编排（Painter-Commenter / scene_spec / composition_spec 详细） | [`02-agent-orchestration.md`](02-agent-orchestration.md) |
| 合规规则引擎（PaddleOCR / SAM / LaMa / C2PA 在哪用） | [`03-compliance-engine.md`](03-compliance-engine.md) |
| 市场调研 | [`docs/research/`](../research/00-executive-summary.md) |
