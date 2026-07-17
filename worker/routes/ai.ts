import { Hono } from "hono";
import type { Context } from "hono";
import type { HonoEnv } from "../types";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../lib/db";
import { users, reflections, summaries, timeRecords } from "../schema";
import { llmChatJSON } from "../lib/llm";
import { jsonParseSafe, dateKey, pad } from "../lib/utils";

const ai = new Hono<HonoEnv>();

// 用户授权检查
async function requireAiAuthorized(c: Context<HonoEnv>) {
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.aiAuthorized) {
    return c.json({ error: "ai not authorized" }, 403);
  }
  return null;
}

// ────────────────────────────────────────────────────────────────
// 时间区间工具
// ────────────────────────────────────────────────────────────────

function getRange(period: "daily" | "weekly" | "monthly", date?: string): { start: string; end: string; label: string; periodKey: string } {
  const base = date ? new Date(date) : new Date();
  const baseDate = dateKey(base);

  if (period === "daily") {
    return { start: baseDate, end: baseDate, label: baseDate, periodKey: baseDate };
  }

  if (period === "monthly") {
    const y = base.getFullYear();
    const m = base.getMonth();
    const start = `${y}-${pad(m + 1)}-01`;
    const endDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${pad(m + 1)}-${pad(endDay)}`;
    return { start, end, label: `${y}-${pad(m + 1)}`, periodKey: `${y}-${pad(m + 1)}` };
  }

  // weekly：周一到周日
  const day = base.getDay() || 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const start = dateKey(monday);
  const end = dateKey(sunday);
  const yearStart = new Date(monday.getFullYear(), 0, 1);
  const week = Math.ceil(((monday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { start, end, label: `${start} ~ ${end}`, periodKey: `${monday.getFullYear()}-W${pad(week)}` };
}

function aggregateByEvent(records: TimeRecordAgg[]): Array<{ event: string; minutes: number; status: number[] }> {
  const m = new Map<string, { minutes: number; status: number[] }>();
  for (const r of records) {
    const entry = m.get(r.eventName) ?? { minutes: 0, status: [] };
    entry.minutes += r.durationMinutes ?? 0;
    if (r.statusProgress != null) entry.status.push(r.statusProgress);
    m.set(r.eventName, entry);
  }
  return Array.from(m.entries()).map(([event, v]) => ({ event, minutes: v.minutes, status: v.status }));
}

type TimeRecordAgg = {
  eventName: string;
  durationMinutes: number | null;
  statusProgress: number | null;
  startLocal: string | null;
};

// ────────────────────────────────────────────────────────────────
// 统一分析端点
// ────────────────────────────────────────────────────────────────

ai.post("/analyze", async (c) => {
  const unauthorized = await requireAiAuthorized(c);
  if (unauthorized) return unauthorized;

  const body = await c.req
    .json<{ period: "daily" | "weekly" | "monthly"; date?: string }>()
    .catch(() => ({ period: "daily" as const, date: undefined }));

  const period = body.period ?? "daily";
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return c.json({ error: "invalid period" }, 400);
  }

  const userId = c.get("userId")!;
  const range = getRange(period, body.date);
  const db = getDb(c.env);

  // 拉区间内的记录
  const records = await db.query.timeRecords.findMany({
    where: and(
      eq(timeRecords.userId, userId),
      gte(timeRecords.startLocal, `${range.start}T00:00:00`),
      lte(timeRecords.startLocal, `${range.end}T23:59:59`)
    )
  });

  // 拉区间内的感悟
  const reflRows = await db.query.reflections.findMany({
    where: and(
      eq(reflections.userId, userId),
      gte(reflections.date, range.start),
      lte(reflections.date, range.end)
    )
  });

  // 月维度：拉当月所有周总结作为上下文
  let weeklySummaries: Array<{ period: string; summary: string }> = [];
  if (period === "monthly") {
    const all = await db.query.summaries.findMany({
      where: and(eq(summaries.userId, userId), eq(summaries.kind, "weekly"))
    });
    weeklySummaries = all
      .filter((s) => s.period.startsWith(range.periodKey.slice(0, 5) + "W"))
      .map((s) => ({ period: s.period, summary: s.summary }));
  }

  const byEvent = aggregateByEvent(records as TimeRecordAgg[]);
  const totalMinutes = byEvent.reduce((s, e) => s + e.minutes, 0);
  const reflText = reflRows.map((r) => `${r.date}: ${r.content}${r.keywords ? ` [${jsonParseSafe(r.keywords, []).join(", ")}]` : ""}`).join("\n");

  // 数据不足的兜底
  if (totalMinutes === 0 && reflText.length === 0) {
    return c.json({
      period,
      periodKey: range.periodKey,
      keywords: [],
      summary: `${range.label} 暂无记录数据，无法生成分析。请先在主页记录活动或写感悟。`,
      observations: [],
      actions: [],
      changes: [],
      causes: []
    });
  }

  const dataContext = {
    range: range.label,
    totalMinutes,
    byEvent: byEvent.map((e) => ({
      event: e.event,
      minutes: e.minutes,
      statusAvg: e.status.length ? Math.round(e.status.reduce((s, x) => s + x, 0) / e.status.length) : null
    })),
    reflections: reflText || "（空）",
    weeklySummaries: period === "monthly" ? weeklySummaries : undefined
  };

  let system: string;
  let schema: Record<string, string>;
  let userPrompt: string;

  if (period === "daily") {
    system =
      "你是柳不匆的复盘助手。基于用户当日时间分布、状态和感悟，提炼 1-5 个关键词。只输出客观事实，不做心理或医疗诊断。数据不足时明确说明。";
    schema = { keywords: "string[]  // 1-5 个关键词" };
    userPrompt = `当日数据：\n${JSON.stringify(dataContext, null, 2)}\n\n请输出关键词。`;
  } else if (period === "weekly") {
    system =
      "你是柳不匆的周复盘助手。基于一周记录、日关键词和感悟，输出事实摘要、观察和最多 3 条行动建议。标明统计范围，区分事实与推断，不做医疗诊断。数据不足时明确说明，不强行下结论。";
    schema = {
      summary: "string  // 事实摘要",
      observations: "string[]  // 观察",
      actions: "string[]  // 最多 3 条行动建议"
    };
    userPrompt = `本周数据：\n${JSON.stringify(dataContext, null, 2)}\n\n请输出周总结。`;
  } else {
    // monthly
    system =
      "你是柳不匆的月度复盘助手。基于当月记录聚合、周总结和感悟，输出月度摘要、主要变化（对比上周或上周对比）、可能原因和最多 3 条行动建议。区分事实统计与模型推断。数据不足时明确说明，不强行下结论。";
    schema = {
      keywords: "string[]  // 月关键词，由当月日关键词聚合",
      summary: "string  // 月度摘要",
      changes: "string[]  // 主要变化",
      causes: "string[]  // 可能原因",
      actions: "string[]  // 最多 3 条行动建议"
    };
    userPrompt = `本月数据：\n${JSON.stringify(dataContext, null, 2)}\n\n请输出月度分析。`;
  }

  const result = await llmChatJSON<Record<string, string[] | string>>(
    { system, messages: [{ role: "user", content: userPrompt }], schemaDescription: JSON.stringify(schema) },
    c.env
  ).catch((err) => {
    console.error(`[ai] ${period} analyze failed:`, err);
    return null;
  });

  if (!result) {
    return c.json({ error: "ai call failed" }, 500);
  }

  const output = {
    period,
    periodKey: range.periodKey,
    keywords: (result.keywords as string[]) ?? [],
    summary: (result.summary as string) ?? "",
    observations: (result.observations as string[]) ?? [],
    actions: (result.actions as string[]) ?? [],
    changes: (result.changes as string[]) ?? [],
    causes: (result.causes as string[]) ?? []
  };

  // 落库（不覆盖用户编辑稿）
  const existing = await db.query.summaries.findFirst({
    where: and(eq(summaries.userId, userId), eq(summaries.period, range.periodKey), eq(summaries.kind, period))
  });
  const now = new Date().toISOString();
  if (existing) {
    // 只在用户未编辑过的情况下覆盖
    if (!existing.userEdited) {
      await db
        .update(summaries)
        .set({
          summary: output.summary,
          keywords: output.keywords.length ? JSON.stringify(output.keywords) : null,
          aiVersion: now,
          updatedAt: now
        })
        .where(eq(summaries.id, existing.id));
    }
    // 用户编辑过的不覆盖，但仍然返回 AI 新生成的结果给前端预览
  } else {
    await db.insert(summaries).values({
      id: `sum_${now.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      period: range.periodKey,
      kind: period,
      summary: output.summary,
      keywords: output.keywords.length ? JSON.stringify(output.keywords) : null,
      aiVersion: now,
      userEdited: false,
      createdAt: now,
      updatedAt: now
    });
  }

  return c.json(output);
});

