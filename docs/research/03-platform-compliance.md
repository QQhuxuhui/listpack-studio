# 跨境电商平台图片合规深度调研报告 (2025-2026)

> 调研对象：Amazon / Shopify / eBay / Temu / SHEIN
> 数据截止：2026 年 5 月
> 目的：为「上架包」AI Agent 构建可编程的平台合规规则库

---

## TL;DR

1. **Amazon 是合规绞肉机**——RGB 像素级检测白底、85% 占比、AI 主图禁用、Section 3 直接封号
2. **法规层超过平台层**——欧盟 AI Act 2026.8.2 全面生效，违规罚款最高 €1500 万或全球营收 3%；中国《标识办法》2025.9.1 起强制显式+隐式双标识；美国加州 SB 942 在 2026.1.1 生效，$5000/次
3. **当前市场空白**——Photoroom / Claid / SellerPic 做了"Amazon 白底"，但**没有一家做完整的多平台 + 多法规合规检查矩阵**；Pebblely 等创意型工具完全不做合规。**这是上架包 Agent 的产品空白点。**

---

## 一、Amazon（最高优先级）

Amazon 的图片审查是五大平台里**算法化最彻底、惩罚最严厉**的。卖家被拒后果直接影响 Account Health Rating(AHR)，累计违规可直接触发 Section 3 永久封号。

### 1.1 主图（Main Image）硬性规则

| 维度 | 要求 | 备注 |
|---|---|---|
| **背景色** | 必须 **纯白 RGB(255,255,255)** | 算法扫描像素；RGB(254,254,254) 即可触发抑制 |
| **像素尺寸** | 最长边 ≥ **1000px**（启用 zoom）；推荐 ≥ 2000px；最大 10000px | <1000px 无法 zoom，直接降权 |
| **商品占比** | **≥ 85%** 占满画框四边 | 阴影也算"产品邻接空间"，硬阴影会扣 5–8% 占比 |
| **背景内容** | 不允许：文字、Logo、水印、徽章、边框、色块、内嵌图、模特、道具、配件、包装盒（除非包装是产品本身） | "Free Shipping" 等促销文案 100% 触发抑制 |
| **画面清洁度** | 不允许：halo（光晕）、粗糙切边、反光、hot spots | Amazon AI 检测器现可识别毛糙边缘 |
| **文件大小** | ≤ **10MB** | |
| **文件格式** | JPEG / PNG / TIFF / 非动画 GIF | A+ Content 只接受 RGB，CMYK 上传失败 |
| **色彩空间** | 推荐 **sRGB**（A+ Content 强制 RGB） | CMYK 在主图位接受但风险高 |

