# Studio Phase 1 — 设计 spec

**状态**：设计稿（待用户复核 → writing-plans）
**日期**：2026-05-24
**作用域**：`apps/web` 内的 `/studio` 体验，及配套 schema / API

---

## 0. 上下文与目标

当前 `/studio` 已端到端跑通（chat 列表 + 出图 + 落库 + 落盘），但仍是「单次出图 → 死」的形态：用户出了一张满意的图后，**无法基于它继续迭代**（无 Reroll/Variations/Remix）；也**无法保留并复用一组好用的设定**（无 Moodboard）。

Phase 1 的目标是补齐**留存核心闭环**：
1. 出图后能一键再来一发 / 变体 / 改 prompt 再画
2. 能把"prompt + 参考图 + 参数"存成可复用的配方卡（Moodboard）
3. 历史所有图能在一个 Library 路由里浏览
4. 把模型能力差异**显式表达在 UI 上**（capability gating），为未来 Phase 2/3 接 inpaint/outpaint 等铺路

非目标：Phase 1 **不**改账户系统、**不**做团队协作、**不**做社区/Explore、**不**做 Personalize / LoRA。

---

## 1. 范围（in vs out）

### 1.1 In scope

| 主题 | 改动 |
|---|---|
| 模型能力清单 | `lib/studio/models.ts` 加 `capabilities` 子对象（6 个字段），UI 读它决定按钮 enable/disable |
| Refs 槽位分化 | DB `image_messages.refs` 改 `jsonb [{ asset_id, role: 'content'\|'style'\|'character' }]`；Composer UI 拆 2-3 个分组；server 按 role 构造 prompt 前缀 |
| 卡片二次操作 | 出图卡 hover 显示 Reroll + Download；点图开 Lightbox（大图 + 动作面板） |
| Reroll | 无 lineage UI；后端写 `parent_message_id`；客户端复用上次请求体 |
| Variations | 同 prompt + 同 model；源图进 `content_ref`；n=4（clamp 到 maxN） |
| Remix | 同 Variations，但先把 prompt 灌回 Composer 让用户编辑 |
| Moodboard（中量版） | 新表 `moodboards`；Composer 旁 📚 按钮 + 右滑抽屉；卡片点击 = 完全覆盖 Composer 状态；user 私有；首次成功应用后自动写 cover_asset_id |
| 空状态示例 prompt | ChatCanvas 空态 hardcode 4 张样例卡片 |
| 配额可视化 | header chip 改"仅 ≤20% 显示 + 色阶"；Composer 加"本次扣 N 张" tiny chip |
| Disabled UI 处理 | capability 不支持时按钮置灰 + tooltip + 引导切模型 |
| 切模型兼容性 | 保留 refs，不兼容参数发 warning，不删 |
| 派生 lineage 字段 | `image_messages.parent_message_id`（Reroll/Variations/Remix 写入，UI 不展示） |
| Conversational mode（方案 III） | Composer toggle；multiTurn 模型走原生历史 messages，imageInput 模型走"自动接龙"（上一张图当 content_ref） |
| Library 路由 `/studio/library` | header 加链接；workspace 全部 generated assets 按月分组 + 模型 filter + cursor 分页 |
| Imagine bar 双层化 | Composer 改双层：顶部 toggle 条 + 主输入行 + 右下 Settings 抽屉（quality / seed / 透明背景 等 capability-gated） |

### 1.2 Out of scope（明确原因）

