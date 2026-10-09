# 麦当劳 MCP 工具参考（Tool Reference）

> 本文档基于 **2026-10-09 对 `https://mcp.mcd.cn` 的实测**（`initialize` + `tools/list` + 12 个工具真实调用）整理，
> 反映的是**服务端实际返回**的工具名与参数要求。官方 GitHub 使用指南（v1.0.9 文档）与实测有 4 处差异，已在文中标注 ⚠️。
>
> 端点 `https://mcp.mcd.cn` · Streamable HTTP · 认证 `Authorization: Bearer $MCD_MCP_TOKEN` · 限流 600 次/分钟
> 实测结果：`serverInfo = { name: "mcd-mcp", version: "1.0.0" }`，协议版本 `2025-06-18`，**实际工具数 35 个**。

## 0. 通用参数规则（最容易踩坑的部分）

### orderType / beType 组合矩阵

`query-meals`、`query-meal-detail`、`query-store-coupons`、`calculate-price`、`create-order` 等工具的必填参数，必须按场景传入：

| orderType | beType | 场景 | beCode 是否必传 |
|---|---|---|---|
| 1 | 1 | 到店自取（外带/堂食） | ❌ 不传 |
| 1 | 5 | 得来速车道取餐 | ✅ 必传（来自门店查询结果） |
| 2 | 2 | 麦乐送到家 | ✅ 必传 |
| 2 | 6 | 企业团餐 | ✅ 必传 + `gmServiceCode`（来自 `query-meal-assistance`） |

> `orderType`：1=到店（含到店自取 + 得来速），2=外送（含麦乐送 + 团餐）。
> `beCode` 与 `storeCode` 配对使用；到店自取场景不传 `beCode`，其余场景必传。

### 价格单位：分

`calculate-price` 与 `query-meals` 返回的金额均为**分**。例：`"price": 6450` = **¥64.50**。向用户展示前必须除以 100。

### 门店查询的两个坑（实测）

| 参数组合 | 实测结果 |
|---|---|
| `{beType:1, city:"重庆市", searchType:2}` | ❌ `600058 城市名或者关键词不能为空` — 按位置搜索时**城市+关键词都要给** |
| `{beType:1, city:"重庆", searchType:1}` | ❌ `600050 收藏餐厅列表为空` — `searchType=1` 查的是**用户收藏的餐厅**，新用户必为空 |
| `{beType:1, city:"重庆市", keyword:"解放碑", searchType:2}` | ✅ 返回门店列表 |

**结论：定位门店一律使用 `searchType=2` 且 `city` + `keyword` 同时提供。**

### 券的两类查询不要混用

- `query-my-coupons`：查**卡包里的券**，不做门店/渠道/下单规则校验，**不承诺可用**。
- `query-store-coupons`：查**指定门店 + 订单类型下真正可用的券**。下单前用这个。

## 1. 菜单与营养

| Tool | 用途 | 必填参数 | 实测记录 |
|---|---|---|---|
| `query-meals` | 门店可售餐品列表 | `storeCode, orderType, beType` | ✅ 实测重庆金鹰财富中心餐厅返回 **122 个餐品**、12 个分类；`data.categories[].meals[].code` 为餐品编码，`data.meals[code]` 为详情（`currentPrice`/`originalPrice`/`discountType`/`canWithOrder`） |
| `query-meal-detail` | 餐品详情与套餐组成 | `storeCode, orderType, beType, code` | 用于查看套餐包含内容、更换套餐内商品组合与餐品特制 |
| `list-nutrition-foods` | 餐品营养数据 | 无 | ✅ 实测返回 **160 款餐品**，字段 `productName, energyKj, energyKcal, protein, fat, carbohydrate, sodium, calcium` |

**营养数据实测样例（真实返回）：**

