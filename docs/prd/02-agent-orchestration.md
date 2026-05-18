# 02 · Agent 编排架构

> ListPack 的核心差异化。不是把 LLM/扩散模型包一层 UI，而是产品化的 Agent：自动规划 → 多步执行 → VLM 自我评估 → 反馈修复 → 输出可控产物。
>
> **灵感来源 4 个开源项目的工程化映射**：
> - **Paper2Poster** (NeurIPS 2025)：Painter-Commenter 反馈环
> - **Omost** (Lvmin Zhang)：场景 JSON 中间层
> - **BannerAgency** (Sony, EMNLP 2025)：分层 schema + 可编辑输出
> - **autocritic** (mccoyspace)：CriticCard 评估卡 + 阻尼参数

---

## 1. 设计哲学

### 1.1 不是 chatbot 套生图

**反例**（绝大多数竞品）：
```
用户输入 prompt → 调一次 API → 返回 1 张图 → 用户人工挑选/重生
```

**ListPack Agent**：
```
用户输入"做亚马逊上架包"
  → Planner 拆解任务
  → 多步执行（合规检查 → 场景 JSON → 生图 → VLM 评估 → 修复 → 多平台适配 → 合规元数据）
  → 自动选最优候选
  → 输出完整 listing pack（图 + 元数据 + 修复建议）
全程用户可见、可暂停、可干预
```

### 1.2 三条不可妥协的原则

| # | 原则 | 理由 |
|---|------|------|
| 1 | **可观测**：用户能"watch agent 思考"，每步 progress 可见 | 信任建立。Photoroom 1.3 星反面教材：用户不知道工具在干什么 |
| 2 | **可干预**：任何步骤可暂停/重跑/改参/分支 | 全自动 Agent 在 demo 中漂亮、生产中会退化成"模板填充"。HITL（Human-in-the-Loop）是必须 |
| 3 | **可降级**：模型失败/超预算时自动退到模板模式，不停服 | 成本控制 + 体验保底 |

### 1.3 三种 Agent 运行模式

| 模式 | 用在哪 | 用户参与度 |
|---|---|---|
| **Full Agent** | Pro/Brand 档默认 | 输入需求 → 看进度 → 收成品（5 分钟） |
| **Manual** | Pro+ 高级用户 | 每步选/改/重跑，类似 Photoshop |
| **Template** | Free / Starter / 降级 | 不走 Agent，直接套模板出图（成本极低） |

---

## 2. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│  PLANNER  (LLM, 强逻辑推理模型)                                  │
│  · 接收用户意图（"做亚马逊上架包"）                              │
│  · 接收上下文（商品类目、目标平台、品牌资产）                    │
│  · 输出：执行计划 DAG（节点 = 子任务，边 = 依赖）                │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  COORDINATOR  (状态机 + 任务调度器)                              │
│  · 按 DAG 调度 Executor                                          │
│  · 维护 AgentRun 状态（持久化到 DB）                             │
│  · 处理重试 / 降级 / 成本预算 / HITL 干预                        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────┬─────────────────────┬───────────────────┐
│  EXECUTORS（专职 agent）                                          │
├────────────────────────┼─────────────────────┼───────────────────┤
│ ComplianceExecutor     │ SceneJsonExecutor   │ ImageExecutor     │
│ (合规规则引擎)         │ (场景结构化)        │ (调图生成模型)    │
│                        │                     │                   │
│ APlusBuilderExecutor   │ BannerExecutor      │ MotionExecutor    │
│ (A+ 模块拼装)          │ (BannerAgency 分层) │ (旋转/zoom 动图)  │
│                        │                     │                   │
│ PlatformAdapter        │ C2PAStamper         │                   │
│ (尺寸适配)             │ (合规元数据)        │                   │
└────────────────────────┴─────────────────────┴───────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  CRITIC  (VLM 评估)                                              │
│  · 接收 Executor 产出 + CriticCard                               │
│  · 输出 JSON：scores + improvement_directions + decision         │
│  · decision: accept / refine / abort                             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                  ┌─────────────────┐
                  │  REFINER LOOP   │  (Painter-Commenter 反馈环)
                  │  最多 N 轮      │  带阻尼参数防震荡
                  └─────────────────┘