| 项 | 推后原因 |
|---|---|
| Lightbox 内 Edit / Pan / Zoom / Vary Region 的**真实现** | 🔴 依赖 `gpt-image-2` 渠道，sparkcode 当前耗尽；Phase 1 只渲染 disabled 占位 |
| Library 文件夹 / 收藏 / 文本搜索 | 🟡 数据 < 50 张前不痛 |
| Moodboard 变量模板（`{{X}}`） | 🟡 占位语法 / 转义 / 校验是独立 DSL，需单独 brainstorm |
| Moodboard 协作 / 公开发布 | 🟡 权限模型需独立讨论 |
| Personalize profiles | 🟡 和 Moodboard 重叠，等观察 Moodboard 使用数据后再评估 |
| Explore / 社区 | 🔴 等价于第二个产品（content pool、moderation、curation） |
| 拆 `(studio)` 顶级路由 | 暂留单 layout，路由仅新增 `library` |

---

## 2. 数据模型变更

### 2.1 修改现有表

**`image_messages`**
- 删 `ref_asset_ids uuid[]`
- 加 `refs jsonb` — 形如 `[{ asset_id: uuid, role: 'content' | 'style' | 'character' }]`，role 枚举校验在 API zod schema 层
- 加 `parent_message_id uuid NULL REFERENCES image_messages(id) ON DELETE SET NULL`
- 加 `CREATE INDEX idx_image_messages_parent ON image_messages (parent_message_id) WHERE parent_message_id IS NOT NULL`

**`members`**（drift 补迁移）
- `invited_at timestamp NOT NULL DEFAULT now()`（hot-patched，迁移正式落）
- `joined_at` 改 nullable，去 default（同上）

### 2.2 新增表

```sql
CREATE TABLE moodboards (
  id              uuid PRIMARY KEY,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           varchar(200) NOT NULL,
  prompt_template text NOT NULL,
  model           varchar(100),
  size            varchar(20),
  aspect_ratio    varchar(10),
  refs            jsonb,
  cover_asset_id  uuid REFERENCES assets(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  deleted_at      timestamp NULL
);
CREATE INDEX idx_moodboards_user_active
  ON moodboards (user_id, deleted_at NULLS FIRST, updated_at DESC);
```

### 2.3 关键设计点

- `moodboards.workspace_id` 存但 Phase 1 不读，为未来 workspace 共享留接口
- `refs` 里的 `asset_id` 不做 FK（PG 不能 FK jsonb 数组元素）；删源 asset 不 cascade，**应用 Moodboard 时 server 软容忍**：跳过缺失 ref + 响应里 `warnings` 字段告知
- `cover_asset_id` 首次成功应用并出图后异步写入，幂等（`WHERE cover_asset_id IS NULL`），并发安全
- `deleted_at` 软删，与 `image_chats` 一致

### 2.4 迁移文件

新增 `apps/web/lib/db/migrations/0003_studio_phase1.sql`，包含上述全部 ALTER / CREATE。

---

## 3. 能力矩阵（capability matrix）

### 3.1 字段定义

```ts
// lib/studio/models.ts
interface ModelCapabilities {
  imageInput: boolean;            // 接受 ref 图像（i2i）
  inpaint: boolean;               // 支持 mask 局部重绘
  outpaint: boolean;              // 支持外延（透明边框 + inpaint）
  seed: boolean;                  // 可指定 seed 复现
  transparentBackground: boolean; // 输出可透明 PNG
  multiTurn: boolean;             // 原生多轮上下文一致性
}

interface StudioModel {
  // 现有字段保留: id / label / group / endpoint / defaultSize / defaultAspectRatio / maxN
  // 删除: supportsImg2Img / supportsMask （被 capabilities.imageInput / inpaint 替代）
  capabilities: ModelCapabilities;
}
```

### 3.2 三模型真值表

| 字段 | gpt-image-2 | gemini-3.1-flash-image-preview | gemini-3-pro-image-preview |
|---|---|---|---|
| `imageInput` | ✓ | ✓ | ✓ |
| `inpaint` | ✓ | ✗ | ✗ |
| `outpaint` | ✓ | ✗ | ✗ |
| `seed` | ✓ | ✗ | ✗ |
| `transparentBackground` | ✓ | ✗ | ✗ |
| `multiTurn` | ✗ | ✓ | ✓ |