**关键来源**：
- [Amazon Main Image 85% Frame Fill Rule 2026 - Rewarx](https://www.rewarx.com/blogs/amazon-main-image-85-percent-frame-fill-guide-2026)
- [Amazon Main Image Requirements 2026 - ListingForge](https://www.listing-forge.com/blog/amazon-main-image-requirements)
- [Amazon Image Background Rules - SearchX](https://searchxpro.com/amazon-image-background-rules-explained/)
- [Amazon Product Image Requirements 2026 - SellerLabs](https://www.sellerlabs.com/blog/amazon-product-image-requirements-2026/)

### 1.2 AI 生成图政策（2026 最新 — **重要变化**）

Amazon 在 **2026 年初**更新了 Seller Guidelines，明确将"实质性 AI 生成内容"纳入披露要求，违规并入 Section 3 框架。

#### 允许 vs 禁止

| 场景 | AI 图允许度 | 备注 |
|---|---|---|
| **主图** | ❌ **禁止** AI 生成主图 | 主图必须展示实际发货的物理商品 |
| **副图 lifestyle 背景** | ✅ 允许 AI 生成背景，但必须真实反映产品场景 | 必须有真实商品参考图作底 |
| **infographic 图形元素** | ✅ 允许 AI 设计元素 | 不能伪造功能/认证 |
| **AI 模特** | ⚠️ 灰色地带，需在产品描述披露 | 不可冒充真人 |
| **背景去除 / 色彩矫正 / 智能裁剪** | ✅ 不算"实质性 AI 生成"，**无须披露** | |
| **before/after 对比图** | ❌ 不允许用 AI 伪造 | 触发"虚假宣传" |
| **AI 评价配图** | ❌ 严令禁止 | FTC 也禁止 |

#### 处罚梯度
- **首次违规**：listing 抑制 → 整改后恢复
- **重复违规 / 故意造假**：account-level penalty → 销售特权限制 → 永久封号
- **2026.2.12 起**：Amazon 启用 **"Risk-Shield" AI** 主动扫描"Relational Data Points"，Section 3 封号潮已显著上升

**来源**：
- [Amazon AI Generated Image Policy 2026 - Rewarx](https://www.rewarx.com/blogs/amazon-ai-generated-image-policy-2026)
- [Amazon Section 3 Suspension Recovery 2026 - DAM Law](https://damlawfirm.com/blog/amazon-section-3-suspension-recovery-2026/)
- [AI content sold on Amazon needs to be disclosed - seo.ai](https://seo.ai/blog/ai-content-sold-on-amazon-needs-to-be-disclosed)

### 1.3 副图（Slot 2–7）规则

| Slot | 用途 | 关键要求 |
|---|---|---|
| 2 | 替代角度 / 背面视图 | 仍然产品为主 |
| 3 | Lifestyle / 使用场景 | 必须真实可信，不可夸大尺度 |
| 4 | Infographic 主功能 | 3–5 个 callout，文字必须在 mobile（300–400px 宽）可读 |
| 5 | Scale shot 尺度对比 | 与真实物体比例 |
| 6 | Comparison / dimensions | 不可贬损竞品 |
| 7 (品牌店) | 品牌故事图 | 需 Brand Registry |

**Mobile 文字可读性硬阈**：在 1600px 图上，文字字号需 ≥ 24pt 等效。70%+ 的卖家此处不达标。

### 1.4 A+ Content（品牌方案）图片规则

要求 Brand Registry 备案。

| 模块 | 尺寸 | 备注 |
|---|---|---|
| 全宽 banner | 970×600px（2x 设计 1940×1200） | |
| 标准图文模块 | 300×300px | |
| 4 图网格 | 220×220px(per image) | |
| 3 图横排 | 300×300px | |
| 对比表模块 | 150×300px(per column) | |
| 文件大小 | ≤ 2MB / 张（推荐 <500KB） | |
| 分辨率 | 最低 300 DPI | |
| 文字覆盖 | ≤ 图面积 30%，每模块 ≤ 300 字符 | |
| 色彩空间 | **RGB 强制**（CMYK 上传失败） | |

审核周期：**7–10 工作日**。

### 1.5 真实被拒原因 Top 10（Seller Forums 实战数据）

| # | 拒绝原因 | 触发机制 |
|---|---|---|
| 1 | **背景非纯白**（RGB ≠ 255,255,255） | 算法扫描 — 最大头 |
| 2 | **商品占比 < 85%** | 视觉算法 |
| 3 | **文字 / Logo / 水印** | OCR 检测 |
| 4 | **多个产品出现在主图** | 物体检测 |
| 5 | **道具 / 模特手 / 鸟之类装饰** | 物体检测 |
| 6 | **分辨率 < 1000px** | 元数据检查 |
| 7 | **包装盒 / 袋子** 出现（若非产品本身） | 视觉识别 |
| 8 | **粗糙抠图 halo / 锯齿边** | 边缘分析 |
| 9 | **阴影过重 / 形成黑框** | 直方图分析 |
| 10 | **未授权使用他人图片**（版权侵权） | 算法 + 投诉 |

**来源**：
- [Image rejected. Any ideas? - Seller Central Forum](https://sellercentral.amazon.com/seller-forums/discussions/t/5f8fbc86d035ed9b0d51b8f4c719a70f)
- [Search Suppressed - Background isn't white enough](https://sellercentral-europe.amazon.com/seller-forums/discussions/t/0fac3eae016289233901fb40ed78ca62)
- [Fix Amazon Main Image Suppression - ImageWork](https://imageworkindia.com/fix-amazon-main-image-suppression-255-255-255/)

### 1.6 专项品类禁忌

#### 1.6.1 膳食补充剂（Supplements）
- **2025.12** Amazon 扩大 cGMP 要求至**全品类补充剂**，7 家认证 TIC 机构之一审计，90 天补交，逾期下架
- 图片不可有医疗效果暗示（"减肥前后"、"治愈" 等）
- 不可标注未经认证的徽章（USDA Organic、Non-GMO 等需文件证明）

#### 1.6.2 医疗器械
- 血压计 / 心电仪 / 血糖仪 / 雾化器 需 FDA **510(k) clearance**
- 图片不可展示 "诊断 / 治疗 / 治愈" 暗示

#### 1.6.3 化妆品
- 禁用宣传词在图上出现："wrinkle reduction"、"acne treatment"、"skin whitening"
- 包装图必须显示完整成分表（FIC compliance scan）

#### 1.6.4 儿童玩具
- **2025.9.3** 起所有儿童玩具需 TIC 年度测试
- 图片需含：CPSIA 警示语、年龄分级、small parts warning（<3 岁）、tracking label
- 含小零件：Choking hazard 警示在主图或副图必须可见

#### 1.6.5 食品 / 婴儿食品
- FIC（Food Information to Consumers）compliance image scan — 算法核对配料表
- 不可出现"organic / natural" 等保护词，除非有认证

#### 1.6.6 宠物用品
- 2025 起 ingredient transparency 规则，图片需显示完整成分
- 不可宣称未经证实的健康功效

### 1.7 被拒后果与申诉流程

| 情形 | 后果 | 申诉时长 |
|---|---|---|
| 单张图被拒 | listing 被 search-suppressed，从搜索结果消失 | 整改后通常 3–7 天恢复 |
| ASIN 被抑制 | 整个 listing 下架，但账户活 | 7–14 天（简单情况） |
| AHR 扣分 | 累计扣到 <200 进入"At Risk"黄区 | — |
| AHR <100 | 红区，即将或已经被停账 | — |
| Section 3 触发 | 账户冻结，资金扣押，需完整 POA | 平均 30+ 天，成功率受 POA 质量决定 |

**重复违规规则**（关键）：
- 大部分政策的 180 天重复阈值 = **5 次**
- 限制品类政策 = **2 次**
- 单次"critical 严重违规"即可立即停账

---

## 二、Shopify（平台宽松，法规与性能是真约束）

Shopify 平台本身**几乎没有图片审查**——商家自主上传，平台不审。但有三层隐性约束：

### 2.1 Shopify Magic / Sidekick AI 图工具现状（2026）

| 工具 | 功能 | 合规备注 |
|---|---|---|
| **Shopify Magic** | 文生图、背景去除、AI 场景背景、lifestyle 生成、画布扩展 | **每张输出嵌入隐形水印作为 metadata**，符合欧盟 AI Act 隐式标识雏形 |
| **Sidekick** | Agentic AI 助手，可批量编辑产品图 | 输出同样含隐形水印 |
| **默认分辨率** | 1MP（按 aspect ratio 自适应） | 主图 hero 用偏低 |

⚠️ Shopify 官方明确警告：**"AI 生成图可能不达到 hero product photo 的质量标准"** — 商家责任。

### 2.2 主题图片规范（Dawn 等）

| 主题/位置 | 推荐尺寸 |
|---|---|
| Dawn 主题 banner（桌面） | 1600×1050px |
| 产品主图（zoom 触发） | ≥ 800×800px，sweet spot 2048×2048px |
| 文件大小硬上限 | **每张 < 200KB**（产品图），lifestyle/hero < 400KB |
| 格式优先级 | **AVIF > WebP > JPEG**（Shopify CDN 自动转换） |
| 质量参数 | WebP/JPEG q75–85 |
| Variant 图 | 每个 variant 必须独立图，否则 Google Shopping 显示错色 |

### 2.3 Core Web Vitals 硬阈

| 指标 | 阈值 | 与图片关系 |
|---|---|---|
| **LCP** | < 2.5s | 首屏 hero 图大小决定性 |
| **CLS** | < 0.1 | 图片必须有显式 width/height 防跳动 |
| **INP** | < 200ms | 图片懒加载策略 |

**冲击数据**：1 秒载入提升 → 转化率 +7%；3 秒以上，53% 移动端用户流失。

### 2.4 商家常踩的坑

| 坑 | 说明 |
|---|---|
| **直接上传相机原图** | 2–5MB/张，单页 12–30MB，移动端 8s+ 载入 |
| **alt 文本空白或 "product image"** | Google Image / Rufus / ChatGPT 不收录 |
| **文件名 IMG_4532.jpg** | 错失 SEO 长尾 |
| **Variant 不配独立图** | Shopping Feed 报错或显示错色 |
| **未启用 lazy loading** | 老主题需手动改 |
| **PNG 当 JPEG 用** | 文件大 3–5x |

---

## 三、eBay

### 3.1 主图与全局规则

| 维度 | 要求 |
|---|---|
| 最小尺寸 | **最长边 ≥ 500px** |
| 推荐尺寸 | 1600px+，最大 9000×9000px |
| 数量 | 最多 24 张/listing（免费），首张推荐 |
| 背景 | 推荐白底但**不强制纯白** |
| 禁止 | 边框、水印、Logo、文字覆盖、URL、促销图形、版权标 |
| 反光/hot spots | 禁止 |
| 现实性 | 必须真实展示该 specific 商品（颜色/尺寸/多件包装数量） |

### 3.2 AI 图政策

- 允许 AI 生成图，**但必须用至少一张真实商品参考图作底**
- **任何 AI 修改改变了产品真实外观即违规** — 等同"虚假描述"
- 2025 起 eBay 自己在测试 **AI Fashion Models**，**未经卖家同意**就替换 listing 图，引发卖家社区强烈反弹

### 3.3 二手品类特殊要求
- 必须显示真实磨损 / 瑕疵
- 不可用 stock photo 假装是"in hand"实物

**来源**：
- [eBay Picture Policy](https://www.ebay.com/help/policies/listing-policies/picture-policy?id=4370)
- [eBay AI Fashion Models without consent - ValueAddedResource](https://www.valueaddedresource.net/ebay-tests-ai-fashion-models-alters-images/)

---

## 四、Temu

Temu 规则**变动频繁**，2025 年随 semi-managed 推广多次更新。

### 4.1 主图与全局规则

| 维度 | 要求 |
|---|---|
| 最小图数 | **3 张**（发布门槛） |
| 最多图数 | 8 张图 + 视频 + lifestyle |
| 最小尺寸 | **最长边 ≥ 1600px** |
| 主图背景 | **纯白 RGB(255,255,255) 或中性色**，算法校验，偏离即拒 |
| 商品位置 | 居中，主导画面 |
| 文件格式 | JPG (q80–90) / PNG |
| 文件大小 | 3–5MB 上限（各类目略异） |
| 宽高比 | 1:1（grid 适配）、4:5（移动端）、3:4 推荐 |
| 副图 | 多角度、材质特写、lifestyle 可自由发挥 |

### 4.2 AI 图政策
- **允许 AI 生成图，但不推荐纯 AI 生成产品本身**（准确度差，易引发退货）
- 推荐做法：每个 SKU 拍 1 张真实参考，再用 AI 生成不同背景
- 若 Temu 质疑图片所有权，卖家需提供 source files
- **2025 年 AI 假评论暴增 1361%**，欧盟在 DSA 下加大对 Temu/SHEIN 的图文打击

### 4.3 2025 重大政策变化
- 70% 流量转向 Semi-Managed SKU，审批 3–5 天
- **2025.3 起**：多语言说明书、全模式测试强制
- 法国 €40M 罚款（2025.7）：误导折扣 + 环境信息
- 法国通过 ultra-fast-fashion 法案：广告禁令 + 环保信息强制披露

---

## 五、SHEIN

SHEIN 服饰/穿搭主导，图片规范偏向 fashion catalog 风格。

### 5.1 图片规格

| 维度 | 要求 |
|---|---|
| 宽高比 | **1:1 / 3:4 / 4:5 / 13:16** |
| 标准分辨率 | 900×2200px（竖图）、900×900px 或 2200×2200px（方图） |
| Color block 缩略 | 80×80px |
| 文件大小 | ≤ 3MB |
| 格式 | JPG / JPEG / PNG |

### 5.2 模特图与 AI 图政策

- 偏好**真人模特拍摄**多角度，清晰展示面料/版型
- **AI 模特灰色地带**：SHEIN 自身据传大量使用 AI 生成图（catalog velocity），**但 H&M 2025 因 AI 模特引发消费者反弹后回归真人**
- SHEIN 内部使用 **AI 质量检查**自动 flag 不达标生成图
- 风格调性：fast fashion catalog，白底/灰底/简洁场景为主

### 5.3 法规风险
- 2025 集体诉讼：SHEIN 被指控用 AI 抓取受版权设计
- SHEIN vs Temu（2026.5 伦敦高院）："工业级"版权侵权指控
- 法国 ultra-fast-fashion 法案：同样适用

---

## 六、法规层（法律强约束，覆盖所有平台）

### 6.1 欧盟 AI Act（Article 50）— **2026.8.2 全面生效**

| 项 | 内容 |
|---|---|
| **核心要求** | AI 生成的合成音频/图像/视频/文字必须**机器可读标识**（metadata）+ deepfake 必须**对外披露** |
| **多层标识技术栈** | C2PA 标准 provenance + 不可见水印（抗压缩/裁剪）+ fingerprinting，**单一技术不够** |
| **谁负责** | 提供商（Midjourney/DALL-E/Firefly）嵌入 watermark；部署方（品牌/营销团队）保留 watermark + 对受众披露 |
| **罚款** | 最高 **€1500 万 或 全球年营收 3%**（取高者） |
| **时间表** | 2024.8.1 生效 → Code of Practice 草案 2025.12.17 发布 → 终稿 2026.5–6 → **2026.8.2 强制执行** |

**对跨境卖家含义**：任何卖到欧盟的 listing，若用 AI 生成图未嵌入 watermark 或未对外披露，即面临高额罚款风险。

### 6.2 美国 FTC 指南（联邦层）

| 项 | 内容 |
|---|---|
| **AI 图披露原则** | "photorealistic" AI 图必须披露，不论多逼真 |
| **AI 模特/合成网红** | 不可冒充真人，必须标识 |
| **AI 评价配图** | 2024.8.14 终规：**禁止虚假和 AI 生成的消费者评论 / 名人证言** |
| **披露标准** | 清晰 / 显著 / 邻近内容 / 普通消费者可理解 |
| **2025.2 行动** | 给 7 家时尚美妆品牌发警告函，理由是 AI 生成/增强内容未披露 |

### 6.3 美国州法

| 州/法案 | 生效日 | 要求 | 罚款 |
|---|---|---|---|
| **加州 SB 942**（AI Transparency Act） | **2026.1.1** | "Covered providers"（月活 100 万+）必须提供 AI 检测工具 + 用户可选**显式 manifest disclosure** + 自动**隐式 latent disclosure** | **$5000 / 次** |
| **加州 AB 2655**（Defending Democracy from Deepfake Deception） | **2025.1.1** | 大型平台 block/label "materially deceptive" 选举类深度伪造 | — |

**对电商工具的影响**：任何月活 >100 万的 AI 图生成工具（基本上 Photoroom/Pebblely/Claid 都中招）必须内置 detection tool + 显式/隐式标识能力。

### 6.4 中国《人工智能生成合成内容标识办法》— **2025.9.1 生效**

四部门（网信办/工信部/公安部/广电总局）联合发布。

| 项 | 内容 |
|---|---|
| **双重标识强制** | **显式标识**（可见文字/图形，用户可明显感知）+ **隐式标识**（metadata） |
| **图片要求** | 在适当位置添加显著提示标识 |
| **商业用途** | 商家必须保证宣传内容与实物相符，履行显著提示义务 |
| **违规后果** | 与实物存在面料/版型/图案重大差异且足以误导，认定侵犯消费者知情权 |
| **配套国标** | GB《网络安全技术 人工智能生成合成内容标识方法》同步实施 |
| **2025.11.25 执法** | 网信部门已集中查处一批违法违规移动应用 |

**对跨境卖家含义**：中国卖家在 1688 / 阿里 / 拼多多源头出图阶段就已被规制；若 AI 图未标识被回流国内，卖家承担双重合规风险。

---

## 七、可编程合规检查清单（产品规则库直接输入）

### 7.1 可自动化检查的规则（高优先级开发）

| 规则 | 技术实现 | 难度 |
|---|---|---|
| **像素尺寸**（最长边 ≥ X） | PIL/Sharp 读 metadata | 极易 |
| **文件大小**（≤ X MB） | fs.statSync | 极易 |
| **文件格式**（JPEG/PNG/TIFF/WebP） | mime detect | 极易 |
| **色彩空间**（sRGB/RGB/CMYK） | ICC profile 读取 | 易 |
| **背景纯白度**（RGB 255 容忍度 ≤ ±2） | 边缘像素直方图分析 | 中 |
| **商品占比**（≥ 85%） | 物体分割模型（SAM 2.1 / RMBG-2.0） | 中 |
| **文字检测**（主图不允许） | OCR（Tesseract / PaddleOCR / Google Vision） | 中 |
| **水印/Logo 检测** | watermark detector 模型（restb.ai 类） | 中 |
| **边框/色块检测** | 边缘检测 + 直线 hough 变换 | 中 |
| **多商品检测** | YOLO 物体计数 | 中 |
| **道具/人物检测** | YOLO + person class | 易 |
| **包装盒检测** | 物体分类 | 中 |
| **halo/锯齿边检测** | alpha 通道边缘锐度 | 中 |
| **阴影过重检测** | 暗部直方图 | 中 |
| **品类专属违禁词**（化妆品图上"wrinkle reduction" 等） | OCR + 关键词库 | 易 |
| **CPSIA 警示语必备**（儿童玩具） | OCR 找特定文本存在 | 易 |
| **mobile 文字可读性**（24pt 等效） | OCR + 字号检测 | 中 |
| **alt 文本是否填写** | listing JSON 检查 | 极易 |
| **AI 水印 metadata 检查**（C2PA / 隐形 watermark） | C2PA SDK + 隐式水印检测 API | 中 |

### 7.2 难以自动化的规则（需人工 + LLM 双审）

| 规则 | 为何难 |
|---|---|
| **图与发货实物一致性** | 没有实物 ground truth 无法比对 |
| **lifestyle 是否夸大尺度** | 需场景理解 + 商品规格交叉验证 |
| **比较图是否贬损竞品** | 语义理解 + 法律边界 |
| **"医疗暗示"** 是否构成虚假宣传 | 需 FDA/EMA 知识图谱 |
| **"AI 生成"是否构成"实质性"** | Amazon 政策本身边界模糊 |
| **版权侵权**（图是否抄了别人） | 需大规模反向图搜 + 版权数据库 |
| **品牌调性是否一致** | 需品牌指南 + 风格嵌入 |

---

## 八、竞品工具合规能力扫描（关键产品空白）

| 工具 | Amazon 白底 | 85% 占比 | 文字/水印检测 | 多平台模板 | AI 披露/水印合规 | 品类规则 | 法规层（EU AI Act/中国） |
|---|---|---|---|---|---|---|---|
| **Photoroom** | ✅ 自动 enforce | ⚠️ 模板辅助 | ⚠️ AI Retouch 手动 | ✅ Amazon/eBay/Shopify/Etsy/Poshmark | ❌ | ❌ | ❌ |
| **Claid** | ✅ Smart Frame | ✅ 自动 | ❌ | ⚠️ 部分 | ❌ | ❌ | ❌ |
| **SellerPic** | ✅ 2000×2000 RGB(255,255,255) | ⚠️ 部分 | ❌ | ✅ Amazon/Shopify/Etsy/eBay | ❌ | ❌ | ❌ |
| **Pebblely** | ❌ 完全不 enforce | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Pixelcut** | ⚠️ 模板 | ❌ | ❌ | ⚠️ 偏社交 | ❌ | ❌ | ❌ |
| **Shopify Magic** | ⚠️ 提示但不 enforce | ❌ | ❌ | ❌（只 Shopify） | ✅ 隐形 watermark | ❌ | ⚠️ 仅水印 |

### 8.1 关键空白点（= 产品定位机会）

1. **没有一家做完整的"多平台合规矩阵"** — Photoroom 最接近，但只覆盖白底 + 模板尺寸，**不检测文字/水印/品类禁忌**
2. **没有任何一家做品类专属合规**（补充剂、儿童、医疗、化妆品的特殊禁忌）
3. **没有任何一家做法规层合规**（EU AI Act 隐形水印 + 显式披露文案、中国标识办法、加州 SB 942 latent disclosure）
4. **没有一家做"被拒前预警"**（给出"如果上传 Amazon 会被拒，原因 X、Y、Z"的可解释报告）
5. **没有一家做"申诉文案自动生成"**（被拒后的 Plan of Action 模板）

**结论**：做"上架包"AI Agent，**合规检查层是真实的护城河**，远比图片美化层更难复制。

---

## 九、产品启示总结

### 9.1 必须做（MVP 硬约束）
1. **Amazon 主图全套自动检查**：白底 RGB / 占比 85% / 尺寸 / 文字 / 水印 / 道具
2. **多平台模板预设**：Amazon（主+副）、Shopify、eBay、Temu、SHEIN 五平台，每平台主图+副图+lifestyle 全套尺寸输出
3. **AI 图自动标注**：输出图嵌入 C2PA metadata + 可选显式角标 + 文案生成"AI 生成图"披露文本（覆盖 EU AI Act / 中国《标识办法》/ 加州 SB 942）
4. **被拒原因可解释报告**：上传前给出 pass/fail + 红线条款引用

### 9.2 差异化护城河（中期）
1. **品类规则引擎**：补充剂 / 儿童 / 医疗 / 化妆品 / 食品 / 宠物专属违禁词与必备元素库
2. **平台政策实时跟踪**：Amazon Seller Forums + 官方政策 RSS 订阅，周更规则库
3. **申诉助手**：被拒后自动生成 Plan of Action 草稿

### 9.3 长期壁垒
1. **多语言/多市场版本**：同一图对应美/欧/日/东南亚不同披露文案与监管要求
2. **品牌调性一致性**：同一品牌跨平台风格统一，品牌资产复用

---

## 十、核心数据来源汇总

### Amazon
- [Amazon AI Generated Image Policy 2026](https://www.rewarx.com/blogs/amazon-ai-generated-image-policy-2026)
- [Amazon Main Image Requirements 2026](https://www.listing-forge.com/blog/amazon-main-image-requirements)
- [Amazon 85% Frame Fill Rule 2026](https://www.rewarx.com/blogs/amazon-main-image-85-percent-frame-fill-guide-2026)
- [Amazon A+ Content Image Guide](https://focalflow.app/en/blog/amazon-a-plus-content-image-guide/)
- [Amazon Account Health Rating Policy](https://sellercentral.amazon.com/help/hub/reference/external/G200205250?locale=en-US)
- [Amazon Restricted Products 2025](https://moizit.com/amazon-restricted-products-list/)
- [Amazon Supplement Compliance cGMP 2026](https://inventoryready.com/guides/amazon-supplement-compliance)
- [Amazon Toy Compliance 2025](https://www.jjrlab.com/news/amazon-toy-and-kids-product-compliance-guide-2025.html)
- [Amazon Section 3 Suspension 2026](https://damlawfirm.com/blog/amazon-section-3-suspension-recovery-2026/)

### Shopify
- [Shopify Magic Help Center](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/shopify-magic/media-generation)
- [Shopify Core Web Vitals 2025](https://brandnexusstudios.co.za/blog/shopify-core-web-vitals/)

### eBay
- [eBay Picture Policy](https://www.ebay.com/help/policies/listing-policies/picture-policy?id=4370)
- [eBay Images Videos and Text Policy](https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240)

### Temu
- [Temu Product Data Requirements - Inriver](https://www.inriver.com/resources/product-data-requirements-temu/)
- [TEMU Product Compliance Guide - JJR](https://www.jjrlab.com/news/temu-product-compliance-guide.html)

### SHEIN
- [SHEIN Open Platform FAQ](https://open.sheincorp.com/documents/faq-detail/4)
- [SHEIN Marketplace Guide - Linnworks](https://www.linnworks.com/blog/shein-marketplace-guide/)

### 法规
- [EU AI Act Article 50](https://artificialintelligenceact.eu/article/50/)
- [EU Code of Practice AI-generated content](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)
- [FTC AI Disclosure Rules](https://www.aifashionlaw.com/articles/ftc)
- [California SB 942 AI Transparency Act](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB942)
- [中国《标识办法》通知](https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm)
- [普华永道《标识办法》合规解码](https://www.pwccn.com/zh/tmt/method-identifying-synthetic-content-generated-ai-sep2025.pdf)
