import { useEffect, useRef, useState } from "react";
import { useToastStore } from "../stores/toast";
import { confirmAction } from "../stores/confirm";
import { api, type PlanItem, type TimeRecord } from "../api/client";
import { APP_TIME_ZONE, dateKey, offsetDate } from "../lib/time";
import { AppTimePicker } from "../components/AppTimePicker";
import { SwipeDelete } from "../components/SwipeDelete";

const FLEXIBLE_EVENTS = new Set(["上厕所", "如厕"]);

type Mode = "view" | "compare";

type CompareTone = "green" | "yellow" | "red";

interface CompareChip {
  label: string;
  tone: CompareTone;
}

interface CompareRow {
  kind: "actual" | "missing";
  record?: TimeRecord;
  plan?: PlanItem;
  tone: CompareTone;
  chips: CompareChip[];
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function recordMinutes(r: TimeRecord): number {
  if (!r.endUtc) return 0;
  return Math.max(1, Math.round(recordSeconds(r) / 60));
}

function recordSeconds(r: TimeRecord): number {
  if (!r.endUtc) return 0;
  return Math.max(0, Math.round((new Date(r.endUtc).getTime() - new Date(r.startUtc).getTime()) / 1000));
}

function durationToSecondsText(seconds: number | null | undefined): string {
  if (seconds == null) return "进行中";
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}小时${m}分钟${s}秒`;
}

function durationToHours(m: number | null | undefined): string {
  const total = Math.max(1, Math.min(1439, m ?? 60));
  const h = total / 60;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} 小时`;
}

function statusDisplay(value: number | null | undefined): { label: string; tone: "poor" | "medium" | "good" } {
  const status = value ?? 60;
  if (status <= 45) return { label: "差", tone: "poor" };
  if (status <= 75) return { label: "中", tone: "medium" };
  return { label: "好", tone: "good" };
}

function diffLabel(diff: number, type: "start" | "duration"): CompareChip {
  if (diff === 0) return { label: type === "start" ? "准时" : "刚好", tone: "green" };
  const abs = Math.abs(diff);
  if (type === "start") {
    return diff < 0 ? { label: `早 ${abs} 分钟`, tone: "green" } : { label: `晚 ${abs} 分钟`, tone: "red" };
  }
  return diff < 0 ? { label: `少 ${abs} 分钟`, tone: "green" } : { label: `多 ${abs} 分钟`, tone: "red" };
}

function rowTone(chips: CompareChip[]): CompareTone {
  if (chips.some((chip) => chip.tone === "red")) return "red";
  if (chips.some((chip) => chip.tone === "yellow")) return "yellow";
  return "green";
}

function computeCompareRows(records: TimeRecord[], plans: PlanItem[]): CompareRow[] {
  const used = new Set<string>();
  const rows: CompareRow[] = [];

  records.forEach((record) => {
    const event = record.eventName;
    const actualStart = timeToMinutes(record.startLocal.slice(11, 16));
    let best: PlanItem | null = null;
    let bestDistance = Infinity;
    for (const plan of plans) {
      if (used.has(plan.id)) continue;
      if (normalize(plan.eventName) !== normalize(event)) continue;
      const planStart = plan.plannedStartLocal ? timeToMinutes(plan.plannedStartLocal.slice(11, 16)) : 0;
      const distance = Math.abs(planStart - actualStart);
      if (distance < bestDistance) {
        best = plan;
        bestDistance = distance;
      }
    }
    if (best) used.add(best.id);

    const flexible = FLEXIBLE_EVENTS.has(event);
    const chips: CompareChip[] = [];
    if (flexible) {
      chips.push({ label: "灵活事件", tone: "yellow" });
    } else if (best) {
      chips.push({ label: "事件匹配", tone: "green" });
      const bestStart = best.plannedStartLocal ? timeToMinutes(best.plannedStartLocal.slice(11, 16)) : actualStart;
      const bestMins = best.estimatedMinutes ?? recordMinutes(record);
      chips.push(diffLabel(actualStart - bestStart, "start"));
      chips.push(diffLabel(recordMinutes(record) - bestMins, "duration"));
    } else {
      chips.push({ label: "计划外", tone: "yellow" });
    }

    rows.push({ kind: "actual", record, plan: best ?? undefined, tone: rowTone(chips), chips });
  });

  plans
    .filter((p) => !used.has(p.id))
    .forEach((plan) => {
      const chips: CompareChip[] = [
        { label: "计划有", tone: "red" },
        { label: "实际未出现", tone: "red" }
      ];
      rows.push({ kind: "missing", plan, tone: "red", chips });
    });

  return rows.sort((a, b) => {
    const ta = a.kind === "actual" && a.record ? a.record.startLocal : a.plan?.plannedStartLocal ?? "";
    const tb = b.kind === "actual" && b.record ? b.record.startLocal : b.plan?.plannedStartLocal ?? "";
    return ta.localeCompare(tb);
  });
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, "").toLowerCase();
}