### 3.3 UI gating 一览

| Cap | Phase 1 控件 |
|---|---|
| `imageInput` | Composer 📎 按钮 + Variations/Remix 按钮（Reroll 不受此影响——它纯粹复用上次请求体） |
| `inpaint` | Lightbox 内 Vary Region / Erase 按钮（Phase 1 占位 disabled） |
| `outpaint` | Lightbox 内 Pan / Zoom Out 按钮（Phase 1 占位 disabled） |
| `seed` | Settings 抽屉里的 seed 输入框 |
| `transparentBackground` | Settings 抽屉里的 "透明背景" 复选框 |
| `multiTurn` | Composer "对话上下文" toggle 的实际行为分支；Refs 的 `character` 角色 |

### 3.4 Disabled 视觉规范

按钮 / 输入框 `opacity-50 cursor-not-allowed` + `title` tooltip：
> 「当前模型 ${modelLabel} 不支持 ${操作中文名}，请切换到 ${第一个支持该 cap 的模型 label}」

### 3.5 Helper

`lib/studio/models.ts` 暴露：
```ts
export function modelSupports(modelId: string, cap: keyof ModelCapabilities): boolean
export function firstModelSupporting(cap: keyof ModelCapabilities): StudioModel | null
```

---

## 4. API 变更

### 4.1 修改现有 endpoint

#### `POST /api/studio/chats/[id]/generate`

请求体 zod schema 同步更新：

```ts
{
  prompt: string,
  model: string,
  n: number,
  size?: string,                    // endpoint='images' 时使用
  aspectRatio?: string,             // endpoint='chat' 时使用
  refs?: Array<{ asset_id: uuid, role: 'content' | 'style' | 'character' }>,
  conversational?: boolean,
  parentMessageId?: uuid,
  seed?: number,                    // capability-gated
  transparentBackground?: boolean,  // capability-gated
  moodboardId?: uuid,               // hint：成功后回写 cover_asset_id
}
```

服务端行为：

1. **Capability 校验**：所有 capability-gated 字段（`seed` / `transparentBackground` / `conversational` / `refs[*].role='character'`），若 `getModel(model).capabilities[cap] === false` → 400 `{ error: 'capability_unsupported', cap, model }`
2. **Refs 按 role 拼 prompt 前缀**：构造 `effectivePrompt`，content 前缀如 `[content reference]`、style 前缀如 `[style reference]`、character 前缀如 `[keep character consistent]`，具体措辞集中在 `lib/studio/upstream.ts` 维护
3. **conversational=true 路径**（方案 III）：
   - `model.capabilities.multiTurn === true`：取本 chat 内最近 8 条 completed messages，按时间序构造 `messages: [...]` 数组发给上游（Gemini 路径）
   - `multiTurn === false` 但 `imageInput === true`：从本 chat 最近的 completed assistant message 找首张 output asset，**自动追加进 refs 作为 content role**
   - 都不满足：400（实际三个模型都至少有 imageInput，不会触发）
4. **写 `parent_message_id`** 到新 message
5. **moodboardId 处理**：生成成功后，若 moodboard 属于当前 user 且 `cover_asset_id IS NULL` 且本次有 output → **fire-and-forget**：`UPDATE moodboards SET cover_asset_id = $first_output WHERE id = $moodboardId AND cover_asset_id IS NULL`。Moodboard 不属于当前 user → **静默忽略**（hint 不应阻塞生成）

响应：补充 `warnings?: string[]`（如 `'skippedRefs: 2'`、`'autoAppendedRefFromHistory'`）。

#### `GET /api/studio/chats/[id]`

Response 内 messages 增加 `refs`（新 jsonb 形态）和 `parent_message_id` 字段。

#### 不变

`POST /api/assets`、`GET /api/studio/models`（capabilities 自动透出）、`GET /api/studio/chats`、`POST /api/studio/chats`、`DELETE /api/studio/chats/[id]`。