```

### 2.1 角色职责对照

| 角色 | 模型类型 | 是否复用 |
|---|---|---|
| Planner | 强推理 LLM（Claude Opus / GPT-5 / Gemini 2.5 Pro 等） | 一个 AgentRun 调用 1-2 次 |
| Coordinator | 不调模型，状态机代码 | 持续运行 |
| Executor | 各 Executor 调对应模型（生图模型、文本模型、OCR）| 多次 |
| Critic | VLM（GPT-4V / Gemini 2.5 Vision / Claude Vision） | 每个候选图 1 次 |

---

## 3. 核心模式 #1：Painter-Commenter 反馈环

### 3.1 起源：Paper2Poster

来自 NeurIPS 2025 Paper2Poster 工作。原理：
- **Painter**（执行 agent）生成产物
- **Commenter**（VLM 评估 agent）打分 + 给出改进方向
- **Painter** 按反馈再生
- 循环直到达标或达到上限

**关键防震荡**：参数更新带**阻尼**（damping factor）：
```
new_param = current_param + damping × (target_param - current_param)
其中 0 < damping < 1，通常 0.3-0.5
```
不带阻尼的话两轮就会震荡（参数在两个极端来回跳）。

### 3.2 ListPack 工程化映射

#### 数据结构

```typescript
// AgentRun 中的一个 refine loop
interface RefinementLoop {
  loop_id: string
  target_executor: string          // e.g. "SceneJsonExecutor"
  critic_card_id: string           // 用哪张 CriticCard 评估（见 § 11）
  max_iterations: 3                // 最多 3 轮，超过强制 accept 最高分候选
  damping: 0.4                     // 阻尼参数
  cost_cap_usd: 0.10               // 单 loop 成本上限
  
  iterations: Iteration[]          // 历史迭代
  final_decision: "accepted" | "max_iter_reached" | "cost_exceeded" | "aborted"
}

interface Iteration {
  iter: number                     // 第几轮
  candidate_asset_id: string       // 这轮生成的候选
  critic_result: CriticResult      // VLM 评估结果
  next_params_diff?: object        // 下一轮要改的参数 diff（带阻尼后的）
}

interface CriticResult {
  overall_score: number            // 0-10
  dimension_scores: {              // 按 CriticCard 维度
    [dim_name: string]: {
      score: number
      reasoning: string
    }
  }
  improvement_directions: string[] // VLM 给出的改进方向，文字描述
  decision: "accept" | "refine" | "abort"
}
```

#### 终止条件（任一触发即止）

1. `overall_score ≥ accept_threshold`（CriticCard 内定，例 8.0/10）
2. `iter == max_iterations`（兜底）
3. `cumulative_cost ≥ cost_cap_usd`（防失控）
4. `critic decision == "abort"`（VLM 判定不可救药，例如商品被检测为违禁品）
5. 用户人工干预 `pause`

#### 用例

| 场景 | CriticCard | 改进方向举例 |
|---|---|---|
| 场景图质量 | `aesthetic_card` | "光照过亮 → 降低 1 档"、"商品居中 → 左移 10%" |
| Banner 文字渲染 | `text_render_card` | "文字模糊 → 增加 font weight"、"对比度不够 → 换深色背景" |
| 品牌一致性（v2） | `brand_consistency_card` | "风格偏离 → 加大 brand LoRA 权重 0.2" |
| 电商转化（v3） | `ctr_card` | 基于历史 A/B 数据反馈 |

### 3.3 关键工程细节

#### 阻尼参数怎么应用

不是所有参数都能"数值化阻尼"。分两类：

**A. 连续参数**（直接套阻尼）
- 模型 guidance scale: `new_cfg = current_cfg + 0.4 × (target_cfg - current_cfg)`
- LoRA 权重、亮度、对比度

**B. 离散选择**（用概率阻尼）
- 风格选择（"日系"/"赛博朋克"/"极简")：保留前一轮选择的概率 `1 - damping`，否则改新方向
- 场景模板 ID：同理

#### 防止"评分越改越低"

如果新一轮 score < 上一轮 score，**回退到上一轮的候选**，并标记该方向为"无效"，下一轮改其他方向。

#### Critic 自身的可靠性

VLM 评分本身有噪声（同一张图问两次评分可能差 0.5）。对策：
- 高 stake 决策（"abort"）需要 VLM 调 2 次取一致
- 评分小数化只保留 1 位（避免假精度）
- CriticCard 设计时尽量"维度独立"（避免维度相关性放大噪声）

---

## 4. 核心模式 #2：场景 JSON 中间层（Omost 启发）

### 4.1 起源：Omost

ControlNet 作者 lllyasviel 的 [Omost](https://github.com/lllyasviel/Omost) 项目。核心思想：

**普通做法**：用户 prompt → 直接喂模型
```
用户："母亲节促销 banner，温馨"
→ 模型自由发挥，结果不可控（康乃馨可能没有、文字位置随机）
```

**Omost 做法**：LLM 先输出**结构化画布代码**，再喂模型
```
用户："母亲节促销 banner，温馨"
→ LLM 输出：
    Canvas.set_global_description("warm pink background")
    Canvas.add_local_description(loc="upper-left", "pink carnations bouquet")
    Canvas.add_local_description(loc="lower-right", "75% OFF text in elegant gold")