| 餐品 | 能量(kJ) | 能量(kcal) | 蛋白质(g) | 脂肪(g) | 碳水(g) | 钠(mg) | 钙(mg) |
|---|---|---|---|---|---|---|---|
| 猪柳麦满分 | 1288 | 308 | 16 | 16 | 24 | 781 | 213 |
| 猪柳蛋麦满分 | 1618 | 387 | 23 | 21 | 25 | 846 | 243 |
| 烟肉蛋麦满分 | 1089 | 260 | 16 | 10 | 24 | 483 | 238 |
| 中薯条 | 1210 | 289 | 4 | 12 | 38 | 165 | 18 |
| 小薯条 | 877 | 210 | 3 | 9 | 28 | 120 | 13 |
| 麦乐鸡5块 | 890 | 213 | 12 | 12 | 13 | 422 | 9 |
| 大杯玉米杯 | 365 | 87 | 4 | 1 | 12 | 2 | 10 |
| 圆筒冰淇淋 | 391 | 93 | 2 | 3 | 14 | 36 | 77 |

> 注意：营养数据是**全局维度**，与单店在售菜单可能不同步；下单前必须用 `query-meals` 核对门店实际可售。

## 2. 门店与配送

| Tool | 用途 | 必填参数 | 实测记录 |
|---|---|---|---|
| `query-nearby-stores` | 到店场景查门店 | `beType, searchType`（`searchType=2` 时 `city`+`keyword` 必填） | ✅ `{beType:1, city:"重庆市", keyword:"解放碑", searchType:2}` 返回门店，含 `storeCode`（如 `3450149`）、`beCode`、`distance`、`businessStatus`、`businessStartTime/EndTime`、`reservation`、`reservationTimeOptions` |
| `delivery-query-addresses` | 查配送地址列表 | 无 | ✅ 新账号实测返回 `data.addresses = []`，需先引导创建地址 |
| `delivery-create-address` | 新增配送地址 | `city, contactName, phone, address, addressDetail` | 敏感操作，需用户明确提供信息 |
| `delivery-query-stores` | 查可配送门店 | `beType, addressId` | 必须先有 `addressId` |
| `query-meal-assistance` | 团餐助餐服务 | `storeCode`（仅 beType=6） | 团餐计价前调用，返回 `gmServiceCode` |

> ⚠️ 实测提示：门店返回结果中要求**完整展示 `storeCode` 与 `beCode`**；若门店 `reservation=true`，必须完整展示 `reservationTimeOptions`（尤其 `today=true` 的日期需标 `*`），否则用户无法完成预约。

## 3. 计价与下单

| Tool | 用途 | 必填参数 | 实测记录 |
|---|---|---|---|
| `calculate-price` | 计价（含优惠） | `storeCode, orderType, beType, items[]` | ✅ 实测成功。返回 `productOriginalPrice / productPrice / originalPrice / discount / price`（**单位：分**）、`productList[]`、`takeWayList[]` |
| `create-order` | 创建订单 | `storeCode, orderType, beType, items[]` + 到店场景 `takeWayCode` | 本项目**未做真实下单**（避免产生真实消费）；`takeWayCode` 取自 `calculate-price` 的 `takeWayList[].code` |
| `cancel-order` | 取消订单 | `orderId, cancelReasonCode` | `cancelReasonCode`：1=改主意了 2=重复下单 3=点错 4=地址/电话填错 5=送达时间选错 -1=其它 |
| `query-order` | 订单详情 | `orderId` | 支付完成后用它确认最新状态 |
| `order-list` | 历史订单 | 无 | **非商城**订单 |

**items 元素结构**（`calculate-price` / `create-order` 通用）：

```jsonc
{
  "productCode": "9900016311",   // 餐品编码，来自 query-meals
  "quantity": 1,                  // 必填，≥1
  "couponId": "…",                // 可选：用券
  "couponCode": "…",              // 可选：券码（与 couponId 配对）
  "roundList": [                  // 可选：套餐子项（更换套餐组成时使用）
    { "round": "…", "comboItemList": [ { "code": "…", "quantity": 1 } ] }
  ],
  "modification": { "values": [ { "key": "", "code": "", "quantity": 1 } ] }  // 可选：特制
}
```

**实测计价返回样例（重庆金鹰财富中心餐厅，到店自取）：**