### 4.2 新增 endpoint

| Method + Path | 作用 | Body / Query | 鉴权 |
|---|---|---|---|
| `GET /api/studio/moodboards` | 列出当前 user 的 Moodboards（未软删，按 updated_at desc） | `?limit=&cursor=` | 登录 |
| `POST /api/studio/moodboards` | 创建 | `{ title, prompt_template, model?, size?, aspectRatio?, refs?, notes? }` | 登录 |
| `GET /api/studio/moodboards/[id]` | 获取单条（含 cover_url + refs 内 asset publicUrl 已 join；坏 ref 自动剔除并放入响应 `warnings`） | — | 登录 + 创建者 |
| `PATCH /api/studio/moodboards/[id]` | 部分更新 | 任意字段子集 | 登录 + 创建者 |
| `DELETE /api/studio/moodboards/[id]` | 软删（set deleted_at） | — | 登录 + 创建者 |
| `GET /api/studio/library` | 当前 workspace 的所有 generated assets（倒序、可筛 model） | `?model=&before=&limit=` | 登录 + workspace 成员 |

`GET /api/studio/library` 响应：

```json
{
  "items": [
    {
      "assetId": "...",
      "publicUrl": "...",
      "mime": "image/jpeg",
      "createdAt": "...",
      "model": "gemini-3.1-flash-image-preview",
      "chatId": "...",
      "chatTitle": "...",
      "messageId": "...",
      "promptExcerpt": "前 80 字符..."
    }
  ],
  "nextCursor": "..." | null
}
```

实现：SQL `assets a JOIN image_messages m ON a.id = ANY(m.output_asset_ids) JOIN image_chats c ON m.chat_id = c.id WHERE c.workspace_id = $ws AND c.deleted_at IS NULL`，cursor 为 `(created_at desc, asset_id)`，每页 24。

---

## 5. UI 变更（按组件）

### 5.1 修改

#### `app/(studio)/layout.tsx` — header

- 加导航链接 `Studio` / `图库`，放 logo 右侧，active 用下划线 + orange
- `QuotaBadge` 条件渲染：仅当 `remaining / quota ≤ 0.2` 时显示；色阶（< 30% 橙、< 10% 红）保留

#### `PromptComposer.tsx` — 双层 Imagine bar 改造

```
┌─ 顶部 toggle 条 ───────────────────────────────────────────┐
│ [📚 Moodboard]  [💬 对话上下文]   模型▾  数量▾  尺寸▾  [⚙️] │
└──────────────────────────────────────────────────────────┘
┌─ Refs 槽位区（仅有 ref 时显示） ───────────────────────────┐
│ 内容参考: [img][img][+]   风格参考: [img][+]              │
│ [character: 仅 multiTurn 模型显示]                         │
└──────────────────────────────────────────────────────────┘
┌─ 主输入行 ────────────────────────────────────────────────┐
│ [📎] [   textarea (2 row)         ] 本次扣 1 张  [▶ Send] │
└──────────────────────────────────────────────────────────┘
```

- 顶部 toggle 条：Moodboard 按钮（开抽屉）/ 对话上下文 toggle（capability-gated）/ model picker / n picker / size or aspect / Settings ⚙️
- Settings 抽屉（点 ⚙️ 右滑，宽 320px）：quality（gpt 才显示）/ seed + 随机 button / 透明背景 checkbox
- Refs 槽位：拆 2-3 分组，每组独立 + 上传；保留 📎 但点击后弹角色 picker
- "本次扣 N 张" tiny chip：textarea 右、Send 左，跟随 n picker

#### `ChatCanvas.tsx`

- 空状态：换成 `EmptyStateSamples`（4 张样例卡片）
- assistant 输出卡：`cursor: zoom-in`；hover 时右上显示 ↻ Reroll + ↓ Download；点图开 Lightbox
- user message：refs 缩略图按 role 分色（content 默认 / style 淡紫 / character 淡绿）