→ 渲染层按结构生成
```

### 4.2 ListPack 简化版：`scene_spec` JSON

不需要全套 Omost region attention 机制（实现复杂），但抄它的核心思想——**让 LLM 输出结构化场景描述，再拼成精准 prompt**。

#### scene_spec JSON Schema

```json
{
  "scene_spec_version": "1.0",
  "global": {
    "background": {
      "type": "solid" | "gradient" | "scene",
      "value": "white" | "outdoor_summer_garden" | "#FFE5E5",
      "lighting": "soft_diffused" | "hard_studio" | "natural_window",
      "mood": "warm" | "minimal" | "luxurious"
    },
    "color_palette": ["#F5C2C7", "#FFFFFF", "#333333"],
    "aspect_ratio": "1:1" | "4:5" | "16:9"
  },
  "product": {
    "asset_ref": "asset_01H...",            // 商品图引用
    "preserve_fidelity": true,              // 必须保真
    "position": "center" | "lower-third" | { "x": 0.5, "y": 0.65 },
    "scale": 0.85,                          // 占图比例
    "rotation": 0
  },
  "elements": [                              // 装饰元素
    {
      "type": "decoration",
      "description": "scattered rose petals",
      "position": "around_product",
      "density": "sparse" | "moderate" | "dense"
    }
  ],
  "text_overlays": [                         // 文字层（不依赖扩散模型渲染）
    {
      "content": "75% OFF",
      "position": { "x": 0.75, "y": 0.85 },
      "font_family": "Playfair Display",
      "font_size_pct": 0.08,
      "color": "#D4AF37",
      "weight": "bold"
    }
  ],
  "constraints": {                           // 平台约束（来自合规引擎）
    "no_text_in_image": false,
    "max_text_area_pct": 30,
    "background_must_be_white": false
  }
}
```

### 4.3 工作流：scene_spec 怎么产生和消费

```
┌──────────────────┐
│ 用户自然语言意图  │ "夏季清凉感、年轻女性、户外、克莱因蓝主色"
└──────────────────┘
         ↓
┌──────────────────┐
│ SceneJsonExecutor│  LLM (Claude / GPT-4)
│ + 商品 metadata  │  + 品类规则（apparel 不允许文字 overlay 在主图）
│ + 平台约束       │  + 品牌 BrandKit (v2)
└──────────────────┘
         ↓
┌──────────────────┐
│ scene_spec JSON  │  结构化、可校验、可编辑
└──────────────────┘
         ↓
┌──────────────────┐
│ PromptCompiler   │  把 scene_spec 转成图生成模型能吃的 prompt
│                  │  + ControlNet pose / depth（如果可用）
└──────────────────┘
         ↓
┌──────────────────┐
│ ImageExecutor    │  调 Nano Banana / Flux Kontext / gpt-image-2
└──────────────────┘
         ↓
