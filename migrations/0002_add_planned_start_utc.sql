-- 修复 0001_init.sql 遗漏的 planned_start_utc 列
-- Drizzle schema 的 planItems 表有 plannedStartUtc 字段，但 0001_init.sql 漏建了
ALTER TABLE plan_items ADD COLUMN planned_start_utc TEXT;