### 5.2 新增组件

#### `_components/Lightbox.tsx`

全屏 overlay（点遮罩 / ESC 关）。布局：大图居中 + 元数据条 + 右侧/下方动作面板：

```
Actions:
  ↻ Reroll        ▦ Variations
  ✎ Remix...      ↓ 下载
  ─────────────
  🔒 Vary Region   (disabled, inpaint cap-gated)
  🔒 Pan / Zoom    (disabled, outpaint cap-gated)
```

- Reroll：**无二次确认弹窗**，点击即发；复制原 message 的 prompt/model/n/size/refs。卡片 hover 的 ↻ 按钮行为完全一致
- Variations：**无二次确认弹窗**，点击即发；append 本 asset 进 content_ref，n=4 clamp 到 model.maxN
- Remix：关 Lightbox + 填回 Composer（prompt + 本 asset 进 content_ref，refs 其它清空），focus textarea；用户改完按 Send 才真正生成
- 下载：a[download] 直拉文件

#### `_components/MoodboardDrawer.tsx`

Composer 📚 按钮触发，右滑 320px：

```
┌─ 我的 Moodboard ─────── [+ 新建] ─┐
│ [cover] 标题 · 模型简称              │
│ [cover] 标题 · 模型简称              │
│   ...                              │
└────────────────────────────────────┘
```

- 点卡片 → **覆盖以下 Composer 字段**：`prompt` / `model` / `size 或 aspectRatio` / `refs`；**保留**：`n`、Settings 抽屉里的 `seed` / `transparentBackground` / `quality`、Conversational toggle。Moodboard 字段为空（如未存 model）则不动对应 Composer 字段。覆盖后关抽屉
- 点 + 新建 → 抽屉内切换为表单（title / notes / "把当前 Composer 状态存进来"勾选默认 true）；勾选时**快照存入**：`prompt` → `prompt_template`、`model` / `size` / `aspectRatio` / `refs` 一一对应。Settings 抽屉里的字段（seed / transparent / quality）**不存**（Phase 1 收敛 Moodboard 字段范围）
- 长按 / 右键卡片 → 重命名 / 删除小菜单
- ref 缩略图若 publicUrl 缺失（坏 ref），位置显示占位图标 + 角标；不阻塞应用动作

#### `_components/SettingsDrawer.tsx` / `_components/RefSlots.tsx` / `_components/EmptyStateSamples.tsx` / `_components/CapabilityGated.tsx`

按 5.1 描述独立小文件，便于各自单测。

### 5.3 新增路由

#### `app/(studio)/library/page.tsx` + `_components/LibraryGrid.tsx`

- 复用 `(studio)/layout.tsx` header
- 主区：按月分组（"2026 年 5 月" / "2026 年 4 月" ...）+ 4 列网格
- 顶部 filter 条：model 多选 chip + 重置
- cursor 分页"加载更多"按钮（不无限滚）
- 点图开同款 Lightbox；Remix 跳回该图所属 chat + Composer 已填好
- 空态：「还没生成过图片，去 Studio 开始你的第一张」+ CTA

### 5.4 Types 更新

`(studio)/studio/_components/types.ts`：
- `ChatMessage.refs: Array<{ asset_id: string, role: 'content' | 'style' | 'character' }>`
- `ChatMessage.parentMessageId?: string`
- 新增 `MoodboardSummary` / `MoodboardDetail` / `LibraryItem`

### 5.5 空状态 4 张样例 prompt

中文，分别覆盖 4 个使用面，hardcode 在 `EmptyStateSamples`：

1. 写实产品图（默认走 GPT 模型）
2. 极简插画（默认 Gemini 3.1 Flash）
3. 赛博朋克场景（默认 Gemini 3 Pro）
4. 多图融合 i2i（默认 GPT，附 1 张占位 ref）

点卡片 → 预填 Composer（含模型切换 + ref 填入）。

