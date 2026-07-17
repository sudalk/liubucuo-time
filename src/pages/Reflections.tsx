import { useEffect, useState } from "react";
import { useToastStore } from "../stores/toast";
import { useAuthStore } from "../stores/auth";
import { useRouteStore } from "../stores/route";
import { api } from "../api/client";
import { dateKey, pad } from "../lib/time";

interface ReflectionDay {
  date: string;
  content: string;
  keywords: string[] | null;
}

function getWeekRange(weekOffset: number): { start: string; end: string; label: string } {
  const today = new Date();
  const day = today.getDay() || 7; // 周日=0 → 7
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + 1 + weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const start = dateKey(monday);
  const end = dateKey(sunday);
  const label = `${start} ~ ${end}`;
  return { start, end, label };
}

function getWeekPeriod(start: string): string {
  const [y, m, d] = start.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${pad(week)}`;
}

export function Reflections() {
  const navigate = useRouteStore((s) => s.navigate);
  const showToast = useToastStore((s) => s.show);
  const user = useAuthStore((s) => s.user);
  const [weekOffset, setWeekOffset] = useState(0);
  const [reflections, setReflections] = useState<ReflectionDay[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [summaryKeywords, setSummaryKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const week = getWeekRange(weekOffset);

  const load = async () => {
    setLoading(true);
    try {
      const { reflections } = await api.get<{ reflections: ReflectionDay[] }>(
        `/api/reflections/range?start=${week.start}&end=${week.end}`
      );
      setReflections(reflections);
      const period = getWeekPeriod(week.start);
      const { summary } = await api.get<{ summary: { summary: string; keywords: string | null } | null }>(
        `/api/summaries?period=${period}&kind=weekly`
      );
      setSummary(summary?.summary ?? "");
      setSummaryKeywords(summary?.keywords ? JSON.parse(summary.keywords) : []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const generateWeeklySummary = async () => {
    if (user?.aiAuthorized === false) {
      showToast("请先在设置页开启 AI 数据授权");
      return;
    }
    setAiLoading(true);
    try {
      const result = await api.post<{ summary: string; observations: string[]; actions: string[] }>(
        "/api/ai/weekly-summary",
        { weekStart: week.start, weekEnd: week.end }
      );
      const period = getWeekPeriod(week.start);
      await api.put("/api/summaries", {
        period,
        kind: "weekly",
        summary: result.summary,
        keywords: summaryKeywords
      });
      setSummary(result.summary);
      showToast("周总结已生成");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "AI 调用失败");
    } finally {
      setAiLoading(false);
    }
  };

  const saveSummary = async () => {
    const period = getWeekPeriod(week.start);
    try {
      await api.put("/api/summaries", { period, kind: "weekly", summary, keywords: summaryKeywords });
      showToast("周总结已保存");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    }
  };

  return (
    <section className="sketch-screen" aria-label="感悟统计页">
      <div className="sketch-content">
        <div className="page-head">
          <div>
            <p className="eyebrow">感悟统计</p>
            <h1>周关键词与总结</h1>
            <p className="subtle">按周展示每日感悟、关键词和 AI 周总结。可编辑后保存。</p>
          </div>
          <div className="head-actions">
            <button className="btn btn-soft" onClick={() => navigate("analysis")}>返回分析</button>
          </div>
        </div>

        <div className="progress-date-nav">
          <button onClick={() => setWeekOffset((n) => n - 1)} aria-label="上一周">‹</button>
          <strong>{week.label}{weekOffset === 0 ? "（本周）" : ""}</strong>
          <button onClick={() => setWeekOffset((n) => n + 1)} aria-label="下一周">›</button>
        </div>

        {loading ? (
          <div className="empty"><span className="subtle">加载中…</span></div>
        ) : (
          <>
            <div className="viz-panel" style={{ marginBottom: 18 }}>
              <h2 style={{ margin: "0 0 14px" }}>本周感悟</h2>
              {reflections.length === 0 && <p className="subtle">本周还没有写感悟。</p>}
              {reflections.map((r) => (
                <div key={r.date} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
                  <strong style={{ fontSize: 13 }}>{r.date}</strong>
                  <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>{r.content || "（空）"}</p>
                  {r.keywords && r.keywords.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {r.keywords.map((k, i) => (
                        <span key={`${k}-${i}`} className="event-cell" style={{ fontSize: 11 }}>{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="viz-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2 style={{ margin: 0 }}>周总结</h2>
                <button
                  className="btn btn-tint"
                  onClick={generateWeeklySummary}
                  disabled={aiLoading || user?.aiAuthorized === false}
                >
                  {aiLoading ? "生成中…" : "AI 生成"}
                </button>
              </div>
              <textarea
                className="reflection-textarea"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="点击 AI 生成，或自己写本周总结…"
                style={{ width: "100%", minHeight: 160, resize: "vertical", border: "1px solid var(--line)", borderRadius: 14, padding: 12, background: "var(--paper)", color: "var(--ink)", lineHeight: 1.6, fontFamily: "inherit" }}
              />
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={saveSummary}>保存总结</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
