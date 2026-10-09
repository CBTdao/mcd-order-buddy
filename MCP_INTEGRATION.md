# MCP_INTEGRATION.md — 麦当劳 MCP 接入说明

本文档说明「麦麦点餐管家」实际使用的麦当劳 MCP Server、Tools、调用流程与业务价值。

## 1. 使用的 MCP Server

| 项 | 值 |
|---|---|
| 服务方 | 麦当劳中国（官方） |
| 端点 | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 认证方式 | 请求头 `Authorization: Bearer <MCP_TOKEN>`，Token 经环境变量 `MCD_MCP_TOKEN` 注入 |
| 协议版本 | 最高支持 2025-06-18（实测确认） |
| 服务端版本 | `serverInfo = mcd-mcp@1.0.0`（实测） |
| 限流 | 每 Token 600 次/分钟（超限返回 429） |
| 工具总数 | **35 个**（实测 `tools/list`；官方文档表列 33 个） |
| 开放平台 | https://open.mcd.cn/mcp |
| 官方指南 | https://github.com/M-China/mcd-mcp-server |
| 实测报告 | [docs/TEST_REPORT.md](docs/TEST_REPORT.md) |

### 客户端配置示例（Token 使用环境变量占位符）

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

> 安全说明：本仓库遵循参赛声明，不包含任何真实 Token。请把 `YOUR_MCP_TOKEN` 替换为你自己在 open.mcd.cn 申请的 Token，且不要提交到任何公开仓库。

## 2. 使用的 Tools

本 Skill 覆盖官方 Server（v1.0.9 文档 / 实测 v1.0.0 服务端）的**全部 35 个工具**，核心链路使用以下工具：

### 热量预算配餐

| Tool | 作用 |
|---|---|
| `list-nutrition-foods` | 获取餐品营养数据（能量/蛋白质/脂肪/碳水/钠/钙），作为配餐数据源 |
| `now-time-info` | 确定"今天"的日期，用于早/午/晚餐场景区分 |
| `query-meals` | 下单前核对目标门店当前实际可售餐品 |

### 省钱下单链路

| Tool | 作用 | 实测状态 |
|---|---|---|
| `auto-bind-coupons` | 一键领取所有可领的麦麦省券 | ✅ 返回「暂无可领取的优惠券」（已领满） |
| `query-my-coupons` | 查询已领券（卡包） | ✅ 实测 8 张 |
| `query-store-coupons` | **真正可用于当前门店+订单类型的券** | ✅ 实测 3 张 |
| `query-nearby-stores` | 定位到店/得来速门店 | ✅ 实测 5 家（`searchType=2` + `city` + `keyword`） |
| `delivery-query-addresses` / `delivery-query-stores` | 定位外送门店 | ✅ 实测地址列表为空，需先创建 |
| `query-meals` / `query-meal-detail` | 查菜单与套餐组成 | ✅ 实测 13 分类 / 122 餐品 |
| `calculate-price` | 带券计价（单位：分） | ✅ 实测通过，返回 `price/originalPrice/discount/takeWayList` |
| `create-order` | 生成待支付订单，返回官方支付链接 | 未做真实下单（避免产生消费） |
| `cancel-order` / `query-order` / `order-list` | 改单、查进度、查历史 | 需真实订单号才能验证 |

### 活动 · 积分 · 商城

| Tool | 作用 |
|---|---|
| `campaign-calendar` | 当月营销活动日历，临期提醒 |
| `query-my-account` | 积分账户（可用/即将过期） |
| `mall-points-products` / `mall-product-detail` / `mall-create-order` | 积分商城筛选与兑换 |
| `query-lottery-info` / `draw-lottery` / `query-my-prizes` | 积分抽奖 |
| `query-party-city` / `query-party-store` / `query-party-store-date` / `query-party-store-session` / `party-order-create` | 主题活动（派对/品鉴会）预约下单 |

完整工具清单与入参/返回值注意点见 [references/tools.md](references/tools.md)。

### ⚠️ 实测发现的官方文档偏差

| # | 官方 README | 实测服务端 | 影响 |
|---|---|---|---|
| 1 | `query-partystore-date` | `query-party-store-date` | 按文档调用会失败 |
| 2 | `query-partystore-session` | `query-party-store-session` | 按文档调用会失败 |
| 3 | 未列出 | `query-promotions`、`query-survey-coupon` | 少用两个可用能力 |
| 4 | `delivery-query-address` | `delivery-query-addresses` | 按描述调用会失败 |

## 3. 核心调用流程

### 流程 A：热量预算配餐

```
用户: "600 大卡以内配个晚餐"
  └─> now-time-info                # 确定当前日期
  └─> list-nutrition-foods         # 拉取营养数据
  └─> [Skill 内组合] 按 600 kcal 预算生成 2~3 套"主餐+小食+饮品"组合
  └─> 用户选定组合
  └─> query-meals                  # 核对门店在售，缺货给替代品
  └─> 转入流程 B
```

### 流程 B：省钱下单链路

```
  └─> auto-bind-coupons            # 先领券
  └─> query-my-coupons             # 看卡包（8 张）
  └─> query-nearby-stores          # 选门店（searchType=2 + city + keyword）
  └─> query-meals → query-meal-detail               # 选品（122 个餐品）
  └─> query-store-coupons          # ⚠️ 校验该门店真正可用的券（不整卡包）
  └─> calculate-price (含券)                        # 券后计价（单位：分）
  └─> calculate-price (其他券组合, 可选)             # 多方案比价, 取应付最低
  └─> [向用户复述门店/就餐方式/商品/总价, 获得确认]
  └─> create-order (到店场景需 takeWayCode)          # 生成待支付订单
  └─> 引导用户跳转官方渠道支付       # Skill 不接触支付
```

### 流程 C：活动 · 积分提醒

```
  └─> now-time-info
  └─> campaign-calendar            # 本月活动, 按临期分组
  └─> query-my-account             # 积分 + 即将过期提醒
  └─> mall-points-products         # 按积分水平筛选可兑换商品
  └─> [确认] → mall-create-order   # 兑换
  └─> query-lottery-info           # 抽奖机会提醒 → [确认] → draw-lottery
```

## 4. 业务价值

1. **把 5 个 App 页面压缩成一句话**：官方小程序里领券、比价、看营养、下单分散在多个页面；本 Skill 用自然语言一次完成，并在每次下单前显式展示"原价 → 券后价 → 省了多少"，把优惠决策透明化。
2. **营养配餐是官方工具未串联的场景**：`list-nutrition-foods` 只是数据表；本 Skill 把它变成"预算 → 组合 → 点评 → 下单"的完整决策链路，服务减脂/健身人群。
3. **积分不再沉睡**：主动监测即将过期积分并给出可兑换方案，提升会员资产利用率。
4. **安全边界清晰**：不碰支付、不存凭证、下单必确认、敏感字段不外泄，符合《麦当劳 MCP 服务规则》与大赛信息安全声明。

## 5. 错误处理与限流

| code | 处理 |
|---|---|
| 401 | 提示检查 `MCD_MCP_TOKEN`，不展示 Token 内容 |
| 429 | 等待约 60 秒重试一次，仍失败则停止并告知用户 |
| 600050 | `searchType=1` 查收藏门店导致为空，改用 `searchType=2` |
| 600058 | `searchType=2` 缺 `city`/`keyword`，补齐后重试 |
| 门店缺货/不可售 | 给最接近替代品并说明热量/价格差异，不强行下单 |