---

## 6. 边界情况与错误处理

### 6.1 切模型 → capability 失配

| 触发 | 处理 |
|---|---|
| refs 含 character role，切到非 multiTurn 模型 | refs 保留，缩略图加灰罩 + 角标"该模型不读取"；提交时 server 自动剔除 |
| Settings 抽屉里的值不再支持（seed / 透明背景） | 值保留控件灰态 + tooltip；提交时 server zod 剔除 + toast warning |
| 对话上下文 toggle 开着，切到既无 multiTurn 又无 imageInput 的模型 | toggle 自动关 + toast |
| 从 Gemini 切 GPT（multiTurn=false 但 imageInput=true） | toggle 保持开 + chip 文案改为"自动接龙参考图" + tooltip 解释 |

### 6.2 配额边界

| 触发 | 处理 |
|---|---|
| 剩余 < 请求数 | server 返回 `402 { error: 'quota_insufficient', remaining, requested }`；UI inline 红字 + /pricing 链接 |
| 剩余 = 0 | 同上 + Submit 按钮隐藏 + composer 整体置灰 |
| 配额耗尽时 Lightbox 内 Reroll/Variations | 按钮灰态 + tooltip"配额不足"，点击静默 |

### 6.3 缺失 / 失败源

| 触发 | 处理 |
|---|---|
| Reroll / Variations / Remix from failed message | 按钮**不渲染** |
| Lightbox 打开时 message 还在 generating | 不显示二次操作按钮，只显 "生成中..." |
| 应用 Moodboard，refs 里某 asset 已不存在或 user 无权访问 | server 静默剔除坏 ref + 响应 `warnings: ['skippedRefs: N']`，UI toast |
| Moodboard 抽屉里 cover_asset_id 不可访问 | 显示占位图标，不阻塞列表 |
| Conversational mode 方案 II 找不到上一条 completed assistant message | 静默退化为无追加，不报错 |

### 6.4 并发 / 重复

| 触发 | 处理 |
|---|---|
| 同 chat 内有 pending generate，再点 Reroll/Variations/卡片按钮 | UI per-chat `pendingGenerateCount` 状态，> 0 时所有发起入口 disabled + tooltip"上次生成还在进行中" |
| Moodboard cover_asset_id 并发回写 | `WHERE cover_asset_id IS NULL` 幂等保证 |
| 同一 Moodboard 两端同时 PATCH | 以最后写入为准（Phase 1 不做乐观锁） |

### 6.5 鉴权

| 触发 | 处理 |
|---|---|
| `PATCH/DELETE /api/studio/moodboards/[id]` 非创建者 | 403 `{ error: 'forbidden' }` |
| `GET /api/studio/moodboards/[id]` 非创建者 | 403（同 workspace 也不行，Phase 1 user 私有） |
| `POST .../generate` 带的 `moodboardId` 属于他人或不存在 | **静默忽略**（不写 cover），不阻塞生成 |
| `GET /api/studio/library` 非 workspace 成员 | 403 |

### 6.6 SQL / 性能

| 项 | 处理 |
|---|---|
| Library 反查 `output_asset_ids @> ARRAY[a.id]` | 现规模 OK；未来若慢，Phase 2 加 `assets.source_message_id` 反向列 |
| Library 分页 | cursor `(created_at desc, asset_id)`，每页 24 |
| Moodboard 列表 | 索引 `idx_moodboards_user_active`，按 updated_at desc，每页 50 |

### 6.7 生成失败的配额

维持现有"失败即退"行为（`generate route` 当前实现）。

---

## 7. 验收标准

### 7.1 数据迁移健康

- [ ] 全新 DB 上 `pnpm db:migrate` 一次走完 3 个迁移成功
- [ ] `members` 表正式迁移对齐 `schema.ts`（含 `invited_at`、`joined_at` nullable）
- [ ] `image_messages` 表有 `refs jsonb` 和 `parent_message_id`，`ref_asset_ids` 已删
- [ ] `moodboards` 表存在 + FK / index 齐全
- [ ] 现有 smoke 数据（`test@test.com` 的 chat 和那张像素猫）迁移后仍可读

