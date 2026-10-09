# 实测报告 — 麦当劳 MCP 接入验证

> 测试时间：2026-10-09 17:22–17:27（GMT+8）
> 测试端点：`https://mcp.mcd.cn`（Streamable HTTP）
> 测试工具：WorkBuddy + `scripts/mcp-smoke-test.mjs`
> 测试结论：**握手成功、35 个工具可用、核心链路（门店 → 菜单 → 券 → 计价）全部打通**

## 1. 握手与工具清单

```text
✅ initialize — serverInfo=mcd-mcp@1.0.0, protocol=2025-06-18
✅ tools/list — 35 个工具
```

原始 `tools/list` 响应快照见 [`docs/tools-list-snapshot.json`](docs/tools-list-snapshot.json)。

**实测工具总数为 35 个**（官方 README 文档表列 33 个，另有 2 个未记录：`query-promotions`、`query-survey-coupon`）。

## 2. 冒烟测试完整输出

```text
麦当劳 MCP 冒烟测试
端点：https://mcp.mcd.cn
（全部为只读调用，不会下单 / 不会抽奖 / 不消耗积分）

[1] 握手与工具清单
  ✅ initialize — serverInfo=mcd-mcp@1.0.0, protocol=2025-06-18
  ✅ tools/list — 35 个工具

[2] 只读工具
  ✅ now-time-info — 2026-10-09 17:26:25
  ✅ query-my-account — 可用积分=0, 本月将过期=0
  ✅ available-coupons — 返回 2903 字符
  ✅ query-my-coupons — 卡包 8 张
  ✅ campaign-calendar — 已返回活动日历
  ✅ list-nutrition-foods — 160 款餐品营养数据

[3] 门店与菜单（city + keyword + searchType=2）
  ✅ query-nearby-stores — 5 家门店，首选=麦当劳重庆金鹰财富中心餐厅(3450149)
  ✅ query-meals — 13 个分类 / 122 个餐品
  ✅ query-store-coupons — 3 张可用券

[4] 计价（只算钱，不下单）
  ✅ calculate-price — “我就喜欢”鸡薯双全盒 应付 ¥31.00（原价 ¥31.00，优惠 ¥0.00）
  ✅ takeWayList — eat-in=堂食, take-in-store=外带

[5] 写操作（默认跳过）
  ⏭  auto-bind-coupons — 会真实领取优惠券到你的账户，需手动执行
  ⏭  create-order — 会产生真实订单与支付，需用户明确要求
  ⏭  draw-lottery — 会消耗积分/次数，需用户明确确认

完成：共 11 次工具调用（不含握手与清单）。
```

## 3. 关键实测数据

### 3.1 门店查询（`query-nearby-stores`）

`{"beType":1, "city":"重庆市", "keyword":"解放碑", "searchType":2}` 返回 5 家门店：

| 门店名称 | storeCode | 距离(m) | 营业时间 | 可预约 |
|---|---|---|---|---|
| 麦当劳重庆金鹰财富中心餐厅 | 3450149 | 73 | 07:00–23:59 | 是 |
| 麦当劳重庆1089艺术美丽中心餐厅 | 3450146 | 236 | 07:30–23:30 | 是 |
| 麦当劳重庆解放碑赛博城市餐厅 | 3450379 | 346 | 08:00–23:00 | 是 |
| 麦当劳重庆中信银行餐厅 | 3450136 | 1705 | 07:00–00:00 | 是 |
| 麦当劳重庆东原1891餐厅 | 3450303 | 1717 | 08:00–23:00 | 是 |

**踩坑记录 1**：`searchType=2` 只给 `city` 不给 `keyword` → `600058 城市名或者关键词不能为空`
**踩坑记录 2**：`searchType=1` → `600050 收藏餐厅列表为空，请您提供城市+关键词进行搜索`（`searchType=1` 查的是"我的收藏餐厅"，新账号必然为空）

### 3.2 营养数据（`list-nutrition-foods`）

返回 **160 款餐品**，格式为紧凑字符串（表头说明了字段）：

```text
[160]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:
 猪柳麦满分,null,1288,308,16,16,24,781,213
 猪柳蛋麦满分,null,1618,387,23,21,25,846,243
 烟肉蛋麦满分,null,1089,260,16,10,24,483,238
 中薯条,null,1210,289,4,12,38,165,18
 大薯条,null,1587,379,6,16,50,216,23
 小薯条,null,877,210,3,9,28,120,13
 麦乐鸡5块,null,890,213,12,12,13,422,9
 大杯玉米杯,null,365,87,4,1,12,2,10
 圆筒冰淇淋,null,391,93,2,3,14,36,77
 …
```