┌──────────────────┐
│ TextOverlay      │  把 text_overlays 用代码渲染（不靠扩散模型）
│ (libvips/canvas) │
└──────────────────┘
```

### 4.4 为什么不让模型直接渲染文字

扩散模型（包括 Nano Banana / Flux）渲染文字仍然不稳定——尤其中文、长文字、小字号。
ListPack 把文字层**剥离出来用代码渲染**（libvips / Skia / HTML2Canvas），保证：
- 文字一定正确（来自 scene_spec.text_overlays.content 字段）
- 字号 / 颜色 / 位置精准（不需要 VLM 评估"文字写对了吗"）
- 多语言友好（中文、阿语、日语都没问题）

**例外**：Banner 的艺术化文字（手写体、3D 文字、立体装饰文字）仍然走模型——这种艺术效果代码渲染做不到。用 BannerAgency 模式分层处理（见下节）。

### 4.5 scene_spec 的好处（汇总）

| 好处 | 说明 |
|---|---|
| **可控** | 商品位置、文字位置、颜色 100% 精准 |
| **可缓存** | 同一份 scene_spec hash 命中缓存，0 成本返回 |
| **可编辑** | 用户在前端可点击"商品左移 10%"调 spec，不需要重写 prompt |
| **可解释** | 用户看到的是"商品位置：左下 / 文字：'75% OFF' 金色"而不是黑盒 prompt |
| **可重现** | 同 spec + 同 seed = 同图，便于 debug |
| **多语言** | LLM 用任何语言写 spec，渲染层语言无关 |

---

## 5. 核心模式 #3：分层 schema + 可编辑输出（BannerAgency 启发）

### 5.1 起源：BannerAgency

Sony 在 EMNLP 2025 的工作。核心：banner 拆成 3 层独立 agent 处理，**输出可编辑组件**（SVG / Figma），不是 PNG。

理由：电商美工 99% 要二次修改。给 PNG = 把用户赶去 Photoshop。给可编辑结构 = 用户能在 ListPack 里直接调。

### 5.2 ListPack 分层 schema

适用于：**Banner、A+ Content、详情长图**（不适用于场景图——场景图是整体艺术，分层无意义）。

#### `composition_spec` Schema

```json
{
  "composition_spec_version": "1.0",
  "canvas": {
    "width": 970,
    "height": 600,
    "background_color": "#FFFFFF"
  },
  "layers": [
    {
      "id": "bg_1",
      "type": "background_image",
      "source": "ai_generated" | "asset_ref" | "solid_color",
      "asset_id": "asset_01H...",
      "z_index": 0,
      "opacity": 1.0,
      "blend_mode": "normal"
    },
    {
      "id": "product_1",
      "type": "product",
      "asset_ref": "asset_01H...",
      "position": { "x": 100, "y": 150 },
      "size": { "width": 400, "height": 400 },
      "z_index": 1,
      "shadow": { "blur": 20, "offset_y": 10, "color": "#00000033" }
    },
    {
      "id": "callout_1",
      "type": "callout",                  // 信息点（A+ Content 常用）
      "anchor_to": "product_1",
      "anchor_point": "top-right",
      "icon": "icon_check",
      "text": "100% 纯棉",
      "font": { "family": "Inter", "size": 18, "weight": "bold" },
      "color": "#333"
    },
    {
      "id": "text_1",
      "type": "text",
      "content": "夏季新品 75% OFF",
      "position": { "x": 550, "y": 200 },
      "font": { "family": "Noto Sans CJK", "size": 48, "weight": "extra-bold" },
      "color": "#D4AF37",
      "text_align": "left",
      "z_index": 2
    },
    {
      "id": "decoration_1",
      "type": "vector_shape",
      "shape": "circle",
      "fill": "#FF6B6B",
      "position": { "x": 800, "y": 100 },
      "size": 80,
      "z_index": 1
    }
  ],
  "export_formats": ["png", "svg", "psd_layered"]
}
```

### 5.3 各层独立 Agent 处理

| 层 | 由谁处理 | 输出 |
|---|---|---|
| `background_image` | ImageExecutor + SceneJsonExecutor | PNG / 引用资产 |
| `product` | 直接引用源资产（不重新生成，保真） | 引用 |
| `callout` | TextLayerRenderer（代码渲染） | 文字 + 图标 |
| `text` | TextLayerRenderer（代码渲染） | 多语言文字 |
| `vector_shape` | SVG renderer（代码渲染） | 矢量 |
| `ai_artistic_text`（特殊） | ImageExecutor（艺术化文字必须走模型） | PNG with alpha |

### 5.4 三种导出格式

| 格式 | 用途 | 实现 |
|---|---|---|
| `png` | 平台上传 / 默认下载 | 把 layers 合成（libvips / Skia） |
| `svg` | 矢量编辑（Inkscape / Figma 可打开） | text/shape 直接 SVG，image 用 base64 嵌入 |
| `psd_layered` | Photoshop 直接编辑（Brand/Agency 段刚需） | 用 [ag-psd](https://github.com/Agamnentzar/ag-psd) 或类似库 |

**Pro 档**：png + svg
**Brand/Agency 档**：+ psd_layered

### 5.5 用户在 ListPack UI 里能干什么

- 看到分层列表（像 Photoshop）
- 点某层 → 改文字 / 改颜色 / 改位置
- 隐藏/显示某层
- 重新生成单层（"只重新生成背景"，product 层不变）
- 导出为 PNG / SVG / PSD

**与节点画布的区别**：不是 ComfyUI 那种"工程师拖节点"，而是"美工调图层"——目标用户接受度高。

---

## 6. Agent 状态机

### 6.1 状态枚举

```
AgentRun.status:
  pending          ← 已创建，等待调度
  planning         ← Planner LLM 在拆解
  running          ← 至少一个 Executor 在跑
  paused           ← 用户主动暂停
  awaiting_user    ← 等待用户决策（HITL，例如"5 个候选选哪个"）
  completed        ← 全部 step 完成
  failed           ← 不可恢复错误（成本超限 / 模型全失败）
  canceled         ← 用户取消