### 7.2 Capability gating

- [ ] `GET /api/studio/models` 返回 capabilities，值与 §3.2 真值表一致（断言式单测）
- [ ] 手测切模型：Gemini→GPT character ref 项消失、对话上下文 chip 文案变、seed / 透明背景变 enabled；反向亦然
- [ ] 所有 disabled 控件 hover 出形如 `"当前模型 X 不支持 Y，请切换到 Z"` 的 tooltip

### 7.3 Refs 槽位

- [ ] Composer 显示 2 或 3 个分组（依 capability）
- [ ] 📎 弹角色 picker → 选定 → 上传 → 出现在对应分组
- [ ] 提交请求体内 `refs: [{asset_id, role}]` 形态正确（dev tools 验证）
- [ ] 上传 1 张 content + 1 张 style 提交，dev log 显示 `effectivePrompt` 含两个 prefix
- [ ] zod 校验：手工构造 `role: 'foo'` 的请求 → 400

### 7.4 Reroll / Variations / Remix

- [ ] 卡片 hover 右上 ↻ ↓ 两枚；点 ↻ 触发同参重发
- [ ] 点图开 Lightbox → Reroll / Variations / Remix / Download + 2 枚 disabled 占位
- [ ] Variations：新 message n=clamp 后值；refs 第一项是源 asset 且 role=content
- [ ] Remix：关 Lightbox + Composer prompt 已填 + 源 asset 在 content_ref + textarea focused
- [ ] 三动作生成的新 message 的 `parent_message_id` 都正确（SQL 直查验证）
- [ ] failed message **不显示** 这三个按钮
- [ ] 同 chat 有 pending generate 时所有发起入口 disabled

### 7.5 Conversational mode（III）

- [ ] Toggle 仅 imageInput 模型 enable（三模型都有，实际永远 enable）
- [ ] Gemini 路径：开启后 dev log 显示上游 `messages` 数组含历史 messages
- [ ] GPT 路径：开启后 dev log 显示自动追加上一条 completed assistant 首图到 refs
- [ ] 找不到上一条 completed assistant 时退化为无追加，不报错
- [ ] toggle per-session 状态（组件 state，不持久化），刷新默认 off

### 7.6 Moodboard

- [ ] CRUD 四个 endpoint 各打 curl 都 200 + 形态正确
- [ ] Composer 📚 开抽屉；"+ 新建" 弹表单；提交后新卡片立刻出现
- [ ] 点卡片：Composer 状态被完全覆盖（model / size / refs / prompt 都改）
- [ ] 应用后首次成功 generate → SQL 查 `moodboards.cover_asset_id` 已写入
- [ ] 再应用 + 再 generate → cover_asset_id 不变（幂等）
- [ ] 应用含"已失效 ref"的 Moodboard：响应 warnings 不空 + UI toast

### 7.7 Library

- [ ] `/studio/library` 渲染当前 workspace 全部 generated assets 按月倒序
- [ ] Model filter chip 多选生效
- [ ] cursor 分页"加载更多"工作
- [ ] 点图开同款 Lightbox；Remix 跳回 chat + Composer 已填
- [ ] 软删的 chat 的图**不出现**在 Library

### 7.8 UI 杂项

- [ ] header `Studio` / `图库` active 状态正确
- [ ] 配额 chip 在剩余 ≥ 20% 时不显示；< 20% 出现且色阶切换正确
- [ ] Composer "本次扣 N 张" chip 联动 n picker
- [ ] 空状态 4 张样例 prompt 显示，点击预填 Composer
- [ ] Settings ⚙️ 抽屉开/关丝滑

### 7.9 验收范围说明（限制）

