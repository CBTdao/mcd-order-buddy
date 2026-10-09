# 麦麦点餐管家 (McOrder Buddy) — 麦当劳 MCP Skill

用一句话点餐、按热量预算配餐、把每一张优惠券都用在刀刃上。

基于 **麦当劳中国官方 MCP 服务**（实测 35 个工具）开发的 Agent Skill，把「营养查询 → 一键领券 → 比价计价 → 生成订单」整条链路交给 AI 一次完成。本 Skill 不绑定任何特定 Agent 框架：SKILL.md 与 references/tools.md 全程使用官方工具名描述流程，可接入 WorkBuddy、Claude Code、Cursor、Trae、Cherry Studio 等任何支持 MCP 的客户端。

> ✅ **已完成真实环境验证**：2026-10-09 对 `https://mcp.mcd.cn` 实测，握手成功（mcd-mcp v1.0.0）、35 个工具可用，「门店 → 菜单 → 券 → 计价」核心链路全部打通。完整证据见 [docs/TEST_REPORT.md](docs/TEST_REPORT.md)，可复现脚本见 [scripts/mcp-smoke-test.mjs](scripts/mcp-smoke-test.mjs)。

## 实测得到的 4 个独有发现

这些是跑通真实接口后才暴露的问题，官方文档里没有写，也是本 Skill 相比"照抄文档"的差异价值：

1. **官方文档的工具名有 2 个是错的**：`query-partystore-date` / `query-partystore-session` 实际应为 `query-party-store-date` / `query-party-store-session`，照文档调用直接失败。
2. **官方文档漏了 2 个可用工具**：`query-promotions`（团餐满减规则）、`query-survey-coupon`（订单满意度奖券），实际工具数 **35** 个而非文档的 33 个。
3. **门店查询有个必踩的坑**：`searchType=1` 查的是"我的收藏餐厅"（新账号必报 `600050`）；`searchType=2` 必须同时给 `city` + `keyword`（否则 `600058`）。
4. **菜单促销价 ≠ 实付价**：菜单显示某四件套 ¥29（原价 64.5），裸计价却返回 6450 分 —— 促销价需满足随单购等条件才生效。所以**报价必须以 `calculate-price` 实算为准**。

## 它能做什么

### 1. 热量预算配餐 🥗
> "我今天只有 600 大卡预算，帮我配一个麦当劳套餐。"

Skill 调用 `list-nutrition-foods` 获取餐品营养数据（能量、蛋白质、脂肪、碳水、钠），按热量预算自动组合「主餐 + 小食 + 饮品」方案，并给出蛋白质优先 / 控钠优先等不同策略的备选组合。

### 2. 省钱下单链路 💰
> "用最便宜的方式帮我点一个巨无霸套餐，到店自取。"

固定流程：`auto-bind-coupons` 一键领券 → `query-my-coupons` 查可用券 → `query-meals` 查门店菜单 → `calculate-price` 带券计价对比 → `create-order` 生成待支付订单（跳转官方渠道支付）。Skill 永远先算券后价再下单，并向用户展示"省了多少"。

### 3. 活动·积分·商城提醒 🎁
> "麦当劳这个月有什么活动？我的积分快过期了吗？能换点什么？"

调用 `campaign-calendar` 查活动日历、`query-my-account` 查积分（含即将过期积分）、`mall-points-products` 按积分门槛筛选可兑换商品、`query-lottery-info` 提醒积分抽奖机会。

## 快速开始

### 第一步：申请麦当劳 MCP Token

1. 打开麦当劳 MCP 开放平台：https://open.mcd.cn/mcp
2. 手机号验证登录
3. 右上角【控制台】→ 点击【激活】→ 同意服务协议
4. 一键复制你的 MCP Token

### 第二步：把麦当劳 MCP 接入你的 AI 客户端