```

### 6.2 状态转移图

```
pending ─────────────────────────────────┐
   │                                       │
   ↓                                       │
planning ────[Planner 失败]────────────► failed
   │
   ↓
running ⇄ paused          (用户操作)
   │  ⇄ awaiting_user      (HITL)
   │
   ↓
  ┌─────────────┐
  │ 全部 step 完成│ ─────► completed
  └─────────────┘
  ┌─────────────┐
  │ 不可恢复错误 │ ─────► failed
  └─────────────┘
  ┌─────────────┐
  │ 用户取消    │ ─────► canceled
  └─────────────┘
```

### 6.3 状态持久化

每次状态变更**同步写 DB**（不是事后批量写）。具体字段在 `AgentRun.state` JSONB：

```json
{
  "plan": { /* Planner 产出的 DAG */ },
  "current_dag_node": "scene_generation",
  "completed_nodes": ["compliance_check", "scene_json"],
  "intermediate_assets": { "scene_json_1": "..." },
  "refinement_loops": { /* 每个 loop 的迭代历史 */ },
  "cost_spent_usd": 0.12,
  "hitl_pending": null | { /* 等用户决策的上下文 */ }
}
```

**断电恢复**：节点宕机后，另一个 worker 拿到 `running` 状态的 AgentRun，从 `current_dag_node` 继续。要求每个 Executor 都**幂等**（同输入两次执行得同结果，或第二次检测到已完成状态跳过）。

### 6.4 超时治理

- 单 Executor 超时：默认 60s，超时按"失败"处理走重试
- 整个 AgentRun 超时：默认 15min（Pro 档可调高到 30min），超时强制 fail
- HITL 等待超时：默认 24h 用户无响应，自动 cancel

---

## 7. 任务编排（DAG）

### 7.1 完整 listing pack 的 DAG 示例

```
                  ┌────────────────────┐
                  │ compliance_check   │  (源图先检查)
                  │ on source_asset    │
                  └────────────────────┘
                            │
              ┌─────────────┼──────────────┬──────────────┐
              ↓             ↓              ↓              ↓
       ┌──────────┐  ┌──────────┐   ┌──────────┐  ┌──────────┐
       │ main_img │  │ scene_   │   │ a_plus_  │  │ banner   │
       │ for      │  │ json     │   │ content  │  │          │
       │ amazon   │  │          │   │          │  │          │
       └──────────┘  └──────────┘   └──────────┘  └──────────┘
              │             │              │              │
              │             ↓              │              │
              │       ┌──────────┐         │              │
              │       │ image_   │         │              │
              │       │ executor │         │              │
              │       │ (lifestyle)│       │              │
              │       └──────────┘         │              │
              │             │              │              │
              │             ↓              │              │
              │       ┌──────────┐         │              │
              │       │ critic   │         │              │
              │       │ (refine  │         │              │
              │       │ loop)    │         │              │
              │       └──────────┘         │              │
              │             │              │              │
              └─────────────┴──────┬───────┴──────────────┘
                                   ↓
                          ┌────────────────┐
                          │ platform_      │
                          │ adapter        │   (各平台尺寸适配)
                          │ amazon/shopify/│
                          │ ebay/temu/shein│
                          └────────────────┘
                                   ↓
                          ┌────────────────┐
                          │ c2pa_stamper   │   (合规元数据)
                          └────────────────┘
                                   ↓
                          ┌────────────────┐
                          │ output_bundler │   (打包 listing pack)
                          └────────────────┘
                                   ↓
                                 [done]
