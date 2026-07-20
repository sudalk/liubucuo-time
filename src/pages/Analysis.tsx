import { useEffect, useMemo, useState } from "react";
import { useToastStore } from "../stores/toast";
import { useAuthStore } from "../stores/auth";
import { api, type PlanItem, type TimeRecord } from "../api/client";
import { dateKey, pad } from "../lib/time";
import { eventColor } from "../lib/eventColor";
import { BackToTopButton } from "../components/BackToTopButton";

type Period = "daily" | "weekly" | "monthly";

interface SavedSummary {
  id: string;
  summary: string;
  keywords: string | null;
  userEdited: boolean;
  period: string;
  kind: string;
}

function looksLikeHtml(text: string | null | undefined): boolean {
  if (!text) return false;
  const s = text.trim().slice(0, 300).toLowerCase();
  return s.includes("<html") || s.includes("<!doctype") || s.includes("<head") || s.includes("<meta charset");
}

function getRange(period: Period, offset: number): { start: string; end: string; label: string; periodKey: string } {
  const today = new Date();
  if (period === "daily") {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const key = dateKey(d);
    return { start: key, end: key, label: key, periodKey: key };
  }
  if (period === "monthly") {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const endDay = new Date(y, m + 1, 0).getDate();
    return {
      start: `${y}-${pad(m + 1)}-01`,
      end: `${y}-${pad(m + 1)}-${pad(endDay)}`,
      label: `${y}-${pad(m + 1)}`,
      periodKey: `${y}-${pad(m + 1)}`
    };
  }
  const base = new Date(today);
  base.setDate(today.getDate() + offset * 7);
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

function fetchRangeRecords(start: string, end: string): Promise<TimeRecord[]> {
  const days: string[] = [];
  const d = new Date(start);
  while (d.toISOString().slice(0, 10) <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return Promise.all(days.map((day) => api.get<{ records: TimeRecord[] }>(`/api/records?date=${day}`))).then(
    (all) => all.flatMap((r) => r.records)
  );
}

function fetchRangePlans(start: string, end: string): Promise<PlanItem[]> {
  const days: string[] = [];
  const d = new Date(start);
  while (d.toISOString().slice(0, 10) <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return Promise.all(days.map((day) => api.get<{ plans: PlanItem[] }>(`/api/plans?date=${day}`))).then(
    (all) => all.flatMap((r) => r.plans)
  );
}

function durationText(m: number): string {
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}时${mm}分` : `${h}时`;
}

export function Analysis() {
  const showToast = useToastStore((s) => s.show);
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<Period>("daily");
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reflection, setReflection] = useState("");
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [legendExpanded, setLegendExpanded] = useState(false);

  const range = getRange(period, offset);

  const load = async () => {
    setLoading(true);
    setAiText("");
    setLegendExpanded(false);
    try {
      const [recs, rangePlans] = await Promise.all([
        fetchRangeRecords(range.start, range.end),
        fetchRangePlans(range.start, range.end)
      ]);
      setRecords(recs);
      setPlans(rangePlans);

      if (period === "daily") {
        const { reflection } = await api.get<{ reflection: { content: string } | null }>(
          `/api/reflections?date=${range.end}`
        );
        setReflection(reflection?.content ?? "");
      } else {
        setReflection("");
      }

      const { summary } = await api.get<{ summary: SavedSummary | null }>(
        `/api/summaries?period=${range.periodKey}&kind=${period}`
      );
      const cleanSummary = summary && !looksLikeHtml(summary.summary) ? summary : null;
      setSaved(cleanSummary);
      setEditSummary(cleanSummary?.summary ?? "");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, offset]);

  // 合并重复事件 + 进行中的记录用 now 算时长
  const byEvent = useMemo(() => {
    const m = new Map<string, number>();
    const now = Date.now();
    records.forEach((r) => {
      const mins = r.durationMinutes ?? Math.max(1, Math.round((now - new Date(r.startUtc).getTime()) / 60000));
      m.set(r.eventName, (m.get(r.eventName) ?? 0) + mins);
    });
    return Array.from(m.entries())
      .map(([event, minutes]) => ({ event, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [records]);

  const totalMinutes = byEvent.reduce((s, e) => s + e.minutes, 0);
  const plannedByEvent = useMemo(() => {
    const m = new Map<string, number>();
    plans.forEach((plan) => {
      const mins = plan.estimatedMinutes ?? 0;
      m.set(plan.eventName, (m.get(plan.eventName) ?? 0) + mins);
    });
    return m;
  }, [plans]);
  const eventPlanRows = useMemo(() => {
    return byEvent
      .map(({ event, minutes }) => {
        const planned = plannedByEvent.get(event) ?? 0;
        return { event, actual: minutes, planned };
      })
      .sort((a, b) => b.actual - a.actual || b.planned - a.planned);
  }, [byEvent, plannedByEvent]);
  const visibleEventRows = legendExpanded ? eventPlanRows : eventPlanRows.slice(0, 5);

  const statusAvg = useMemo(() => {
    const weighted = records.filter((r) => r.statusProgress != null && r.durationMinutes);
    if (weighted.length === 0) return null;
    const tw = weighted.reduce((s, r) => s + (r.statusProgress ?? 0) * (r.durationMinutes ?? 0), 0);
    const w = weighted.reduce((s, r) => s + (r.durationMinutes ?? 0), 0);
    return w ? Math.round(tw / w) : null;
  }, [records]);

  const generate = async () => {
    if (user?.aiAuthorized === false) {
      showToast("请先在设置页开启 AI 数据授权");
      return;
    }
    setAiLoading(true);
    setAiText("");
    try {
      const fullText = await api.postText("/api/ai/analyze/stream", { period, date: range.end });
      if (looksLikeHtml(fullText)) {
        throw new Error("AI 返回了页面 HTML，已拦截，请重新登录后再试");
      }
      // 打字动画模拟流式
      let i = 0;
      const chunkSize = Math.max(1, Math.floor(fullText.length / 80));
      const animate = () => {
        if (i >= fullText.length) {
          setAiText(fullText);
          setEditSummary(fullText);
          // 保存到 DB
          void api.put("/api/summaries", {
            period: range.periodKey,
            kind: period,
            summary: fullText,
            keywords: saved?.keywords ? JSON.parse(saved.keywords) : []
          }).then(() => api.get<{ summary: SavedSummary | null }>(
            `/api/summaries?period=${range.periodKey}&kind=${period}`
          )).then(({ summary }) => setSaved(summary && !looksLikeHtml(summary.summary) ? summary : null)).catch(() => {});
          setAiLoading(false);
          return;
        }
        i = Math.min(fullText.length, i + chunkSize);
        setAiText(fullText.slice(0, i));
        requestAnimationFrame(animate);
      };
      animate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "AI 调用失败");
      setAiLoading(false);
    }
  };

  const saveSummary = async () => {
    try {
      await api.put("/api/summaries", {
        period: range.periodKey,
        kind: period,
        summary: editSummary,
        keywords: saved?.keywords ? JSON.parse(saved.keywords) : []
      });
      showToast("已保存");
      const { summary } = await api.get<{ summary: SavedSummary | null }>(
        `/api/summaries?period=${range.periodKey}&kind=${period}`
      );
      setSaved(summary && !looksLikeHtml(summary.summary) ? summary : null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    }
  };

  const saveReflection = async () => {
    if (period !== "daily") return;
    try {
      await api.put("/api/reflections", { date: range.end, content: reflection });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    }
  };

  const isCurrent = offset === 0;
  const displayKeywords: string[] = saved?.keywords ? JSON.parse(saved.keywords) : [];
  const displaySummary = aiText || editSummary;
  const donutBackground = totalMinutes > 0
    ? `conic-gradient(${byEvent.map((event, index) => {
        const color = eventColor(event.event);
        const start = (byEvent.slice(0, index).reduce((sum, item) => sum + item.minutes, 0) / totalMinutes) * 360;
        const end = start + (event.minutes / totalMinutes) * 360;
        const midpoint = start + (end - start) * 0.52;
        return `color-mix(in oklch, ${color} 70%, var(--surface)) ${start}deg, ${color} ${midpoint}deg, color-mix(in oklch, ${color} 82%, var(--ink)) ${end}deg`;
      }).join(", ")})`
    : "conic-gradient(color-mix(in oklch, var(--v1-line) 75%, transparent) 0deg 360deg)";

  return (
    <section className="sketch-screen analysis-screen" aria-label="分析页">
      <div className="sketch-content">
        <div className="page-sticky-control analysis-sticky-control">
          <div className="toolbar analysis-toolbar">
            <div className="segmented analysis-period-switch">
              <button className={period === "daily" ? "is-active" : ""} onClick={() => { setPeriod("daily"); setOffset(0); }}>日</button>
              <button className={period === "weekly" ? "is-active" : ""} onClick={() => { setPeriod("weekly"); setOffset(0); }}>周</button>
              <button className={period === "monthly" ? "is-active" : ""} onClick={() => { setPeriod("monthly"); setOffset(0); }}>月</button>
            </div>
            <div className="analysis-actions compact">
              <button className="btn btn-soft" onClick={() => setOffset((n) => n - 1)}>‹ 上一{period === "daily" ? "日" : period === "weekly" ? "周" : "月"}</button>
              <button className="btn btn-soft" onClick={() => setOffset((n) => n + 1)} disabled={isCurrent}>下一{period === "daily" ? "日" : period === "weekly" ? "周" : "月"} ›</button>
            </div>
          </div>
          <div className="analysis-range-label">
            {range.label}
          </div>
        </div>

        {loading ? (
          <div className="empty"><span className="subtle">加载中…</span></div>
        ) : records.length === 0 && period !== "daily" ? (
          <div className="empty"><strong>区间内还没有记录</strong>去主页开始计时吧。</div>
        ) : (
          <>
            {/* 概况：饼图居中 + 渐变 */}
            <section className="analysis-overview">
              <div className="module-heading">
                <div>
                  <span className="module-kicker">时间分布</span>
                  <h2>概况</h2>
                </div>
                {records.length > 0 && <span className="module-stat">{eventPlanRows.length} 类事件</span>}
              </div>
              {records.length === 0 ? (
                <p className="subtle">这一天还没有记录。</p>
              ) : (
                <div className="chart-center-wrap">
                  <div className="donut-gradient" style={{ background: donutBackground }}>
                    <div className="donut-center-gradient">
                      <strong>{durationText(totalMinutes)}</strong>
                      <small>已记录</small>
                    </div>
                  </div>
                  <div className="legend analysis-event-list">
                    <div className="analysis-event-head" aria-hidden="true">
                      <span>事件</span>
                      <span>计划</span>
                      <span>实际</span>
                    </div>
                    {visibleEventRows.map((e) => (
                      <div key={e.event} className="legend-row analysis-event-row analysis-plan-actual-row">
                        <i style={{ background: eventColor(e.event) }} />
                        <span>{e.event}</span>
                        <span>{e.planned > 0 ? durationText(e.planned) : "无"}</span>
                        <span>{e.actual > 0 ? durationText(e.actual) : "无"}</span>
                      </div>
                    ))}
                    {eventPlanRows.length > 5 && (
                      <button type="button" className="legend-expand-button" onClick={() => setLegendExpanded((value) => !value)}>
                        {legendExpanded ? "收起" : `展开全部 ${eventPlanRows.length} 项`}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {statusAvg != null && records.length > 0 && (
                <p className="overview-note">状态加权平均 <strong>{statusAvg}</strong> / 100</p>
              )}
            </section>

            {/* 日感悟（仅日维度，无背景色） */}
            {period === "daily" && (
              <section className="reflection-panel">
                <div className="module-heading">
                  <div>
                    <span className="module-kicker">自由书写</span>
                    <h2>今日感悟</h2>
                  </div>
                  <span className="module-stat">失焦自动保存</span>
                </div>
                <textarea
                  className="plain-textarea"
                  placeholder="自由记录今天的感受、观察或调整…"
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  onFocus={(e) => setTimeout(() => e.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" }), 80)}
                  onBlur={saveReflection}
                />
              </section>
            )}

            {/* AI 流式分析 */}
            <section className="summary-panel">
              <div className="module-heading">
                <div>
                  <span className="module-kicker">AI 回看</span>
                  <h2>{period === "daily" ? "日复盘" : period === "weekly" ? "一周总结" : "月度分析"}</h2>
                </div>
                <button
                  className="btn btn-tint"
                  onClick={generate}
                  disabled={aiLoading || user?.aiAuthorized === false}
                >
                  {aiLoading ? "生成中…" : saved ? "重新生成" : "生成"}
                </button>
              </div>

              {displayKeywords.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <small className="subtle">关键词</small>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                    {displayKeywords.map((k, i) => (
                      <span key={`${k}-${i}`} className="event-cell">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              {(aiText || editSummary || period !== "daily") && (
                <div>
                  <textarea
                    className="plain-textarea ai-output"
                    value={aiLoading ? aiText : editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    onFocus={(e) => setTimeout(() => e.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" }), 80)}
                    readOnly={aiLoading}
                    placeholder="点击生成开始 AI 分析，内容会逐字流式出现…"
                    style={{ minHeight: 160 }}
                  />
                  {!aiLoading && editSummary && (
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button className="btn btn-soft" onClick={saveSummary}>保存</button>
                      {saved?.userEdited && <small className="subtle" style={{ lineHeight: "36px" }}>· 已编辑</small>}
                    </div>
                  )}
                </div>
              )}

              {aiLoading && <div className="stream-cursor">▋</div>}

              {!displaySummary && !aiLoading && (
                <p className="subtle">点击右上角「生成」开始 AI 分析。</p>
              )}

              {user?.aiAuthorized === false && (
                <p className="subtle" style={{ marginTop: 10, color: "oklch(48% 0.16 25)" }}>
                  请在设置页开启 AI 数据授权后使用。
                </p>
              )}
            </section>
          </>
        )}
      </div>
      <BackToTopButton />
    </section>
  );
}