// ────────────────────────────────────────────────────────────────
// 旧接口保留兼容：daily-keywords / weekly-summary / period-analysis / need-summary
// ────────────────────────────────────────────────────────────────

// 日关键词（旧，保留给前端兼容）
ai.post("/daily-keywords", async (c) => {
  const unauthorized = await requireAiAuthorized(c);
  if (unauthorized) return unauthorized;
  const body = await c.req.json<{ date?: string }>().catch(() => ({ date: undefined }));
  const range = getRange("daily", body.date);
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const records = await db.query.timeRecords.findMany({
    where: and(
      eq(timeRecords.userId, userId),
      gte(timeRecords.startLocal, `${range.start}T00:00:00`),
      lte(timeRecords.startLocal, `${range.end}T23:59:59`)
    )
  });
  const reflection = await db.query.reflections.findFirst({
    where: and(eq(reflections.userId, userId), eq(reflections.date, range.start))
  });
  const byEvent = aggregateByEvent(records as TimeRecordAgg[]);
  const distribution = byEvent.map((e) => ({ event: e.event, minutes: e.minutes }));
  const result = await llmChatJSON<{ keywords: string[] }>(
    {
      system: "你是柳不匆的复盘助手。基于用户当日时间分布、状态和感悟，提炼 1-5 个关键词。只输出客观事实，不做心理或医疗诊断。",
      messages: [
        {
          role: "user",
          content: `当日时间分布：\n${JSON.stringify(distribution)}\n\n当日感悟：\n${reflection?.content || "（空）"}\n\n请输出关键词。`
        }
      ],
      schemaDescription: JSON.stringify({ keywords: "string[]  // 1-5 个关键词" })
    },
    c.env
  ).catch(() => ({ keywords: [] }));
  return c.json(result);
});