```

### 7.2 DAG 由 Planner 动态生成

Planner LLM 不是返回硬编码 DAG。它根据：
- 用户选择的 modules（main_image / lifestyle / a_plus / banner / motion）
- 目标平台（Amazon 不需要 Temu 模板，反之亦然）
- 品类（apparel 需要 ghost mannequin，3C 不需要）
- 订阅档（Free 跳过 critic refine，Pro 才有）

**生成 DAG JSON 后存到 `AgentRun.plan`，后续步骤按此执行**。

### 7.3 并发控制

- 同一 AgentRun 内：DAG 允许的并行节点同时跑（fan-out），降低端到端延迟
- 不同 AgentRun 之间：Free 段最大并发 1，Starter 段 2，Pro 段 3，Brand 段 5，Agency 段 10
- 模型 API rate limit 共享：超限时排队 + 用户可见预计等待时间

---

## 8. 错误处理 / 重试 / 降级

### 8.1 错误分类

| 类型 | 例子 | 策略 |
|---|---|---|
| **网络瞬时错误** | 模型 API 5xx / timeout | 指数退避重试 3 次（1s/4s/16s） |
| **配额耗尽** | 用户 SKU 配额用完 | 立即 fail，引导升档/开启 overage |
| **模型输出违规** | NSFW / 违禁品检测命中 | 不重试，标记 fail 并通知用户 |
| **成本超限** | 单 run 超 cost_cap_usd | 降级（见 8.2） |
| **VLM 评分一直低** | refine loop 3 轮都不达标 | 接受最高分候选 + 标记 "best-effort" |
| **不可恢复错误** | DB 写失败 / 配置错误 | fail 整个 run + 上报 |

### 8.2 降级路径

```
Full Agent (multi-step + refine) [Pro/Brand]
        ↓ 成本/质量/失败超限
Single-shot Agent (一次性 prompt，无 refine) [Starter]
        ↓ 继续失败
Template Render (固定模板 + 文字替换，无 AI) [Free / fallback]
        ↓ 继续失败
Hard Fail (告知用户 + 全额退还该 SKU 配额)
```

**关键**：降级**对用户透明**——前端显示"模型质量不达标，已降级到模板渲染，配额已退还"。不能默默给低质量结果。

### 8.3 部分成功（partial completion）

DAG 里某节点失败，其他节点已成功：
- ListingPack.status = `partial`
- 用户能下载已成功的部分
- 失败部分给 retry 按钮 + 失败原因

---

## 9. 人工干预（HITL）

### 9.1 主动暂停

```
用户在 UI 点"暂停"
  → COORDINATOR 写 status = paused
  → 等待中的 Executor 完成当前操作后退出
  → 已经在跑的 Executor 完成手头再退出（不强杀）
  → 状态完整持久化