```json
{
  "success": true, "code": 200,
  "data": {
    "productOriginalPrice": 6450, "productPrice": 6450,
    "originalPrice": 6450, "discount": 0, "price": 6450,
    "productList": [{ "productCode": "9900016311", "productName": "龙焰美味四件套", "quantity": 1, "originalSubtotal": 6450, "subtotal": 6450 }],
    "takeWayList": [
      { "code": "eat-in", "title": "堂食", "subtitle": "店内用餐" },
      { "code": "take-in-store", "title": "外带", "subtitle": "店内自提" }
    ]
  }
}
```

> 🔎 实测发现：门店菜单中该商品 `currentPrice = 29`（原价 64.5），但裸计价返回 6450 分——说明**促销价需配合 `withOrder` / 套餐子项等条件**才会生效。这正是"必须用 `calculate-price` 实算、不能拿菜单价直接报给用户"的原因，也是本 Skill 把计价作为下单前置强校验的依据。

## 4. 优惠券

| Tool | 用途 | 必填参数 | 实测记录 |
|---|---|---|---|
| `available-coupons` | 麦麦省可领券列表 | 无 | ✅ 实测返回券标题、状态、图片（如"麦旋风任选""薯薯任选""巧克力味厚松饼猪柳蛋套餐"） |
| `auto-bind-coupons` | 一键领券 | 无 | ✅ 实测返回「暂无可领取的优惠券」（券已全部领取） |
| `query-my-coupons` | 我的卡包 | 无 | ✅ 实测返回 **8 张可用券**，含 `title`、用券价、`tradeDateTime` 有效期、标签（今日到期/到店专用/外送专用） |
| `query-store-coupons` | 指定门店可用券 | `storeCode, orderType, beType` | ✅ 实测（未领券门店）返回 `data: []` |

## 5. 积分与商城

| Tool | 用途 | 必填参数 | 实测记录 |
|---|---|---|---|
| `query-my-account` | 积分账户 | 无 | ✅ 返回 `availablePoint / accumulativePoint / frozenPoint / usedPoint / currentMouthExpirePoint / nextMouthExpirePoint / lastMouthExpirePoint / expiredPoint` |
| `mall-points-products` | 可兑换商品列表 | 无（可选 `catRuleIds`） | 类目：商品券(1>4)、实物商品(2)、周边(2>8)、实物礼品卡(2>9)、生日派对(1>6>20)、主题派对(1>6>21)、麦麦体验营(1>6>22)、品鉴会(1>6>25)、读书会(1>6>34)、积分兑换活动(1>6>40) |
| `mall-product-detail` | 商品详情 | `spuId` | 返回全部 SKU，选具体 SKU 后才能兑换；`shopId=2` 支持 `mall-create-order` |
| `mall-create-order` | 积分兑换下单 | `skuId, spuCategory` | ⚠️ 单个商品单独下单；**多个商品必须依次排队下单**，等前一单响应成功再下一单 |
| `mall-order-list` | 商城订单列表 | 无（可选 `lastId, size`） | 仅商城订单 |
| `mall-order-detail` | 商城订单详情 | `orderId` | 含支付积分、支付金额、订单状态 |

## 6. 活动与抽奖

| Tool | 用途 | 必填参数 | 实测记录 |
|---|---|---|---|
| `campaign-calendar` | 营销活动日历 | 无（可选 `specifiedDate`） | ✅ 实测返回 10 月活动，如"超值 9.9 元早餐两件套"（10/8–10/21）、"麦当劳 X PEACEMINUSONE"（10/8 10:45 开售）。传 `specifiedDate` 时返回该日 + 前后最近各一个有活动的日子（共 3 天） |
| `query-lottery-info` | 抽奖活动信息 | 无 | 返回 `drawDecision.nextConsumption`、`drawDecision.resourceEligible`、`fallbackConsumption` |
| `draw-lottery` | 执行抽奖 | 无 | ⚠️ **强约束**：必须已向用户展示 `nextConsumption` 并获**明确确认**后才可调用；严禁试抽/自动抽/连抽；短时间重复调用返回"操作太频繁" |
| `query-my-prizes` | 我的奖品 | 无（可选 `pageNum, pageSize`） | 按中奖时间倒序 |

