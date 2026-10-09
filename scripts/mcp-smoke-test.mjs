#!/usr/bin/env node
/**
 * 麦麦点餐管家 — 麦当劳 MCP 冒烟测试脚本
 *
 * 用途：验证 MCP Token 是否有效、工具是否可调用、核心链路是否通。
 * 默认只执行「只读」调用，不会下单、不会抽奖、不会消耗积分。
 *
 * 用法：
 *   MCD_MCP_TOKEN=你的Token node scripts/mcp-smoke-test.mjs
 *   MCD_MCP_TOKEN=你的Token node scripts/mcp-smoke-test.mjs --city 重庆市 --keyword 解放碑
 *
 * 环境变量：
 *   MCD_MCP_TOKEN  必填，麦当劳 MCP Token（在 https://open.mcd.cn/mcp 申请）
 */

const ENDPOINT = process.env.MCD_MCP_ENDPOINT || "https://mcp.mcd.cn";
const TOKEN = process.env.MCD_MCP_TOKEN;

if (!TOKEN) {
  console.error("缺少环境变量 MCD_MCP_TOKEN。示例：MCD_MCP_TOKEN=xxx node scripts/mcp-smoke-test.mjs");
  process.exit(1);
}

// 解析命令行参数
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CITY = argOf("--city", "重庆市");
const KEYWORD = argOf("--keyword", "解放碑");

let reqId = 0;
let calls = 0;

/** 调用一个 MCP 工具，返回解析后的 JSON（若可解析）或原始文本 */
async function callTool(name, args = {}) {
  calls += 1;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++reqId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (res.status === 401) throw new Error("401 Token 无效或未提供，请检查 MCD_MCP_TOKEN");
  if (res.status === 429) throw new Error("429 触发限流（600 次/分钟），请稍后重试");

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    if (line) {
      try { json = JSON.parse(line.slice(5)); } catch { /* 保持 null */ }
    }
  }
  if (!json) return { raw: text };
  if (json.error) throw new Error(`MCP 错误：${JSON.stringify(json.error)}`);
  const payload = json.result?.content?.[0]?.text ?? "";
  return { raw: payload, original: extractOriginal(payload) };
}