```

### 9.2 等待用户决策（awaiting_user）

某些步骤必须用户选择，自动模式下也要暂停：

| 场景 | 决策项 |
|---|---|
| 场景图 3-5 个候选 | 选 1 个继续 |
| 品类自动识别有歧义 | 确认品类 |
| 合规检查发现违规且无法自动修复 | 同意改 / 跳过 / 取消 |
| 成本即将超 cap | 同意继续 / 终止 |

每次进入 awaiting_user，COORDINATOR：
- 写 `state.hitl_pending = { question, options, deadline }`
- 触发前端通知（SSE event）
- 用户响应后 `POST /v1/agent-runs/:id/intervene` 推进

### 9.3 重跑 / 分支

```
用户对某一步不满意（"场景图都不好看"）
  → POST /v1/agent-runs/:id/intervene
    { action: "redo_step", step: "scene_generation",
      params_override: { scene_id: "outdoor_summer", style: "minimal" } }
  → COORDINATOR 把 plan 中该节点之后的所有 completed 节点回退
  → 重新执行
```

**分支**（保留原结果同时生成新版本）：
```
  → POST /v1/agent-runs/:id/intervene
    { action: "fork", step: "scene_generation", params_override: {...} }
  → COORDINATOR 创建新 AgentRun（parent_run_id 指向原 run）
  → 用户后续能对比两个版本
