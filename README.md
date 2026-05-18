# ListPack Studio

跨境电商「上架包」AI Agent —— 单图变全套上架素材（主图 / 详情 / Banner / 短动图 / 多平台尺寸 / 一次过审）。

## 项目状态

**Phase 0：市场验证中**（2026-05）

尚未进入产品开发。当前阶段产出市场调研、客户访谈、价格验证、Wizard-of-Oz MVP，4 周后决定 Go/No-Go。

## 定位（一句话）

> Upload one photo. Pass Amazon, Shopify, Temu, SHEIN review the first time. Get the full listing pack + ad creative refreshed every 10 days. From $49/month.

## 目录

```
listpack-studio/
├── README.md
└── docs/
    └── research/
        ├── 00-executive-summary.md      # 最终汇总报告（先读这份）
        ├── 01-market-size-trends.md     # 市场规模 / 融资 / 趋势
        ├── 02-customer-segments.md      # 三类客户付费力与采购路径
        ├── 03-platform-compliance.md    # 五大平台合规深度调研
        ├── 04-user-pain-points-jtbd.md  # 真实痛点 + JTBD 流程
        └── 05-competitor-matrix.md      # 跨境电商竞品功能矩阵
```

## 关键决策（来自调研）

- **核心 ICP**：B（DTC 100-2000 SKU）；冷启动顺序 B → A → C
- **价格分层**：Free / $19 / **$49** / $149 / $499 / Enterprise
- **MVP 必做**：Amazon 主图合规检查 / 多平台尺寸 / A+ 详情长图 / 场景图 / 品类规则引擎 / 合规元数据
- **MVP 不做**：AI 模特 / 完整短视频 / LoRA 自训 / 团队协作 / 中国国内电商
- **避开品类**：保健品 / 医美 / 珠宝 / 食品
- **窗口期**：12-18 个月

## Phase 0 验证里程碑（4 周）

| 周 | 动作 | Go/No-Go 信号 |
|---|---|---|
| W1 | 20 个 DTC 卖家深访 | 真实付费意愿 |
| W2 | 5 个中国跨境代运营深访 | C 类工作流验证 |
| W3 | Landing + Fake Door 测试（Google/Meta 各 $500） | waitlist 转化 >5%，CAC <$80 |
| W4 | Wizard-of-Oz MVP（10 单人工产出） | ≥3 用户预付 $49/mo |

详见 [00-executive-summary.md](docs/research/00-executive-summary.md) 第七章。
