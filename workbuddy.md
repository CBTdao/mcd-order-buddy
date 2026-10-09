# workbuddy.md — WorkBuddy 开发对话记录

> 本文件记录使用 WorkBuddy（腾讯）开发「麦麦点餐管家」的过程，用于核验 WorkBuddy 联动活动奖励条件。
> 开发时间：2026-10-09 · 开发工具：WorkBuddy 桌面版 · 模式：Agent 模式

## 开发背景

参赛者在腾讯 WorkBuddy 官方账号发布的《WorkBuddy 和麦当劳，欢迎你来开发大赛！》活动中了解到本次比赛，决定使用 WorkBuddy 作为唯一开发环境完成参赛作品。

## 开发对话记录（摘要）

### 第 1 轮：赛事调研

**用户**：
> 我要参加这个比赛，剩下的工作全交给你。（附活动海报截图： McDonald's China (M-China) 程序员创意开发大赛，2026-10-09 10:30 至 10-25 23:59，要求基于麦当劳 MCP 开发 Skill，GitHub 开源发布并按 Issue 模板报名）

**WorkBuddy**：
- 定位到官方赛事仓库 `M-China/mcd-developer-innovation-challenge`，完整提取了活动规则：报名条件（公开仓库、规定文件名、项目创建时间 2025-12-25 之后）、排名规则（按公开 Star 数，10-26 00:00 定榜）、WorkBuddy 专项奖励（前 100 名提交 workbuddy.md 得 3000 积分）。
- 同时抓取 `M-China/mcd-mcp-server` 官方接入指南：端点 `https://mcp.mcd.cn`、Streamable HTTP、Bearer Token 认证、600 次/分钟限流，以及 v1.0.9 文档中的工具列表。
- 下载官方 `CONTEST_DECLARATION.md` 原文（规则要求内容不可改动）。
- 检查本机开发环境（git 可用，git 身份与 GitHub CLI 待配置）。

### 第 2 轮：方案确认

**WorkBuddy** 提出三个候选方向后确定最终方案 —— **「麦麦点餐管家」Skill**，三大场景：
1. 热量预算配餐（营养数据 → 套餐组合 → 点评）
2. 省钱下单链路（一键领券 → 带券比价 → 确认下单，全程"先券后单"）
3. 活动/积分/商城提醒（活动日历、过期积分预警、积分商城与抽奖）

并确认仓库文件结构完全符合大赛要求（README.md / CONTEST_DECLARATION.md / MCP_INTEGRATION.md / 源代码 / workbuddy.md）。

**用户**：确认"还没申请 MCP Token，稍后申请；GitHub 用 Token 方式由 WorkBuddy 代推送"。

### 第 3 轮：Skill 编码

**WorkBuddy** 完成以下产出：

- `SKILL.md`：Skill 主体 —— 业务类型、7 条调用原则（先券后单、下单必确认、隐私最小化、429 退避等）、三大场景的完整执行流程、错误处理表、禁止事项。工具调用全部使用官方工具名，不绑定特定框架。
- `references/tools.md`：35 个实测工具的清单、入参要点、返回值注意点，含 orderType/beType 矩阵、价格单位为分、错误码表与官方文档偏差清单。
- `README.md`：项目介绍、Token 申请与客户端配置步骤、使用示例、目标用户表（上班族/减脂人群/学生党/麦门老粉）。
- `MCP_INTEGRATION.md`：Server 信息、Tools 分组、三条核心调用流程图（ASCII）、业务价值与错误处理。
- `examples/demo-prompts.md`：可复制的演示提示词（含"40 块预算 + 700 大卡一条龙"压轴演示）。
- `CONTEST_DECLARATION.md`：官方原文，一字未改。
- `workbuddy.md`：本文件。

### 第 4 轮：MCP 接入与实测（已完成）

**用户**：提供了麦当劳 MCP Token。

**WorkBuddy** 完成：

1. 将 `mcd-mcp` 写入 WorkBuddy 自定义连接器配置（`~/.workbuddy/mcp.json`），配置与大赛 README 提供的一致。
2. 通过 `initialize` 握手验证 Token：`serverInfo = mcd-mcp@1.0.0`，协议 `2025-06-18` ✅
3. 通过 `tools/list` 拉取工具清单：**实测 35 个工具**（官方文档表列 33 个）✅
4. 逐个真实调用只读工具，全部通过：
   - `now-time-info` → 2026-10-09 17:26:25
   - `query-my-account` → 可用积分 0、本月将过期 0
   - `available-coupons` → 返回券列表（麦旋风任选、薯薯任选等）
   - `query-my-coupons` → 卡包 8 张可用券
   - `campaign-calendar` → 2026 年 10 月活动（9.9 元早餐两件套、麦当劳 X PEACEMINUSONE 联名等）
   - `list-nutrition-foods` → **160 款餐品营养数据**
   - `query-nearby-stores` → 重庆解放碑周边 5 家门店
   - `query-meals` → 重庆金鹰财富中心餐厅 13 分类 / 122 餐品
   - `query-store-coupons` → 该门店 3 张可用券
   - `calculate-price` → 计价成功（"我就喜欢"鸡薯双全盒 应付 ¥31.00，takeWayList 返回堂食/外带）
5. 把验证过程固化成可复现脚本 `scripts/mcp-smoke-test.mjs`（只读、不下单、不抽奖），并输出实测报告 `docs/TEST_REPORT.md`。
6. **基于实测修正了 4 处官方文档偏差**，并把这些坑写进 SKILL.md 的"硬性参数规则"：
   - `query-partystore-date` → 实际 `query-party-store-date`
   - `query-partystore-session` → 实际 `query-party-store-session`
   - 官方漏列 `query-promotions`、`query-survey-coupon`
   - `delivery-query-address` → 实际 `delivery-query-addresses`
7. 发现并记录关键业务陷阱：**菜单促销价 ≠ 实付价**（菜单标 ¥29 的四件套裸计价为 ¥64.5），因此 Skill 规定"报价必须以 `calculate-price` 实算为准"。

**有意未执行的调用**（避免产生真实消费/账户变更）：`create-order`、`draw-lottery`、`mall-create-order`。

### 第 5 轮：发布与报名（待执行）

计划：GitHub 公开仓库推送 → 复核 `CONTEST_DECLARATION.md` 与官方原文逐字一致 → 在 `M-China/mcd-developer-innovation-challenge` 按 Issue 模板提交：

```
【参赛申请】
项目名称：麦麦点餐管家 (McOrder Buddy)
项目地址：{GitHub 仓库地址}
项目简介：基于麦当劳中国官方 MCP 的点餐助手 Skill：一句话完成领券比价下单，
按热量预算配餐，活动/积分/商城全提醒。使用 WorkBuddy 开发。
```

## 环境说明

- 操作系统：Windows（git bash）
- 运行环境：Node.js 22（用于运行冒烟测试脚本）
- 开发方式：全程在 WorkBuddy 对话中完成，无人工编码；共完成 1 次方案设计、1 轮文档撰写、1 轮代码修正 + 3 轮真实接口调试
- 安全声明：MCP Token 与 GitHub 凭证仅在本机使用，未写入任何将公开的文件
- 实测统计：11 次工具调用全部通过（不含握手与工具清单）
