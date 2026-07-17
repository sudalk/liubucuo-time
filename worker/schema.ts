import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

// ────────────────────────────────────────────────────────────────
// 用户与认证
// ────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  nickname: text("nickname"),
  avatarKey: text("avatar_key"), // R2 object key
  timezone: text("timezone"), // IANA 时区，如 Asia/Shanghai
  aiAuthorized: integer("ai_authorized", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString())
});

// 验证码：哈希存 KV，不落 DB。这里只留表结构以备扩展
export const emailAllowlist = sqliteTable("email_allowlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  allowed: integer("allowed", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString())
});

// ────────────────────────────────────────────────────────────────
// 核心业务数据
// ────────────────────────────────────────────────────────────────

// 历史计划事件去重集合（D-11：事件不是独立维护的标签）
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  firstPlanAt: text("first_plan_at"),
  lastPlanAt: text("last_plan_at"),
  planCount: integer("plan_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(new Date().toISOString())
}, (t) => ({
  userIdNormalizedName: uniqueIndex("events_user_normalized").on(t.userId, t.normalizedName)
}));

// 计划项（PlanItem）
export const planItems = sqliteTable("plan_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  eventName: text("event_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  plannedStartUtc: text("planned_start_utc"),
  plannedStartLocal: text("planned_start_local"),
  estimatedMinutes: integer("estimated_minutes"),
  sortOrder: integer("sort_order").notNull().default(0),
  note: text("note"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString())
});

// 实际时间记录（TimeRecord）
export const timeRecords = sqliteTable("time_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventName: text("event_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  startUtc: text("start_utc").notNull(),
  startLocal: text("start_local").notNull(),
  endUtc: text("end_utc"),
  endLocal: text("end_local"),
  durationMinutes: integer("duration_minutes"),
  statusProgress: integer("status_progress"), // 0-100 连续值
  source: text("source").notNull().default("manual"), // manual | import | fix
  note: text("note"),
  isMainSleep: integer("is_main_sleep", { mode: "boolean" }).notNull().default(false),
  revisedAt: text("revised_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString())
});

// 活动计时器（单计时器约束 D-07 + 业务规则）
// 每个用户同一时刻只能有一条 is_active=1 的记录
export const activeTimers = sqliteTable("active_timers", {
  userId: text("user_id").primaryKey(),
  eventName: text("event_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  startUtc: text("start_utc").notNull(),
  startLocal: text("start_local").notNull(),
  statusProgress: integer("status_progress").default(50),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString())
});

// ────────────────────────────────────────────────────────────────
// 复盘与 AI
// ────────────────────────────────────────────────────────────────

// 日感悟
export const reflections = sqliteTable("reflections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  content: text("content").notNull().default(""),
  keywords: text("keywords"), // JSON array
  source: text("source").notNull().default("user"), // user | ai
  updatedAt: text("updated_at").notNull().default(new Date().toISOString())
});

// 周期总结
export const summaries = sqliteTable("summaries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  period: text("period").notNull(), // 2026-W28 | 2026-07 等
  kind: text("kind").notNull(), // weekly | monthly
  summary: text("summary").notNull().default(""),
  keywords: text("keywords"), // JSON array
  aiVersion: text("ai_version"),
  userEdited: integer("user_edited", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString())
});

// 时间管理需求
export const needProfiles = sqliteTable("need_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  rawText: text("raw_text").notNull().default(""),
  structured: text("structured"), // JSON
  updatedAt: text("updated_at").notNull().default(new Date().toISOString())
});

// AI 输出存档（可清除）
export const aiOutputs = sqliteTable("ai_outputs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(), // daily-keywords | weekly-summary | period-analysis
  inputHash: text("input_hash").notNull(),
  output: text("output").notNull(), // JSON
  createdAt: text("created_at").notNull().default(new Date().toISOString())
});

// ────────────────────────────────────────────────────────────────
// 类型导出
// ────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Event = typeof events.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
export type TimeRecord = typeof timeRecords.$inferSelect;
export type ActiveTimer = typeof activeTimers.$inferSelect;
export type Reflection = typeof reflections.$inferSelect;
export type Summary = typeof summaries.$inferSelect;
export type NeedProfile = typeof needProfiles.$inferSelect;
export type AiOutput = typeof aiOutputs.$inferSelect;