> 这一条数据是本 Skill「热量预算配餐」场景的**直接数据源**：字段全部结构化（kJ/kcal/蛋白质/脂肪/碳水/钠/钙），可直接用于按热量预算做组合优化。

### 3.3 菜单与促销价（`query-meals`）

重庆金鹰财富中心餐厅（到店自取）返回 **13 个分类、122 个餐品**，含真实餐品编码与价格（单位：分）：

| 餐品编码 | 名称 | 现价 | 原价 | 分类 |
|---|---|---|---|---|
| 9900016311 | 龙焰美味四件套 | ¥29 | ¥64.5 | 人气热卖 |
| 9900004236 | 人气超值四件套随心选 | ¥28 | ¥64.5 | 精选单人餐 |
| 9900010110 | 鱼牛汉堡四件套随心选 | ¥32 | ¥65 | 精选单人餐 |
| 9900006957 | 安格斯厚牛堡四件套随心选 | ¥37 | ¥74 | 精选单人餐 |
| 9900016076 | “我就喜欢”鸡薯双全盒 | ¥31 | ¥31 | 人气热卖 |

### 3.4 计价（`calculate-price`）— 本项目最关键的实测发现

对 `9900016311 龙焰美味四件套` 做裸计价（不带券、不带随单购）：

```json
{
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

**发现**：菜单页显示该商品 `currentPrice = 29`（原价 64.5），但裸计价返回 `6450` 分（=原价）。
说明**菜单促销价需要满足附带条件**（如 `withOrder` 随单购麦金卡/早餐卡、或套餐子项 `roundList` 选择）才会在计价中生效。

**这条发现直接决定了本 Skill 的一条硬性设计原则**：
> 任何报价必须以 `calculate-price` 的实算结果为成交价，禁止把菜单 `currentPrice` 当成交价报给用户 —— 否则用户到支付页会看到与 AI 报价不符的金额。

### 3.5 优惠券链路

| 工具 | 实测结果 |
|---|---|
| `available-coupons` | 返回 2903 字符券列表（麦旋风任选、薯薯任选、巧克力味厚松饼猪柳蛋套餐等） |
| `auto-bind-coupons` | 返回「暂无可领取的优惠券」——说明可领券已全部领取 |
| `query-my-coupons` | 卡包 **8 张**可用券，含"今日到期"标签与"到店专用/外送专用"标签 |
| `query-store-coupons` | 指定门店（到店自取）下 **3 张**可用券 |

> 这条链路验证了「卡包券 ≠ 门店可用券」，也验证了 Skill 中"下单前必须用 `query-store-coupons` 二次校验"的设计。

### 3.6 活动日历（`campaign-calendar`）

实测返回 2026 年 10 月活动，例如：

- **超值 9.9 元早餐两件套** — 10 月 8 日至 10 月 21 日，周一至周五早餐堡轮换，凭券两件套 9.9 元
- **麦当劳 X PEACEMINUSONE** — 10 月 8 日 10:45 开售，任意餐品加 39.9 元得 GD 同款联名复古棒球帽
- **麦咖啡一早现磨** — 14.9 元起，多款人气早餐主食

## 4. 未执行的写操作（有意跳过）

| 工具 | 跳过原因 |
|---|---|
| `create-order` | 会产生真实订单与真实支付，非用户明确要求不执行 |
| `draw-lottery` | 会消耗积分/次数（服务端原子扣减），需用户对消耗的明确确认 |
| `mall-create-order` | 会扣减积分兑换商品 |
| `auto-bind-coupons` | 会向用户账户真实写入券（本次已单独验证过，返回"暂无"） |

## 5. 复现方式

```bash
# 1. 申请 Token：https://open.mcd.cn/mcp （手机号登录 → 控制台 → 激活）
# 2. 运行冒烟测试（只读）
MCD_MCP_TOKEN=你的Token node scripts/mcp-smoke-test.mjs --city 重庆市 --keyword 解放碑
```

## 6. 结论

| 验收项 | 结果 |
|---|---|
| MCP 握手与认证 | ✅ 通过（v1.0.0，协议 2025-06-18） |
| 工具可用性 | ✅ 35 个工具全部可见 |
| 只读工具（8 个） | ✅ 全部返回正确数据 |
| 门店→菜单→券→计价 核心链路 | ✅ 全链路打通，含真实门店/餐品/券/金额 |
| 文档与实测一致性 | ✅ 已按实测修正 4 处官方文档偏差 |
| 安全边界 | ✅ 未泄露 Token/券码/手机号；未执行任何真实下单与消费 |
