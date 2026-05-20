import type { Dictionary } from '../types';

export const zhCN: Dictionary = {
  common: {
    sign_in: '登录',
    sign_up: '注册',
    sign_out: '退出',
    skip: '跳过',
    save: '保存',
    cancel: '取消',
    refresh: '刷新',
    loading: '加载中…',
    pricing: '价格',
    dashboard: '工作台',
    free: '免费版',
    starter: '入门版',
    pro: '专业版',
    brand: '品牌版',
    most_popular: '最受欢迎',
  },
  landing: {
    badge: '上架包 Agent · v1',
    hero_h1_a: '上传一张图。',
    hero_h1_b: '输出可过审的上架素材。',
    hero_sub:
      'ListPack Studio 把一张商品图变成 Amazon / Shopify / eBay / Temu / SHEIN 五大平台的合规素材包 —— 主图、多平台尺寸、A+ 详情、C2PA AI 元数据，一次跑完。',
    cta_start_free: '免费开始 · 每月 5 SKU',
    cta_see_pricing: '查看价格',
    trust_line:
      '无需信用卡 · 付费档 7 天全额退款 · 随时取消',
    platforms_label: '一次跑通，五个平台',
    how_h2: '3 步从一张图到首次过审',
    how_sub:
      'Agent 把合规检查、出图、多平台尺寸、AI 元数据封装到一张 LangGraph —— 实时流式看每一步。',
    step1_title: '上传一张商品图',
    step1_body:
      '支持 JPG / PNG / WebP，最大 20MB。我们先对照线上 Amazon / Shopify 规则库做合规检查，再开始烧任何 token。',
    step2_title: 'Agent 规划、生成、自修',
    step2_body:
      'LangGraph agent 选场景模板 → 生成主图 → critic 闭环修瑕疵 → 按各平台尺寸裁切。',
    step3_title: '导出可上架素材包',
    step3_body:
      '下载分平台图包 + C2PA AI 披露元数据。品牌版可直接推到 Shopify，其它平台 CSV 导出。',
    values_h2: '为什么团队选 ListPack 而非碎片化工具',
    pricing_teaser_h2: '随你 SKU 增长的价格',
    pricing_teaser_sub:
      '免费起步，SKU 多了再升档。超额费率精心设计 —— 永远不会比升一档贵。',
    pricing_teaser_link: '查看完整价格表',
    final_cta_h2: '5 个免费 SKU 起步 · 无需信用卡',
    final_cta_sub: '3 分钟内对你的真实商品图跑通完整 Agent。',
    final_cta_btn: '创建免费账号',
  },
  pricing: {
    h1: '简单、透明的价格',
    sub: '按需付费，无长期合同。随时取消，数据保留 30 天可导出。',
    sales_footer_a: '需要更多？',
    sales_footer_b:
      '联系销售了解 Agency（$499/月，2500 SKU）或企业版（定制配额 / SLA / 私有 LoRA）。',
    start_free: '免费开始',
    setup_in_progress: '价格配置中',
    trial_days: '{n} 天免费试用',
    no_card: '无需信用卡',
    includes_skus: '含 {n} SKU/月',
    overage_rate: ' · 超额 ${rate}/SKU',
    no_overage: ' · 不允许超额',
  },
  auth: {
    forgot_password: '忘记密码？',
    email_label: '邮箱',
    password_label: '密码',
    new_password_label: '新密码',
    confirm_password_label: '确认新密码',
    submit_sign_in: '登录',
    submit_sign_up: '注册',
    submit_send_reset: '发送重置链接',
    submit_set_new: '设置新密码',
    forgot_h1: '忘记密码？',
    forgot_sub: '输入账户邮箱，我们会发送密码重置链接。',
    reset_h1: '设置新密码',
    sign_in_link: '使用已有账户登录',
    create_account: '创建账号',
    new_to_platform: '第一次使用 ListPack？',
  },
};
