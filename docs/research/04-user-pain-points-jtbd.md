# 跨境电商卖家「商品图片生产/上架」用户研究

> 调研时间：2026 年 5 月
> 方法：英文 Web 搜索（Reddit、Trustpilot、G2、Shopify App Store、Amazon Seller Central Forum、Quora、行业 Blog、YC/Crunchbase 公开信息）
> 数据局限：部分原话靠搜索引擎二手摘要 + 链接回溯，所有结论都附信源链接

---

## A. 真实声音挖掘（22 条原话级抱怨，分类整理）

### A1. 主图被自动驳回 / 平台规则严苛（最高频）

**1. 白底主图反复被驳回**
> "Product photos on a white background keep getting rejected for not being on a white background..."
> （白底产品图一直被以"不是白底"为由驳回……）

来源：[Amazon Seller Central Forum — Product photos on a white background keep getting rejected](https://sellercentral.amazon.com/seller-forums/discussions/t/59480bf0-59ef-4f02-94f4-51d333e8dfb6)
反映：1 类（个人卖家）+ 2 类（DTC）。痛点 = 把 RGB 数到 #FFFFFF 才算白，相机直出根本做不到，必须 Photoshop。

**2. 主图政策"对中国白牌不执法、只针对美国卖家"**
> "Main image policy seems to be enforced for them, but not enforced at all for the Chinese pseudo-brands that are taking over Amazon."

来源：[Amazon Seller Central — Main Image getting rejected](https://sellercentral.amazon.com/seller-forums/discussions/t/862e0ee1-f611-4aa7-ac90-6757aea901ea)
反映：2 类（美国本土 DTC）情绪化抱怨——"我们守规矩、对手不守规矩"。

**3. AI 自动审核连"轻微 off-white"都判违规**
> "Amazon's AI now automatically detects and suppresses non-compliant images with greater accuracy, with even slight deviations from pure white backgrounds (#FFFFFF) able to result in immediate rejection."

来源：[Nightjar — Does Amazon policy allow for AI-generated product images](https://nightjar.so/help-desk/does-amazon-policy-allow-for-ai-generated-product-images-in-listings)
反映：所有三类客户。痛点 = 2026 年的 AI 自动审核 = 一旦不合规直接下架。

---

### A2. AI 图"看起来不像真东西" / 引发退货

**4. 16% 的退货因为"图和实物不符"，AI 图是主因**
> "16% of e-commerce returns now stem from images that fail to match delivered goods, a figure that has climbed sharply as AI-generated product photography proliferates across major platforms."

来源：[CTOL Digital — Amazon Shoppers Return More Products After AI Generated Photos](https://www.ctol.digital/news/amazon-shoppers-return-products-ai-photos-dont-match-reality/)

**5. AI 编造产品上不存在的按钮、端口**
> "Electronics categories face additional challenges as AI tools frequently hallucinate non-existent ports, buttons, and design details, and these systems may 'improve' product photos by adding features that seem logical but don't exist on the actual device."

来源：[CTOL Digital](https://www.ctol.digital/news/amazon-shoppers-return-products-ai-photos-dont-match-reality/) + [Rewarx — AI Product Photos vs Real Products](https://www.rewarx.com/blogs/ai-product-photos-not-matching-real-products)

**6. AI 把产品标签上的文字写错 / 写成乱码**
> "Common text issues include misspelled brand names, scrambled ingredient lists, made-up words, or text that looks almost right but isn't."

来源：[Pebblely Blog — Why Your AI Product Photos Keep Getting the Text Wrong](https://pebblely.com/blog/ai-product-photos-text-extraction/)
反映：保健品（成分表）、护肤品（功效字）、食品（成分/警告语）卖家。

**7. 卖家用 AI 美化图、用户用 AI 伪造受损图来退款**
> "E-commerce 'Magic Showdown': Sellers Use AI-Generated Fake Product Images, Buyers Use AI Fruit Spoilage Pics for Refund Deception"

来源：[36Kr](https://eu.36kr.com/en/p/3409700220685704) + [Ravelin — AI-powered refund abuse](https://www.ravelin.com/blog/ai-powered-refund-abuse-dispute-fraud)

---

### A3. 现有 AI 工具的"做得到 ≠ 能用"

**8. PhotoRoom 偷偷下线已付费功能（Virtual Model、Product Staging）**
> "Some users paid for PhotoRoom specifically to use features like the Virtual Model and Product Staging, but these tools were removed."
> "A SCAM where they tempt you then block you once you rely on it."

来源：[Trustpilot — Photoroom Reviews](https://www.trustpilot.com/review/www.photoroom.com)（1.3 星，164 条评论，80% 一星）
**这是 SaaS 信任问题，不是技术问题。**

**9. PhotoRoom 抠图边缘"头发、薄纱"细节崩**
> "Users report inaccuracy in auto-cropping, especially with delicate details like loose hair or sheer fabrics, leading to uneven edges that need fixing."

来源：[Trustpilot — Photoroom](https://www.trustpilot.com/review/www.photoroom.com)

**10. Pebblely 在 Shopify 应用市场 1.4 星**
> "The app is 'buggy' with 'unknown error' messages... background removal causes products to become distorted... background images look poorly generated, the UX is bad, and the AI creates 'terrible images,' recommending testing in 2027."

来源：[Pebblely AI — Shopify App Store](https://apps.shopify.com/pebblely-ai)（综合 1.4 星，50% 一星）

**11. SellerPic 男装模特"肩线扭曲、纽扣模糊"，客服只发模板**
> "AI-generated model images often have issues like distorted shoulder lines and blurred details such as buttons, particularly for men's clothing... customer service... solutions provided for men's clothing detail problems tend to be templated and lack substantive optimization suggestions."

来源：[Trustpilot — SellerPic Reviews](https://www.trustpilot.com/review/sellerpic.ai)

**12. Booth.ai（YC W23）做电商垂直 AI 摄影，2024-2025 间倒闭**
> "Booth.ai failed due to a toxic combo of poor customer feedback, an oversaturated AI tools market, and limited funding... The credit-heavy pricing model created friction before users could experience the product's value."

来源：[Startups.rip — Booth AI](https://startups.rip/company/booth-ai) + [Dang.ai — What Happened to Booth.ai](https://dang.ai/tool/ai-product-photography-tool-booth)
反映：警示 —— **这个赛道"做产品"和"做生意"是两回事**。

**13. Pixelcut 试用期就自动扣费**
> "Pixelcut uses promotional popups with countdown timers during signup that create time pressure, and users report being charged immediately rather than starting a trial period as expected."

来源：[Trustpilot — Pixelcut](https://www.trustpilot.com/review/pixelcut.ai)

**14. Soona 实拍订阅：颜色拍偏、客服拒退**
> "Photos were brightened but given a reddish or orange tone that was not the color of the items they sent."
> "A customer who paid for a service they didn't use reported being flat-out refused a refund."

来源：[Trustpilot — Soona](https://www.trustpilot.com/review/soona.co)

---

### A4. 钱、时间、心智的真实数字

**15. 一套传统拍摄：$525-$1,350 / 单品（7 张图）**
> "Traditional product photography runs $525-1,350 per product for a 7-image listing... a complete shopify product photography set used to mean spending $500-1,000 minimum for a single product, and a full store launch with 6-8 photos per product can easily top $3,000 before you've sold a single unit."

来源：[Nightjar — The Real Cost of Product Photography in 2026](https://nightjar.so/blog/the-real-cost-of-product-photography-a-breakdown) + [Shopify — Product Photography Pricing](https://www.shopify.com/blog/product-photography-pricing)

**16. 10 SKU 起步 → $5K-$10K 拍摄费**
> "For a store launching with 10 SKUs, that's a $5,000-10,000 line item before you've tested whether the item sells."

来源：同上 Nightjar。

**17. Fiverr 设计师做亚马逊一套图：$5 - $110，质量飘忽**
来源：[Fiverr 多个 listing](https://www.fiverr.com/sandraherrero/do-premium-amazon-infographics-product-photo-lifestyle)

**18. 月订阅设计师服务：Penji $499、ManyPixels、Flocksy $897**
来源：[Shopify — Graphic Design Prices 2026](https://www.shopify.com/blog/graphic-design-prices)

**19. 一个 DTC 季节性拍摄：$5K-$10K / session，2-10 天**
> "A single product shoot session can cost $5,000-$10,000 and generate 200-300 final images, which equals $20-$50 per final image."

来源：[Squareshot — Essential Guide to Product Photography Workflow](https://www.squareshot.com/post/essential-guide-to-product-photography-workflow)

**20. UGC 短视频 / 创作者拍片：$150-$2,000 / 条，且每 7-10 天要换素材**
> "Outsourced video production runs $300 to $2,000 per piece... You need to refresh creative every 7 to 10 days once spend exceeds $1,000 per month."

来源：[Vidico — Social Media Video Cost 2026](https://vidico.com/news/social-media-video-cost/)

**21. Shopify 商家被 AI 工具从"$15K-$50K/年"砍到"$1K-$5K/年"**
> "Shopify stores using AI for product photography saw their photography costs go from somewhere between $15k-$50k per year down to just $1k-$5k."

来源：[Shopify Blog](https://www.shopify.com/blog/product-photography-pricing)

**22. eBay 手机端上传画质暴跌（500px 强压）**
> "The app appears to be resizing images to save eBay storage/bandwidth, as they are being resized to 500 pixels on the longest axis."

来源：[eBay Community](https://community.ebay.com/t5/Android-App/Photos-are-uploading-in-very-low-quality/td-p/33856103)

---

## B. JTBD 流程图（分客户类型）

### B1. 个人卖家 / 小店主（<100 SKU，1-3 人，预算 $20-100/月）

| 步骤 | 做什么 | 时间 | 钱 | 谁来做 | 痛点 |
|------|--------|------|----|--------|------|
| 1 拿到产品 | 收到供应商/拍立得样品 | - | - | 自己 | - |
| 2 拍主图 | 手机+灯箱拍白底 / 用 supplier 给的图 | 1-2h/SKU | $0 | 自己 | **超痛**：调白平衡到 #FFFFFF |
| 3 抠图修边 | PhotoRoom/Pixelcut 抠图 | 10-30 min/SKU | $10-15/月 | 自己 | 头发/边缘崩，要手修 |
| 4 做场景图 | Pebblely/SellerPic 生 lifestyle | 30 min/SKU 但要试很多次 | $29/月起 | 自己 | **超痛**：生 10 张选 1 张，标签经常写错 |
| 5 做信息图/A+ | Canva 套模板 | 1-2h/SKU | $13/月 | 自己 / Fiverr 外包 $5-$30 | 没设计感、套模板撞图 |
| 6 多平台尺寸 | 1:1 / 4:5 / banner | 30 min/SKU | - | 自己 | 一图多剪，重复劳动 |
| 7 上传被打回 | 修白底重传 | 不可预测 | - | 自己 | **超痛**：循环 |

**当前凑合方案**：Canva + Photoroom + Fiverr $5 单子。**实际月支出 $20-$50**。
**最痛瓶颈**：3（抠图）、4（场景图）、7（被打回）。
**最不痛的地方**：「批量」其实不痛（SKU 不多）；「prompt 难写」其实他们用模板就行。

---

### B2. 中小品牌 / DTC 卖家（100-2000 SKU，3-20 人，预算 $100-1K/月）

| 步骤 | 做什么 | 时间 | 钱 | 谁来做 | 痛点 |
|------|--------|------|----|--------|------|
| 1 产品入库 | 摄影棚收样品 | 1-2 天 | - | 内部摄影师 / 外包 Soona | - |
| 2 拍摄日 | 主图、细节、场景、模特 | 2-10 天 / 季 | $5K-$10K / session | 外包摄影团队 | **超痛**：周期长、改不动 |
| 3 后期 | Photoshop 精修 | $200-$500/image | 内部 / Fiverr | 精修师 | 改一轮等 24-48h |
| 4 A+ Content / 详情长图 | Photoshop 30-45 min/image | $20-100/image | 内部美工 / Penji ($499/月) | 慢 |
| 5 多平台素材 | Amazon (1:1) / Shopify / TikTok (4:5) / Meta Ads | 半天/SKU | - | 内部 | **超痛**：每平台一套 |
| 6 投放素材迭代 | 每 7-10 天换创意 | 持续 | UGC $300-$2K/条 | 创作者签约 | **超痛**：消耗速度 > 产出速度 |
| 7 季度更新 | 新季节、新色款 | 重做循环 | 重头投入 | 全员 | 季节性"爆裂式"工作 |

**当前凑合方案**：Soona/Squareshot 拍 + Photoshop + Penji/ManyPixels 月订阅美工 + 几个 AI 工具叠加。
**实际月支出 $1K-$5K**，旺季单次拍摄 $5K-$10K。
**最痛瓶颈**：2（拍摄周期）、5（多平台尺寸）、6（投放素材消耗）。
**反直觉**：他们不缺设计师，缺的是**速度** —— 一个 SKU 从产品到 Meta Ads creative 走完要 3-4 周。

---

### B3. 代运营公司 / MCN / 电商服务商（多品牌切换，按项目计费）

⚠️ **公开信息严重不足**：英文 Trustpilot/G2 上"agency 操作 ecommerce 视觉的工作流"几乎查不到颗粒度评论。

| 步骤 | 做什么 | 时间 | 钱 | 痛点 |
|------|--------|------|----|------|
| 1 客户对接 | 收 brief、品牌资产 | 1-3 天 | - | 客户素材烂、参考不清 |
| 2 工作流编排 | 多品牌切换、PM 安排 | 持续 | 自有工具：Workamajig/Filestage/Ziflow | **超痛**：每个品牌要一套调性 |
| 3 拍摄/制图 | 自有摄影 + 外包后期 | 2-3 天/批 | $20-50/image 成本 | 跨品牌不能复用资产 |
| 4 客户提案/proofing | 多轮反馈 | 1-2 周 | - | **超痛**：客户改改改 |
| 5 多平台分发 | Amazon Backend / Shopify / TikTok Shop | - | DAM 工具：Soona | 同步成本高 |
| 6 月度复盘 | 数据 + 创意 | 月 | - | - |

**最痛瓶颈**：2（多品牌切换调性）、4（客户改稿）。
**反直觉**：他们其实不缺 AI 出图能力，缺**「按品牌封装好风格 + 按客户做权限隔离 + 输出审计」的运营系统**。

> **建议**：如果"上架包"想攻代运营这一类，需要补一次对 5-10 家中国/东南亚跨境代运营做深访谈，公开数据真的不够。

---

## C. Top 10 痛点（按抱怨频次 × 严重程度排序）

| # | 痛点 | 影响客户 | 当前凑合方案 | 付费意愿信号 |
|---|------|----------|--------------|--------------|
| 1 | **主图被平台自动驳回（白底/85%占比/无边框）** | 全部 | Photoshop 手动调 + 反复试 | 强（一旦下架 = 0 收入） |
| 2 | **AI 图产品形状/标签文字错误 → 退货 16%** | 全部，电子/保健品/食品最严重 | 拍真照 / 手 PS 修文字 | 强（每次退货 = 商品成本 + 仓储 + 信誉） |
| 3 | **多平台素材尺寸/比例适配（1:1/4:5/banner）** | 1+2 类 | Canva 手动切 | 中（节省 30%-50% 时间） |
| 4 | **拍摄费用太高（$525-$1,350/SKU）** | 1+2 类 | DIY 灯箱 / Fiverr / supplier 图 | 强（年支出 $1K-$50K 可砍） |
| 5 | **场景图/lifestyle 拍不到、AI 出图风格不一致** | 1+2 类 | Pebblely/SellerPic 生 10 选 1 | 中-强（场景图直接影响 CTR） |
| 6 | **A+ Content / 详情长图需要 Photoshop 美工** | 1+2 类 | Canva 模板 / 月订阅美工 $499/月 | 强（这是省 $500/月的方案） |
| 7 | **投放素材消耗快（7-10 天一轮）** | 2 类（主要） | UGC 创作者 $150-$2K/条 | 强（绑紧广告预算） |
| 8 | **抠图边缘细节（头发、薄纱、毛绒）崩** | 1+2 类，服装/宠物为主 | Photoshop 手修 | 中 |
| 9 | **AI 模特图肢体/手指/脸畸形（特别是男装、有色人种）** | 2 类，时装类 | 真人模特拍 / 不用 AI | 强（这是时装 AI 工具的死线） |
| 10 | **付费工具突然下线功能 / 涨价 / 暗扣费** | 1+2 类 | 频繁换工具 | 反向 = 用户极度不信任 SaaS（需要建立信任） |

---

## D. 反向信号：5 个被高估的"假痛点"

### D1. 「批量生成上千张」对 1 类客户不痛
**证据**：1 类客户 SKU < 100，他们的痛是「单 SKU 多版本」（10 个角度、5 个场景），不是数量。Booth.ai 失败原因之一就是把「批量」当卖点。
**含义**："批量"是 2-3 类才痛的功能，不要在 1 类客户的落地页强调。

### D2. 「Prompt 难写」其实是个工具问题，用户解决方案就是不写
**证据**：所有面向卖家的 AI 工具（SellerPic、Pebblely、Photoroom）都用预设模板/Theme，**用户根本不写 prompt**。
**含义**：别做"prompt 优化器"卖给卖家，做"一键风格 + 行业模板"。

### D3. 「风格不统一」在 1 类客户里不是真问题
**证据**：1 类卖家就是淘宝/速卖通/Etsy 风格大杂烩起步，他们对"品牌一致性"敏感度低。**只有 2 类 DTC 品牌**才会因为"主图和详情图风格断裂"而困扰。
**含义**：风格一致性是 2 类卖家的卖点，不是 1 类。

### D4. 🔴 「合规标记」（AI-generated 水印）用户其实不想要
**证据**：Amazon 政策要求 AI 图披露，但卖家的真实反应是想方设法**不被识别**。Reddit/Seller Central 上的讨论方向是"how to fix Amazon AI image rejection"（怎么躲），不是"how to disclose properly"。
来源：[CloudRetouch — How to Fix Amazon Rejections for 'AI-Generated' Product Photos](https://www.cloudretouch.com/amazon-ai-image-rejection-fix/)
**含义**：**"自动加合规标"是 PM 一厢情愿**。真实合规需求是「确保不被判违规」，不是「主动声明是 AI」。产品话术应反转为"100% 平台审核通过"。

### D5. 「短视频自动生成」目前没人付费，因为不能用
**证据**：搜不到关于"AI 视频替代 UGC"的真实付费意愿，反而是「UGC 创作者 $300-$2K/条」依然是 2 类客户的主要预算。AI 视频生成（Sora、Runway 等）质量不够、品类限制大。
**含义**：「上架包」里把"短视频"做成大卖点要谨慎，可能是"叫好不叫座"。当前可以做的是**「2-3 秒商品旋转/zoom 的短视频」**（替代静态主图），但完整 ad 视频不要承诺。

---

## E. 重要的非显然发现

### E1. 「AI 工具集体被 Trustpilot 1 星」是行业现状，不是个案
Photoroom 1.3 星 / Pebblely 1.4 星 / Pixelcut 频繁被报 dark pattern。**这个赛道的用户教育成本和信任成本极高**，新工具必须用「不预扣 / 透明定价 / 不偷偷下线功能」来建立差异化。

### E2. Booth.ai 死亡警示 —— "做垂直 AI 摄影" 是个反复死亡的赛道
2023 Winter YC 的 Booth.ai 死了；2024 年 Pebblely 评分跌到 1.4；Pixelcut 被集体投诉；Photoroom 把核心功能下线。**这意味着 "AI 出商品图" 本身不是商业模式**。Booth.ai 的复盘说是因为 "doing too much, too soon, without earning your audience first" —— 启发：上架包必须先攻一个最痛 + 最具体的入口（比如：先攻"亚马逊白底主图自动合规"），再扩张。

### E3. 中国白牌 vs 美国本土卖家的"政策不公"情绪
[Amazon Seller Central](https://sellercentral.amazon.com/seller-forums/discussions/t/862e0ee1-f611-4aa7-ac90-6757aea901ea) 上美国卖家普遍认为"主图政策只对自己执法、放过中国对手"。**做中国出海工具，需要警惕「美国卖家看到中国 AI 工具的天然敌意」**。GTM 应该用美国地址 + 英文社区 + 美国 KOL 切入，不要直白主打"made by Chinese team"。

### E4. 食品/保健品/电子三个品类的 AI 图退货率最高
- 电子：AI 编造端口、按钮
- 保健品/食品：AI 改写成分表/警告语
- 服装：AI 扭曲面料、手指、肩线

**含义**：上架包如果切这三个品类要小心，反而**家居、文具、宠物用品、配饰、家具/家居 这些"非文字标签依赖"品类是 AI 出图的甜蜜点**。Flair AI 明确说"excels at furniture and home decor categories"。

### E5. 真人摄影替代不掉，AI 替代的是"美工 + 信息图 + 场景图"
Soona 这类「订阅式真人拍摄」生意还活着，说明 1 类客户依然认"真照"。**AI 工具不要把自己定位成"替代摄影"，而是"替代美工和重复劳动"**。一张原始白底真照 + AI 出 30 张衍生素材，是被验证的 JTBD 路径。

### E6. 跨境卖家"上传被打回 → 修 → 再上传"的 loop 是隐形大杀器
[Amazon Seller Central](https://sellercentral.amazon.com/seller-forums/discussions/t/c4b8208a-5dcf-47d0-a5e3-743eacb0f932) 上"I can not change my main image!"这种帖子高频。**「确保一次过审」是个比「图好不好看」更刚的痛点**。建议上架包内置一个「Amazon/Shopify/eBay 主图预检」（白底纯度、占比、文字检测、属性 check）。

### E7. 🔴 UGC / 短视频的"消耗速度"是被低估的需求
DTC 2 类卖家每 7-10 天要换 Meta Ads 创意，这是个**月度高频复购**的场景。比"上架包"（上架是一次性的）更有 SaaS 续费逻辑。**值得考虑把产品做成「上架 + 持续投放素材生成」双轮**。

### E8. 「按品牌封装风格」是 2-3 类客户唯一会付高价的东西
2 类 DTC 品牌不会买"通用 AI 工具"，会买"我品牌的 AI 工具"（私有 LoRA / 自定义场景库）。3 类代运营公司会买"多品牌切换 + 客户隔离"。**「上架包」想吃 2-3 类客户的钱，必须做品牌资产托管**。

### E9. eBay 移动端上传画质暴跌 = 一个被忽略的入口
eBay 卖家在自家社区抱怨 app 把图压成 500px。如果上架包能解决"手机拍 → AI 增强 → 上传 eBay 不被压"，可能是个低竞争的切入。

### E10. 🔴「上架包」名字 vs "投放素材包"哪个更刚？
- **"上架包"** = 一次性需求，难做 ARR
- **"投放素材包"** = 月度续费需求，刚性

但「上架包」是更清晰的「初次触达」入口（卖家有了新 SKU 一定要做这事）。**最优解可能是：以"上架包"获客，以"持续投放素材"留存**。

---

## 调研盲点（坦诚标注）

1. **代运营/MCN（3 类客户）信息严重不足**：英文公开渠道几乎没有 agency 视角的真实抱怨。**强烈建议补 5-10 家中国跨境代运营的一手访谈**。
2. **Temu/SHEIN/TikTok Shop 的卖家原话很少**：这几个平台的卖家社群主要在中国微信群、不在 Reddit。
3. **付费意愿的精确数字**：搜到的"$29-$99/月"是工具方公布的价格，**用户真实复购率/留存数据搜不到**。

---

## 关键信源汇总（按调用频次）

- [Amazon Seller Central Forum](https://sellercentral.amazon.com/seller-forums/) - 主图驳回、AI 政策、卖家情绪
- [Trustpilot - Photoroom](https://www.trustpilot.com/review/www.photoroom.com) (1.3★)
- [Trustpilot - SellerPic](https://www.trustpilot.com/review/sellerpic.ai)
- [Trustpilot - Pixelcut](https://www.trustpilot.com/review/pixelcut.ai)
- [Trustpilot - Soona](https://www.trustpilot.com/review/soona.co)
- [Shopify App Store - Pebblely](https://apps.shopify.com/pebblely-ai) (1.4★)
- [G2 - Photoroom Pros/Cons](https://www.g2.com/products/photoroom/reviews?qs=pros-and-cons)
- [CTOL - Amazon AI photos return 16%](https://www.ctol.digital/news/amazon-shoppers-return-products-ai-photos-dont-match-reality/)
- [Nightjar - Real Cost of Product Photography 2026](https://nightjar.so/blog/the-real-cost-of-product-photography-a-breakdown)
- [Shopify - Product Photography Pricing](https://www.shopify.com/blog/product-photography-pricing)
- [Squareshot - Product Photography Workflow](https://www.squareshot.com/post/essential-guide-to-product-photography-workflow)
- [Pebblely Blog - Why AI Product Photos Get Text Wrong](https://pebblely.com/blog/ai-product-photos-text-extraction/)
- [Dang.ai - Booth AI Shutdown Analysis](https://dang.ai/tool/ai-product-photography-tool-booth)
- [Rewarx - Amazon AI Image Policy 2026](https://www.rewarx.com/blogs/amazon-ai-generated-image-policy-2026)
- [Vidico - Social Media Video Cost 2026](https://vidico.com/news/social-media-video-cost/)
- [eBay Community - Mobile photo quality](https://community.ebay.com/t5/Android-App/Photos-are-uploading-in-very-low-quality/td-p/33856103)
- [CloudRetouch - Fix Amazon AI image rejections](https://www.cloudretouch.com/amazon-ai-image-rejection-fix/)
- [36Kr - AI Magic Showdown](https://eu.36kr.com/en/p/3409700220685704)
- [Ravelin - AI Refund Fraud](https://www.ravelin.com/blog/ai-powered-refund-abuse-dispute-fraud)

---

## 给 PM 的一句话总结

真实需求强度排序 = 「**主图自动合规 (Amazon)**」> 「**多平台尺寸适配**」> 「**详情长图/A+ 美工替代**」> 「**lifestyle 场景图**」> 「**模特/视频/批量**」。

建议「上架包」用最痛的第 1 个做钩子获客，用第 3 个做付费转化，**暂时不要承诺第 5 个（视频/模特）的质量**——因为头部工具都做不好。**信任比技术更难建**：定价透明、不偷下线功能、独立计费 = 三个不能让步的底线。