// 周总结（旧）
ai.post("/weekly-summary", async (c) => {
  const unauthorized = await requireAiAuthorized(c);
  if (unauthorized) return unauthorized;
  const body = await c.req.json<{ weekStart?: string; weekEnd?: string }>().catch(
    () => ({ weekStart: undefined, weekEnd: undefined })
  );
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const records = await db.query.timeRecords.findMany({ where: eq(timeRecords.userId, userId) });
  const reflectionsRows = await db.query.reflections.findMany({ where: eq(reflections.userId, userId) });
  const weekStart = body.weekStart ?? dateKey();
  const weekEnd = body.weekEnd ?? weekStart;
  const weekRecords = records.filter(
    (r) => r.startLocal && r.startLocal >= weekStart && r.startLocal <= `${weekEnd}T23:59:59`
  );
  const weekReflections = reflectionsRows.filter((r) => r.date >= weekStart && r.date <= weekEnd);
  const result = await llmChatJSON(
    {
      system:
        "你是柳不匆的复盘助手。基于一周记录、关键词和感悟，输出事实摘要、观察和最多 3 条行动建议。标明统计范围，区分事实与推断，不做医疗诊断。",
      messages: [
        {
          role: "user",
          content: `本周记录：\n${JSON.stringify(weekRecords.map((r) => ({ event: r.eventName, minutes: r.durationMinutes, status: r.statusProgress })))}\n\n本周感悟：\n${JSON.stringify(weekReflections.map((r) => ({ date: r.date, content: r.content, keywords: jsonParseSafe(r.keywords, []) })))}\n\n请输出周总结。`
        }
      ],
      schemaDescription: JSON.stringify({ summary: "string", observations: "string[]", actions: "string[]" })
    },
    c.env
  ).catch(() => ({ summary: "", observations: [], actions: [] }));
  return c.json(result);
});

// 周期分析（旧）
ai.post("/period-analysis", async (c) => {
  const unauthorized = await requireAiAuthorized(c);
  if (unauthorized) return unauthorized;
  const userId = c.get("userId")!;
  const body = await c.req.json<{
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
  }>().catch(() => ({
    currentStart: "",
    currentEnd: "",
    previousStart: "",
    previousEnd: ""
  }));
  const db = getDb(c.env);
  const records = await db.query.timeRecords.findMany({ where: eq(timeRecords.userId, userId) });
  const aggregate = (start: string, end: string) =>
    records.filter((r) => r.startLocal && r.startLocal >= start && r.startLocal <= `${end}T23:59:59`);
  const current = aggregate(body.currentStart, body.currentEnd);
  const previous = aggregate(body.previousStart, body.previousEnd);
  const byEvent = (arr: typeof current) => {
    const m = new Map<string, number>();
    for (const r of arr) m.set(r.eventName, (m.get(r.eventName) ?? 0) + (r.durationMinutes ?? 0));
    return Array.from(m.entries()).map(([event, minutes]) => ({ event, minutes }));
  };
  const result = await llmChatJSON(
    {
      system:
        "你是柳不匆的复盘助手。对比当前周期和对比周期，输出主要变化、可能原因和最多 3 条行动建议。数据不足时明确说明，不强行下结论。",
      messages: [
        {
          role: "user",
          content: `当前周期：\n${JSON.stringify(byEvent(current))}\n\n对比周期：\n${JSON.stringify(byEvent(previous))}\n\n请输出周期分析。`
        }
      ],
      schemaDescription: JSON.stringify({ changes: "string[]", causes: "string[]", actions: "string[]" })
    },
    c.env
  ).catch(() => ({ changes: [], causes: [], actions: [] }));
  return c.json(result);
});