以下功能 Phase 1 **只验证 UI gating，不验证模型实际效果**（因 sparkcode 上 `gpt-image-2` 渠道耗尽）：
- `seed` 输入框真正影响生成
- `transparentBackground` 输出真正透明
- inpaint / outpaint 实际流（Phase 1 仅占位 disabled）

待 sparkcode 渠道恢复后单独冒烟，不阻塞 Phase 1 合并。

---

## 附：关键文件清单

**新增**
- `apps/web/lib/db/migrations/0003_studio_phase1.sql`
- `apps/web/app/(studio)/library/page.tsx`
- `apps/web/app/(studio)/library/_components/LibraryGrid.tsx`
- `apps/web/app/(studio)/studio/_components/Lightbox.tsx`
- `apps/web/app/(studio)/studio/_components/MoodboardDrawer.tsx`
- `apps/web/app/(studio)/studio/_components/SettingsDrawer.tsx`
- `apps/web/app/(studio)/studio/_components/RefSlots.tsx`
- `apps/web/app/(studio)/studio/_components/EmptyStateSamples.tsx`
- `apps/web/app/(studio)/studio/_components/CapabilityGated.tsx`
- `apps/web/app/api/studio/moodboards/route.ts`
- `apps/web/app/api/studio/moodboards/[id]/route.ts`
- `apps/web/app/api/studio/library/route.ts`
- `apps/web/lib/db/moodboard-queries.ts`

**修改**
- `apps/web/lib/db/schema.ts`（image_messages refs/parent_message_id、moodboards 表、members 修正）
- `apps/web/lib/studio/models.ts`（capabilities 字段 + helpers）
- `apps/web/lib/studio/upstream.ts`（refs by role prompt 构造、conversational 路径分支）
- `apps/web/lib/db/studio-queries.ts`（refs 形态变更、parent_message_id 写入、moodboardId hint 处理）
- `apps/web/app/api/studio/chats/[id]/generate/route.ts`（请求体 zod 扩展、capability 校验、conversational 路径、moodboardId 处理）
- `apps/web/app/api/studio/chats/[id]/route.ts`（response 加 refs/parent_message_id）
- `apps/web/app/(studio)/layout.tsx`（导航链接、QuotaBadge 条件渲染）
- `apps/web/app/(studio)/studio/_components/PromptComposer.tsx`（双层 Imagine bar 改造）
- `apps/web/app/(studio)/studio/_components/ChatCanvas.tsx`（hover 按钮、Lightbox 入口、空状态）
- `apps/web/app/(studio)/studio/_components/StudioApp.tsx`（pendingGenerateCount、Moodboard 抽屉状态、Lightbox 状态）
- `apps/web/app/(studio)/studio/_components/types.ts`

---

## 决策日志（brainstorming 阶段）

| 决策点 | 选项 | 选择 |
|---|---|---|
| Phase 1 范围 | 收紧 / 推荐 / 放大 | 放大（含 Moodboard + Library + Imagine bar 双层化 + lineage 字段 + Conversational + Character ref） |
| Moodboard 形态 | 轻量 / 中量 / 重量 | 中量（prompt + ref + 默认参数，user 私有） |
| refs 数据模型 | 两列硬编码 / role 数组 | role 数组（jsonb） |
| Reroll/Remix/Variations 数据模型 | 无 lineage / 有 lineage | 有 lineage（埋字段不展示） |
| Capabilities 字段集 | 只定义 Phase 1 用到的 / 预定义全集 | 预定义全集 |
| 卡片二次操作放置 | 卡片悬浮 / lightbox 内 / 混合 | 混合（卡片高频 + lightbox 完整） |
| Moodboard 入口 | 抽屉 / 左栏分区 / 顶级路由 | 抽屉 |
| Conversational mode 实现 | 严格多轮 / 自动接龙 / 两者并存 | 两者并存（capability 决定底层路径） |