以 WorkBuddy 为例（其他客户端见 [麦当劳官方接入指南](https://github.com/M-China/mcd-mcp-server)）：

```json
{
  "mcpServers": {
    "mcd-mcp": {
      "type": "streamablehttp",
      "url": "https://mcp.mcd.cn",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

> ⚠️ 一定把 `YOUR_MCP_TOKEN` 替换为你自己的 Token。Token 请妥善保管，**不要提交到任何公开仓库**（本仓库所有配置均使用环境变量占位符）。

### 第三步：装载本 Skill

把本仓库的 `SKILL.md` 放入你的 Agent 技能目录（WorkBuddy 为 `~/.workbuddy/skills/mcd-order-buddy/`，其他框架参考各自的 Skill / 系统提示加载方式）。`references/tools.md` 供 Agent 按需查阅 35 个工具的入参与返回值要点。

### 第四步：开吃

- "帮我看看今天有什么优惠券，全部领了"
- "600 大卡以内帮我配个晚餐套餐"
- "附近的麦当劳门店有哪些？帮我点个板烧鸡腿堡，得来速取餐"

## 目标用户

| 人群 | 痛点 | 对应能力 |
|---|---|---|
| 上班族 / 打工人 | 午休时间短，不想翻小程序比价 | 一句话下单 + 券后最优价 |
| 减脂 / 健身人群 | 想吃麦当劳但怕热量超标 | 热量预算配餐 |
| 学生党 | 想薅尽每一张券、每一个积分 | 一键领券 + 积分商城筛选 |
| 麦门老粉 | 活动、抽奖、限定套餐太多记不住 | 活动日历 + 积分抽奖提醒 |

## 仓库结构

```
mcd-order-buddy/
├── SKILL.md                  # Skill 主体：场景、硬性参数规则、三大流程
├── README.md                 # 本文件
├── MCP_INTEGRATION.md        # 麦当劳 MCP Server / Tool / 调用流程 / 业务价值说明
├── CONTEST_DECLARATION.md    # 参赛声明（官方原文）
├── workbuddy.md              # 使用 WorkBuddy 开发的对话记录
├── references/
│   └── tools.md              # 35 个 MCP 工具实测参考（含官方文档偏差修正）
├── examples/
│   └── demo-prompts.md       # 可直接复制的演示提示词
├── scripts/
│   └── mcp-smoke-test.mjs    # 可运行的冒烟测试（只读，验证 Token 与核心链路）
├── docs/
│   ├── TEST_REPORT.md        # 实测报告（真实门店/餐品/券/金额证据）
│   └── tools-list-snapshot.json  # tools/list 原始响应快照
└── LICENSE                   # MIT License
```

## 复现验证

```bash
# 申请 Token：https://open.mcd.cn/mcp （手机号登录 → 控制台 → 激活）
MCD_MCP_TOKEN=你的Token node scripts/mcp-smoke-test.mjs --city 重庆市 --keyword 解放碑
```

脚本默认只做只读调用（不会下单、不会抽奖、不消耗积分），实测输出：

```text
✅ initialize — serverInfo=mcd-mcp@1.0.0, protocol=2025-06-18
✅ tools/list — 35 个工具
✅ query-nearby-stores — 5 家门店，首选=麦当劳重庆金鹰财富中心餐厅(3450149)
✅ query-meals — 13 个分类 / 122 个餐品
✅ calculate-price — “我就喜欢”鸡薯双全盒 应付 ¥31.00
```

## 设计原则

- **先券后单**：任何下单前先领券、先比价，展示券后价与省钱金额。
- **下单需确认**：`create-order` 前必须向用户复述订单明细与总价；支付永远跳转麦当劳官方渠道完成，Skill 不接触支付。
- **隐私最小化**：不读取、不缓存、不展示用户地址与订单中的敏感信息；Token 只从环境变量读取。
- **营养建议免责**：配餐结果仅供生活方式参考，不构成医疗或营养学专业建议。

## 参赛信息

本项目为 **2026 麦当劳程序员节创意开发大赛** 参赛作品，使用 WorkBuddy 开发（详见 `workbuddy.md`）。

- 开发周期：2026-10-09 起（当日完成开发 + 真实环境实测）
- 依赖服务：麦当劳中国官方 MCP Server（`https://mcp.mcd.cn`，实测 35 Tools，Streamable HTTP，服务端 mcd-mcp v1.0.0）
- 实测证据：[docs/TEST_REPORT.md](docs/TEST_REPORT.md)
- 声明：本项目由参赛者独立开发，非麦当劳官方产品。

## License

MIT