## 7. 主题活动（派对 / 品鉴会）

> ⚠️ **实测工具名与官方 README 不一致**：实际为 `query-party-store-date` / `query-party-store-session`，README 中的 `query-partystore-date` / `query-partystore-session` 调用会失败。

流程：`mall-points-products`（拿 `spuId`）→ `query-party-city` → `query-party-store` → `query-party-store-date` → `query-party-store-session` → `party-order-create`

| Tool | 用途 | 必填参数 |
|---|---|---|
| `query-party-city` | 活动城市列表 | `spuId` |
| `query-party-store` | 城市下可参与门店 | `code`（城市 code）, `latitude, longitude`, `spuId` |
| `query-party-store-date` | 门店可预约日期 | `spuId, storeCode` |
| `query-party-store-session` | 日期可预约场次 | `spuId, storeCode, dateStr` |
| `party-order-create` | 创建主题活动订单 | `partyType`（1=包场，2=拼团），仅 `shopId=5` |

## 8. 系统与其他

| Tool | 用途 | 备注 |
|---|---|---|
| `now-time-info` | 获取服务器时间 | ✅ 实测返回 `date / datetime / day / dayOfWeek / formatted / month / offset / timestamp / timezone / utc`。涉及"今天/本月/过期"判断前**必须先调用** |
| `query-promotions` | 团餐促销规则 | ⚠️ 官方 README 未列出；仅企业团餐（beType=6）可用，返回满减/满折规则 |
| `query-survey-coupon` | 订单满意度答卷与关联奖券 | ⚠️ 官方 README 未列出；入参 `orderId`，查询该订单 CSAT 答卷与关联奖券核销状态 |

## 9. 错误码

| code | 含义 | 处理建议 |
|---|---|---|
| 200 | 成功 | — |
| 401 | Token 无效、过期或未提供 | 检查 `MCD_MCP_TOKEN` 与 `Authorization` 头 |
| 429 | 触发限流（>600 次/分钟） | 等待约 60 秒重试，控制调用频率 |
| 600050 | 收藏餐厅列表为空 | `searchType=1` 查的是收藏门店，改用 `searchType=2` |
| 600058 | 城市名或者关键词不能为空 | `searchType=2` 必须同时提供 `city` + `keyword` |

## 10. 与官方文档的差异清单（实测修正）

| # | 官方 README（v1.0.9 文档） | 实测服务端 | 影响 |
|---|---|---|---|
| 1 | `query-partystore-date` | `query-party-store-date` | 按 README 调用会失败 |
| 2 | `query-partystore-session` | `query-party-store-session` | 按 README 调用会失败 |
| 3 | 未列出 `query-promotions`、`query-survey-coupon` | 实际存在，共 **35** 个工具 | 少用两个可用能力 |
| 4 | `delivery-query-address`（描述中出现） | 工具名实为 `delivery-query-addresses` | 按描述调用会失败 |

## 11. 官方版本日志摘要

- 2025-12-09 v1.0.0 麦麦日历 + 麦麦省领券
- 2026-01-23 v1.0.1 +营养信息列表，URL 精简
- 2026-02-13 v1.0.2 +麦乐送点餐与积分兑换券
- 2026-04-02 v1.0.3 +到店取餐与团餐
- 2026-05-21 v1.0.4 +积分兑换实物、商城订单，支持得来速与全场景预约
- 2026-06-16 v1.0.5 +套餐内商品组合更换、部分餐品特制
- 2026-07-16 v1.0.6 +历史订单；展示餐品优惠价；随单购麦金卡/早餐卡
- 2026-07-29 v1.0.7 +主题活动（派对/品鉴会）
- 2026-08-27 v1.0.8 +积分抽奖
- 2026-09-10 v1.0.9 +取消订单、餐具选择、麦乐送备注；堂食外带返回取餐柜二维码