```

---

## 10. CriticCard 设计（参考 autocritic）

### 10.1 起源：autocritic

[autocritic (mccoyspace)](https://github.com/mccoyspace/autocritic) 是个小而精的开源项目，把"美学评分"做成可配置的 JSON 卡，VLM 按卡评估并输出结构化反馈。

### 10.2 ListPack CriticCard Schema

```json
{
  "card_id": "ecom_aesthetic_v1",
  "name": "电商场景图美学评估",
  "version": 1,
  "scope": ["scene_image", "lifestyle"],   // 适用范围
  "dimensions": [
    {
      "name": "product_fidelity",
      "weight": 0.30,
      "description": "商品形状/颜色/纹理是否保真",
      "scoring_rubric": {
        "10": "与原图完全一致，零失真",
        "7": "细节略有差异但可接受",
        "4": "明显失真（颜色偏移 / 边缘模糊）",
        "0": "完全不像原商品"
      }
    },
    {
      "name": "lighting_quality",
      "weight": 0.20,
      "description": "光照自然度、阴影合理性"
    },
    {
      "name": "composition",
      "weight": 0.20,
      "description": "构图（三分法 / 留白 / 主体突出）"
    },
    {
      "name": "scene_relevance",
      "weight": 0.15,
      "description": "场景与商品的语义匹配度"
    },
    {
      "name": "ecommerce_appeal",
      "weight": 0.15,
      "description": "电商场景下的购买吸引力"
    }
  ],
  "accept_threshold": 8.0,
  "abort_conditions": [
    "product_fidelity < 4",
    "any dimension < 2"
  ],
  "vlm_prompt_template": "你是电商创意总监...（按 dimensions 评分并给改进方向）..."
}
```

### 10.3 内置 CriticCards（v1 至少 6 张）

| Card ID | 用在哪 |
|---|---|
| `ecom_aesthetic_v1` | 场景图通用 |
| `text_render_v1` | Banner / A+ 文字 |
| `product_fidelity_v1` | 任何含商品的图（保真度专评） |
| `amazon_compliance_v1` | 合规预检（Amazon 主图） |
| `brand_consistency_v1`（v2） | 与 BrandKit 对照 |
| `ctr_prediction_v1`（v3） | 基于历史 CTR 数据训的预测 |

### 10.4 用户自定义 CriticCard（v2）

Brand/Agency 档允许用户写自定义 card：
```
品牌 X 的 ecom card：
  - product_fidelity: weight 0.20
  - brand_color_match: weight 0.30 (自定义维度，对照品牌色 #FF6B6B 容差)
  - mood: weight 0.20 (必须 "luxurious")
  - composition: weight 0.15
  - ctr_prediction: weight 0.15
```

---

## 11. 关键技术挑战 + 解决方案

### 11.1 长任务可观测性

**挑战**：用户在 5 分钟黑屏等待 → 体验灾难。

**方案**：
- SSE/WebSocket 流式 event（已写进 [01-system-design § 4.3](01-system-design.md)）
- 每步**预估时长**显示在 UI（"预计 35 秒"）
- 候选图边生成边显示（progressive reveal），不是全部完成才显示
- 即使 Agent 还在跑，已完成的中间产物用户可以预览/下载

### 11.2 中间状态体积过大

**挑战**：`AgentRun.state` JSONB 在长 refine loop 后可能 MB 级，DB 写性能崩。

**方案**：
- 大对象（候选图、scene_spec 历史）存对象存储，state 里只存引用
- state 字段做 size cap（例 100KB），超出强制把详情转存
- refine 历史超过 N 轮只保留最新 3 轮 + 最高分 1 轮

### 11.3 LLM 输出不稳定

**挑战**：Planner / SceneJsonExecutor / Critic 都依赖 LLM 输出 JSON，但 LLM 偶尔会输出非法 JSON / 缺字段。

**方案**：
- 全部使用结构化输出 API（OpenAI Structured Outputs / Claude Tool Use / Gemini structured output）
- 每个 Executor 都有 JSON Schema 校验
- 校验失败 → 自动 retry（"上次输出格式错误，请输出严格符合 schema 的 JSON"）
- 3 次都失败 → 降级到模板模式

### 11.4 多 Agent 并发抢资源

**挑战**：模型 API rate limit 共享（一个用户的 Agent 跑爆了影响其他用户）。

**方案**：
- 按 workspace 分配 rate limit budget
- 全局 rate limit pool + 排队
- 高峰期 Free 用户被降级到模板（保护 Pro+ 体验）
- 模型 API 厂商配额预留 30% 给突发

### 11.5 成本失控

**挑战**：一个用户开 Manual 模式反复重跑可能烧爆成本。

**方案**：
- 单 AgentRun cost cap（订阅档定）
- 单 workspace 日成本 cap（防滥用）
- 重跑超 N 次提示用户"是否升档"
- Pro 档每月成本预算（例 $5/Pro 用户/月），超出降级

---

## 12. v2 / v3 Agent 扩展（前置设计）

### 12.1 v2：Brand Agent

**作用**：根据 BrandKit 自动产出符合品牌的所有素材。

**新增能力**：
- BrandKit 训练（5-20 张品牌图 → 提取品牌色/字体/版式/模特 → 训 LoRA）
- Brand-aware scene_spec 生成（自动注入品牌色到 color_palette）
- `brand_consistency_v1` CriticCard 强制评估

**接口扩展**：`POST /v1/brand-kits`（创建）/ `POST /v1/agent-runs` 里加 `brand_kit_id` 参数。

### 12.2 v3：A/B Test Agent

**作用**：自动生成 N 个变体 → 上 Listing A/B → 反馈数据 → 选优。

**新增能力**：
- VariantGenerator Executor（生成 3-5 个差异化版本）
- 平台 A/B 集成（Amazon Manage Your Experiments / Shopify Theme A/B）
- 数据回流（PV / CTR / CR 入 DB）
- `ctr_card` CriticCard（基于历史数据的 CTR 预测模型）

### 12.3 v3：Cross-platform Sync Agent

**作用**：一处改、多平台同步（图 / 文案 / 价格）。

**新增能力**：
- VariantBinder（一个"主版本"绑定多平台 listing）
- 差异化适配（同主图 → 每个平台尺寸/合规自动调）
- 同步状态监控（哪个平台同步成功 / 失败 / 待审核）

---

## 13. 关联文档

| 主题 | 文档 |
|---|---|
| API 契约（含 SSE 流式） | [`01-system-design.md § 4`](01-system-design.md) |
| 合规规则引擎（Executor 调用的核心服务） | [`03-compliance-engine.md`](03-compliance-engine.md) |
| 开源项目集成（怎么 fork autocritic / 借鉴 Paper2Poster 等） | [`04-open-source-stack.md`](04-open-source-stack.md) |
| 调研依据（哪些 Agent 模式已被验证） | [`docs/research/05-competitor-matrix § 真实功能缺口`](../research/05-competitor-matrix.md) |