/** 工具返回的文本里通常带 "## Original Response {json}"，抽出其中的 JSON */
function extractOriginal(text) {
  const i = text.indexOf("## Original Response");
  if (i >= 0) {
    const body = text.slice(i).replace(/^## Original Response\s*/, "");
    try {
      return JSON.parse(body);
    } catch { /* 继续用兜底方案 */ }
  }
  return extractFirstJson(text);
}

/**
 * 兜底：在自由文本中定位第一个完整 JSON 对象。
 * 部分工具（如 query-nearby-stores）的返回是先给字段说明、再直接拼 JSON、
 * 后面还可能追加展示要求文本，因此不能整段 JSON.parse。
 */
function extractFirstJson(text) {
  const marker = text.indexOf('{"success"');
  if (marker < 0) {
    const alt = text.indexOf("{");
    if (alt < 0) return null;
    return scanJson(text, alt);
  }
  return scanJson(text, marker);
}

/** 从 start 位置开始按花括号配平扫描，返回解析出的对象或 null */
function scanJson(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

const pass = (name, note = "") => console.log(`  ✅ ${name}${note ? " — " + note : ""}`);
const skip = (name, why = "") => console.log(`  ⏭  ${name}${why ? " — " + why : ""}`);
const fail = (name, err) => console.log(`  ❌ ${name} — ${err}`);

async function main() {
  console.log("麦当劳 MCP 冒烟测试");
  console.log(`端点：${ENDPOINT}`);
  console.log("（全部为只读调用，不会下单 / 不会抽奖 / 不消耗积分）\n");

  // 1. initialize
  console.log("[1] 握手与工具清单");
  const initRes = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: ++reqId, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcd-order-buddy-smoke", version: "1.0.0" } },
    }),
  });
  const initJson = await initRes.json();
  if (initJson.result?.serverInfo) {
    pass("initialize", `serverInfo=${initJson.result.serverInfo.name}@${initJson.result.serverInfo.version}, protocol=${initJson.result.protocolVersion}`);
  } else {
    fail("initialize", JSON.stringify(initJson));
    return;
  }

  const listRes = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++reqId, method: "tools/list", params: {} }),
  });
  const listJson = await listRes.json();
  const tools = listJson.result?.tools ?? [];
  pass("tools/list", `${tools.length} 个工具`);

  // 2. 只读工具逐个验证
  console.log("\n[2] 只读工具");
  let storeCode = null;
  let beCode = null;

  // 时间
  try {
    const r = await callTool("now-time-info");
    pass("now-time-info", r.original?.data?.formatted ?? "已返回时间");
  } catch (e) { fail("now-time-info", e.message); }

  // 积分
  try {
    const r = await callTool("query-my-account");
    const d = r.original?.data ?? {};
    pass("query-my-account", `可用积分=${d.availablePoint ?? "?"}, 本月将过期=${d.currentMouthExpirePoint ?? "?"}`);
  } catch (e) { fail("query-my-account", e.message); }

  // 可领券
  try {
    const r = await callTool("available-coupons");
    pass("available-coupons", r.raw ? `返回 ${r.raw.length} 字符` : "");
  } catch (e) { fail("available-coupons", e.message); }

  // 卡包
  try {
    const r = await callTool("query-my-coupons");
    const m = /共\s*(\d+)\s*张/.exec(r.raw || "");
    pass("query-my-coupons", m ? `卡包 ${m[1]} 张` : "已返回");
  } catch (e) { fail("query-my-coupons", e.message); }

  // 活动日历
  try {
    const r = await callTool("campaign-calendar");
    pass("campaign-calendar", r.raw ? "已返回活动日历" : "");
  } catch (e) { fail("campaign-calendar", e.message); }

  // 营养数据
  try {
    const r = await callTool("list-nutrition-foods");
    const m = /\[(\d+)\]\{/.exec(r.original?.data || "");
    pass("list-nutrition-foods", m ? `${m[1]} 款餐品营养数据` : "已返回");
  } catch (e) { fail("list-nutrition-foods", e.message); }

  // 门店（需要 city + keyword + searchType=2）
  console.log("\n[3] 门店与菜单（city + keyword + searchType=2）");
  try {
    const r = await callTool("query-nearby-stores", { beType: 1, city: CITY, keyword: KEYWORD, searchType: 2 });
    const list = r.original?.data ?? [];
    if (Array.isArray(list) && list.length) {
      storeCode = list[0].storeCode;
      beCode = list[0].beCode || null;
      pass("query-nearby-stores", `${list.length} 家门店，首选=${list[0].storeName}(${storeCode})`);
    } else {
      fail("query-nearby-stores", JSON.stringify(r.original ?? r.raw));
    }
  } catch (e) { fail("query-nearby-stores", e.message); }

  if (storeCode) {
    const S = { storeCode, orderType: 1, beType: 1 };
    try {
      const r = await callTool("query-meals", S);
      const cats = r.original?.data?.categories ?? [];
      const total = cats.reduce((n, c) => n + (c.meals?.length ?? 0), 0);
      pass("query-meals", `${cats.length} 个分类 / ${total} 个餐品`);
    } catch (e) { fail("query-meals", e.message); }

    try {
      const r = await callTool("query-store-coupons", S);
      pass("query-store-coupons", `${(r.original?.data ?? []).length} 张可用券`);
    } catch (e) { fail("query-store-coupons", e.message); }

    console.log("\n[4] 计价（只算钱，不下单）");
    try {
      const meals = await callTool("query-meals", S);
      const cats = meals.original?.data?.categories ?? [];
      const first = cats.flatMap((c) => c.meals ?? [])[0];
      if (first?.code) {
        const p = await callTool("calculate-price", { ...S, items: [{ productCode: first.code, quantity: 1 }] });
        const d = p.original?.data;
        if (d) {
          pass("calculate-price", `${meals.original.data.meals[first.code]?.name ?? first.code} 应付 ¥${(d.price / 100).toFixed(2)}（原价 ¥${(d.originalPrice / 100).toFixed(2)}，优惠 ¥${(d.discount / 100).toFixed(2)}）`);
          const ways = (d.takeWayList ?? []).map((w) => `${w.code}=${w.title}`).join(", ");
          if (ways) pass("takeWayList", ways);
        } else {
          fail("calculate-price", JSON.stringify(p.raw).slice(0, 200));
        }
      }
    } catch (e) { fail("calculate-price", e.message); }
  }

  // 5. 写操作：默认不执行
  console.log("\n[5] 写操作（默认跳过）");
  skip("auto-bind-coupons", "会真实领取优惠券到你的账户，需手动执行");
  skip("create-order", "会产生真实订单与支付，需用户明确要求");
  skip("draw-lottery", "会消耗积分/次数，需用户明确确认");

  console.log(`\n完成：共 ${calls} 次工具调用（不含握手与清单）。`);
}

main().catch((e) => {
  console.error("\n冒烟测试失败：", e.message);
  process.exit(1);
});