function isoToHHMM(iso: string | null | undefined): string {
  if (!iso) return "00:00";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

function timeInputToIso(dateStr: string, timeStr: string): string {
  return timeInputToIsoWithDay(dateStr, timeStr, false);
}

function timeInputToIsoWithDay(dateStr: string, timeStr: string, nextDay: boolean): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = (timeStr || "00:00").split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day + (nextDay ? 1 : 0), hour - 8, minute, 0)).toISOString();
}

function hhmmFromLocal(local: string | null | undefined): string {
  if (!local) return "--:--";
  return local.slice(11, 16) || "--:--";
}

function endTimeLabel(record: TimeRecord): string {
  const end = hhmmFromLocal(record.endLocal);
  return record.endLocal && record.startLocal && record.endLocal.slice(0, 10) > record.startLocal.slice(0, 10) ? `次日 ${end}` : end;
}

function sortRecords(items: TimeRecord[]): TimeRecord[] {
  return [...items].sort((a, b) => (a.startLocal ?? "").localeCompare(b.startLocal ?? ""));
}

function localIsoFor(date: string, utc: string, nextDay = false): string {
  const localDate = nextDay ? dateKey(offsetDate(1, new Date(`${date}T12:00:00+08:00`))) : date;
  return `${localDate}T${isoToHHMM(utc)}:00`;
}

interface RecordDraft extends Partial<TimeRecord> {
  startUtc?: string;
  endUtc?: string;
  endNextDay?: boolean;
}