// 时间管理需求摘要
ai.post("/need-summary", async (c) => {
  const unauthorized = await requireAiAuthorized(c);
  if (unauthorized) return unauthorized;
  const body = await c.req.json<{ rawText: string }>().catch(() => ({ rawText: "" }));
  if (!body.rawText?.trim()) return c.json({ error: "rawText is required" }, 400);
  const result = await llmChatJSON(
    {
      system:
        "你是柳不匆的时间管理助手。把用户的自由描述整理为结构化目标。只输出客观、可执行的内容，不做评价或诊断。",
      messages: [{ role: "user", content: `用户描述：\n${body.rawText}\n\n请输出结构化结果。` }],
      schemaDescription: JSON.stringify({
        goals: "string[]",
        scenarios: "string[]",
        constraints: "string[]",
        improvements: "string[]"
      })
    },
    c.env
  ).catch(() => ({ goals: [], scenarios: [], constraints: [], improvements: [] }));
  return c.json(result);
});

// ────────────────────────────────────────────────────────────────
// 流式分析端点：返回完整文本，前端做打字动画模拟流式效果
// ────────────────────────────────────────────────────────────────

ai.post("/analyze/stream", async (c) => {
  const unauthorized = await requireAiAuthorized(c);
  if (unauthorized) return unauthorized;

  const body = await c.req
    .json<{ period: "daily" | "weekly" | "monthly"; date?: string }>()
    .catch(() => ({ period: "daily" as const, date: undefined }));

  const period = body.period ?? "daily";
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return c.json({ error: "invalid period" }, 400);
  }

  const userId = c.get("userId")!;
  const range = getRange(period, body.date);
  const db = getDb(c.env);

  const records = await db.query.timeRecords.findMany({
    where: and(
      eq(timeRecords.userId, userId),
      gte(timeRecords.startLocal, `${range.start}T00:00:00`),
      lte(timeRecords.startLocal, `${range.end}T23:59:59`)
    )
  });

  const reflRows = await db.query.reflections.findMany({
    where: and(
      eq(reflections.userId, userId),
      gte(reflections.date, range.start),
      lte(reflections.date, range.end)
    )
  });

  const byEvent = aggregateByEvent(records as TimeRecordAgg[]);
  const totalMinutes = byEvent.reduce((s, e) => s + e.minutes, 0);
  const reflText = reflRows.map((r) => `${r.date}: ${r.content}`).join("\n");

  if (totalMinutes === 0 && reflText.length === 0) {
    return c.text(`${range.label} 暂无记录数据，无法生成分析。请先在主页记录活动或写感悟。`);
  }

  const dataContext = {
    range: range.label,
    totalMinutes,
    byEvent: byEvent.map((e) => ({
      event: e.event,
      minutes: e.minutes,
      statusAvg: e.status.length ? Math.round(e.status.reduce((s, x) => s + x, 0) / e.status.length) : null
    })),
    reflections: reflText || "（空）"
  };

  const systemByPeriod: Record<typeof period, string> = {
    daily: "你是柳不匆的复盘助手。基于用户当日数据，用自然语言输出日复盘，包含事实摘要、观察和 1-2 条行动建议。区分事实与推断。数据不足时说明。用中文，分段输出，用 markdown 标题和列表组织内容。",
    weekly: "你是柳不匆的周复盘助手。基于一周记录和感悟，输出周总结，包含事实摘要、观察和最多 3 条行动建议。标明统计范围，区分事实与推断。用中文，分段输出，用 markdown 标题和列表组织内容。",
    monthly: "你是柳不匆的月度复盘助手。基于当月记录聚合和感悟，输出月度分析，包含摘要、主要变化、可能原因和最多 3 条行动建议。区分事实与推断。用中文，分段输出，用 markdown 标题和列表组织内容。"
  };

  const result = await llmChatJSON<{ summary?: string; content?: string }>(
    {
      system: systemByPeriod[period],
      messages: [
        {
          role: "user",
          content: `${period === "daily" ? "当日" : period === "weekly" ? "本周" : "本月"}数据：\n${JSON.stringify(dataContext, null, 2)}\n\n请输出${period === "daily" ? "日复盘" : period === "weekly" ? "周总结" : "月分析"}。只返回纯文本，不要 JSON。`
        }
      ],
      schemaDescription: JSON.stringify({ content: "string  // 复盘文本" })
    },
    c.env
  ).catch((err) => {
    console.error(`[ai] ${period} stream failed:`, err);
    return null;
  });

  if (!result) {
    return c.json({ error: "ai call failed" }, 500);
  }

  const text = result.content ?? result.summary ?? "";
  return c.text(text);
});

export default ai;