export function Progress() {
  const showToast = useToastStore((s) => s.show);
  const [date, setDate] = useState(dateKey());
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("view");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState<{ eventName: string; startHHMM: string; endHHMM: string; endNextDay: boolean }>({ eventName: "", startHHMM: "09:00", endHHMM: "10:00", endNextDay: false });
  const newCardRef = useRef<HTMLElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ records }, { plans }] = await Promise.all([
        api.get<{ records: TimeRecord[] }>(`/api/records?date=${date}`),
        api.get<{ plans: PlanItem[] }>(`/api/plans?date=${date}`)
      ]);
      setRecords(sortRecords(records));
      setPlans(plans);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载进展失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    setMode("view");
    setEditingId(null);
    setAddingNew(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    if (!addingNew) return;
    const reveal = () => newCardRef.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
    const timer = window.setTimeout(reveal, 80);
    window.visualViewport?.addEventListener("resize", reveal);
    return () => {
      window.clearTimeout(timer);
      window.visualViewport?.removeEventListener("resize", reveal);
    };
  }, [addingNew]);

  const isToday = date === dateKey();
  const compareRows = mode === "compare" ? computeCompareRows(records, plans) : [];

  const changeRecordTime = (id: string, part: "start" | "end", value: string) => {
    setDrafts((previous) => {
      const current = previous[id];
      if (!current) return previous;
      const startHHMM = part === "start" ? value : isoToHHMM(current.startUtc);
      const endHHMM = part === "end" ? value : isoToHHMM(current.endUtc);
      // 当结束钟点不晚于开始钟点时，明确视为次日结束，而不是生成无效记录。
      const endNextDay = current.endNextDay || timeToMinutes(endHHMM) <= timeToMinutes(startHHMM);
      return {
        ...previous,
        [id]: {
          ...current,
          startUtc: timeInputToIso(date, startHHMM),
          endUtc: timeInputToIsoWithDay(date, endHHMM, endNextDay),
          endNextDay
        }
      };
    });
  };

  const setRecordEndDay = (id: string, nextDay: boolean) => {
    const current = drafts[id];
    if (!current) return;
    const startHHMM = isoToHHMM(current.startUtc);
    const endHHMM = isoToHHMM(current.endUtc);
    if (!nextDay && timeToMinutes(endHHMM) <= timeToMinutes(startHHMM)) {
      showToast("结束时间早于开始时间，只能选择次日结束");
      return;
    }
    setDrafts((previous) => ({
      ...previous,
      [id]: { ...current, endNextDay: nextDay, endUtc: timeInputToIsoWithDay(date, endHHMM, nextDay) }
    }));
  };

  const changeNewTime = (part: "start" | "end", value: string) => {
    setNewDraft((current) => {
      const startHHMM = part === "start" ? value : current.startHHMM;
      const endHHMM = part === "end" ? value : current.endHHMM;
      return { ...current, startHHMM, endHHMM, endNextDay: current.endNextDay || timeToMinutes(endHHMM) <= timeToMinutes(startHHMM) };
    });
  };

  const setNewEndDay = (nextDay: boolean) => {
    if (!nextDay && timeToMinutes(newDraft.endHHMM) <= timeToMinutes(newDraft.startHHMM)) {
      showToast("结束时间早于开始时间，只能选择次日结束");
      return;
    }
    setNewDraft((current) => ({ ...current, endNextDay: nextDay }));
  };

  const saveRecord = (id: string) => {
    const d = drafts[id];
    if (!d) return;
    const before = records;
    const current = records.find((record) => record.id === id);
    if (!current) return;
    const startUtc = d.startUtc ?? current.startUtc;
    const endUtc = d.endUtc ?? current.endUtc;
    if (endUtc && new Date(endUtc).getTime() <= new Date(startUtc).getTime()) {
      showToast("结束时间必须晚于开始时间");
      return;
    }
    const durationMinutes = endUtc ? Math.max(1, Math.round((new Date(endUtc).getTime() - new Date(startUtc).getTime()) / 60000)) : current.durationMinutes;
    const updated = sortRecords(records.map((record) => record.id === id ? {
      ...record,
      eventName: d.eventName ?? record.eventName,
      startUtc,
      startLocal: localIsoFor(date, startUtc),
      endUtc,
      endLocal: endUtc ? localIsoFor(date, endUtc, d.endNextDay ?? false) : null,
      durationMinutes,
      statusProgress: d.statusProgress ?? record.statusProgress,
      note: d.note ?? record.note
    } : record));
    // 先更新当前卡片，保存请求在后台完成，不再回拉整页数据。
    setRecords(updated);
    setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setEditingId(null);
    void api.patch(`/api/records/${id}`, { eventName: d.eventName, startUtc: d.startUtc, endUtc: d.endUtc, statusProgress: d.statusProgress, note: d.note })
      .then(() => showToast("已保存"))
      .catch((err) => {
        setRecords(before);
        showToast(err instanceof Error ? err.message : "保存失败，已恢复原内容");
      });
  };

  const deleteRecord = async (id: string) => {
    if (!(await confirmAction("删除这条记录？"))) return;
    try {
      await api.delete(`/api/records/${id}`);
      setEditingId(null);
      showToast("已删除");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败");
    }
  };

  const startEdit = (record: TimeRecord) => {
    setDrafts((previous) => ({
      ...previous,
      [record.id]: {
        ...record,
        startUtc: record.startUtc ?? undefined,
        endUtc: record.endUtc ?? undefined,
        endNextDay: Boolean(record.endLocal && record.startLocal && record.endLocal.slice(0, 10) > record.startLocal.slice(0, 10))
      }
    }));
    setEditingId(record.id);
  };

  const saveNew = async () => {
    const name = newDraft.eventName.trim();
    if (!name) { setAddingNew(false); return; }
    try {
      // 输入的是北京时间的墙上时间，不能交给设备时区自行解释。
      const startIso = timeInputToIso(date, newDraft.startHHMM);
      const endIso = timeInputToIsoWithDay(date, newDraft.endHHMM, newDraft.endNextDay);
      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        showToast("结束时间必须晚于开始时间");
        return;
      }
      // 补录直接写入已完成记录，绝不触碰主页正在运行的活动计时器。
      await api.post("/api/records", { eventName: name, startUtc: startIso, endUtc: endIso, statusProgress: 60 });
      setAddingNew(false);
      setNewDraft({ eventName: "", startHHMM: "09:00", endHHMM: "10:00", endNextDay: false });
      await load();
      showToast("已添加记录");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "添加失败");
    }
  };

  const cancelNew = () => {
    setAddingNew(false);
    setNewDraft({ eventName: "", startHHMM: "09:00", endHHMM: "10:00", endNextDay: false });
  };

  return (
    <section className="sketch-screen progress-screen mobile-card-screen" aria-label="进展页">
      <div className="sketch-content">
        <div className="progress-date-nav compact-nav">
          <button onClick={() => setDate(dateKey(offsetDate(-1, new Date(date))))} aria-label="前一天">‹</button>
          <strong>{date}{isToday ? "（今日）" : ""}</strong>
          {isToday ? <span className="date-arrow-placeholder" /> : <button onClick={() => setDate(dateKey(offsetDate(1, new Date(date))))} aria-label="后一天">›</button>}
        </div>

        <div className="toolbar slim-toolbar">
          <span className="subtle">按开始时间</span>
          <button className={`btn ${mode === "compare" ? "btn-primary" : "btn-soft"}`} onClick={() => { setMode((current) => current === "compare" ? "view" : "compare"); setEditingId(null); }} disabled={plans.length === 0 && records.length === 0}>
            {mode === "compare" ? "退出对比" : "对比"}
          </button>
        </div>

        <section className="embedded-section">
          <div className="embedded-head">
            <div><span className="module-kicker">当天实际记录</span><h2>进展</h2></div>
            <span className="count-pill">{records.length} 条</span>
          </div>

          <div className="plan-card-list">
            {loading && <div className="embedded-empty">加载中…</div>}
            {!loading && records.length === 0 && mode !== "compare" && !addingNew && (
              <button className="inline-add-card" onClick={() => setAddingNew(true)}><span>+</span>添加第一条记录</button>
            )}

            {mode === "view" && records.map((record) => {
              const isEditing = editingId === record.id;
              const draft = drafts[record.id] ?? record;
              const status = statusDisplay(record.statusProgress);
              if (isEditing) {
                return (
                  <article key={record.id} className="mobile-edit-card">
                    <input className="mobile-event-input" value={draft.eventName ?? ""} onChange={(e) => setDrafts((previous) => ({ ...previous, [record.id]: { ...previous[record.id], eventName: e.target.value } }))} placeholder="事件名" />
                    <div className="mobile-time-grid">
                      <AppTimePicker label="开始" value={isoToHHMM(draft.startUtc)} onChange={(value) => changeRecordTime(record.id, "start", value)} />
                      <AppTimePicker label="结束" value={isoToHHMM(draft.endUtc)} dayOffset={draft.endNextDay ? 1 : 0} onDayOffsetChange={(offset) => setRecordEndDay(record.id, offset === 1)} onChange={(value) => changeRecordTime(record.id, "end", value)} />
                    </div>
                    <div className="mobile-status-editor" role="group" aria-label="状态">
                      {[{ label: "差", value: 30, tone: "poor" }, { label: "中", value: 60, tone: "medium" }, { label: "好", value: 90, tone: "good" }].map((item) => (
                        <button
                          key={item.label}
                          className={`status-edit-btn is-${item.tone}${statusDisplay(draft.statusProgress).label === item.label ? " is-selected" : ""}`}
                          onClick={() => setDrafts((previous) => ({ ...previous, [record.id]: { ...previous[record.id], statusProgress: item.value } }))}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="mobile-card-actions">
                      <button className="mini-soft" onClick={() => setEditingId(null)}>取消</button>
                      <button className="mini-primary" onClick={() => saveRecord(record.id)}>保存</button>
                    </div>
                  </article>
                );
              }
              return (
                <SwipeDelete key={record.id} label="记录" onDelete={() => void deleteRecord(record.id)}>
                  <article className="mobile-plan-card progress-item-card" onClick={() => startEdit(record)}>
                    <div className="card-time-rail"><strong>{hhmmFromLocal(record.startLocal)}</strong><span>{endTimeLabel(record)}</span></div>
                    <div className="card-main">
                      <b>{record.eventName}</b>
                      <div className="card-meta"><small>{record.endUtc ? durationToSecondsText(recordSeconds(record)) : "进行中"}</small><span className={`record-status is-${status.tone}`}>{status.label}</span></div>
                    </div>
                  </article>
                </SwipeDelete>
              );
            })}

            {mode === "compare" && compareRows.map((row, idx) => row.kind === "missing" ? (
              <article key={`m-${idx}`} className={`compare-card is-${row.tone}`}>
                <div className="compare-time"><strong>{row.plan?.plannedStartLocal?.slice(11, 16) ?? "待定"}</strong><span>计划 {durationToHours(row.plan?.estimatedMinutes)}</span></div>
                <div className="compare-body">
                  <div className="compare-title-row"><b>{row.plan?.eventName}</b><em>计划遗漏</em></div>
                  <p>这条计划到时间了，但进展里没有对应记录。</p>
                  <div className="compare-chips">{row.chips.map((chip) => <span key={chip.label} className={`compare-chip is-${chip.tone}`}>{chip.label}</span>)}</div>
                </div>
              </article>
            ) : (
              <article key={row.record!.id} className={`compare-card is-${row.tone}`}>
                <div className="compare-time"><strong>{hhmmFromLocal(row.record!.startLocal)}</strong><span>{hhmmFromLocal(row.record!.endLocal)}</span></div>
                <div className="compare-body">
                  <div className="compare-title-row"><b>{row.record!.eventName}</b><em>{row.plan ? "已匹配计划" : "计划外"}</em></div>
                  <p>
                    实际 {row.record!.endUtc ? durationToSecondsText(recordSeconds(row.record!)) : "进行中"}
                    {row.plan ? ` · 计划 ${row.plan.plannedStartLocal?.slice(11, 16) ?? "待定"} / ${durationToHours(row.plan.estimatedMinutes)}` : " · 今天计划里没有它"}
                  </p>
                  <div className="compare-chips">{row.chips.map((chip) => <span key={chip.label} className={`compare-chip is-${chip.tone}`}>{chip.label}</span>)}</div>
                </div>
              </article>
            ))}

            {addingNew && (
              <article ref={newCardRef} className="mobile-edit-card new-card">
                <input className="mobile-event-input" value={newDraft.eventName} onChange={(e) => setNewDraft({ ...newDraft, eventName: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveNew(); if (e.key === "Escape") cancelNew(); }} placeholder="事件名" autoFocus />
                <div className="mobile-time-grid">
                  <AppTimePicker label="开始" value={newDraft.startHHMM} onChange={(value) => changeNewTime("start", value)} />
                  <AppTimePicker label="结束" value={newDraft.endHHMM} dayOffset={newDraft.endNextDay ? 1 : 0} onDayOffsetChange={(offset) => setNewEndDay(offset === 1)} onChange={(value) => changeNewTime("end", value)} />
                </div>
                <div className="mobile-card-actions"><button className="mini-soft" onClick={cancelNew}>取消</button><button className="mini-primary" onClick={saveNew}>保存</button></div>
              </article>
            )}

            {!addingNew && mode === "view" && records.length > 0 && <button className="inline-add-card compact" onClick={() => setAddingNew(true)}><span>+</span></button>}
          </div>
        </section>
      </div>
    </section>
  );
}
