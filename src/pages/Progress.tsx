import { useCallback, useEffect, useState, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "../stores/toast";
import { confirmAction } from "../stores/confirm";
import { api, type PlanItem, type TimeRecord } from "../api/client";
import { APP_TIME_ZONE, dateKey, offsetDate } from "../lib/time";
import { AppTimePicker } from "../components/AppTimePicker";
import { SwipeDelete } from "../components/SwipeDelete";
import { RecordEditorSheet } from "../components/RecordEditorSheet";
import { DateNavigator } from "../components/DateNavigator";
import { BackToTopButton } from "../components/BackToTopButton";

const FLEXIBLE_EVENTS = new Set(["上厕所", "如厕"]);

type CompareTone = "green" | "yellow" | "red";
type StatusFilter = "all" | "poor" | "medium" | "good";
const HISTORY_PAGE_SIZE = 40;

interface CompareChip {
  label: string;
  tone: CompareTone;
}

interface CompareRow {
  record: TimeRecord;
  plan?: PlanItem;
  tone: CompareTone;
  chips: CompareChip[];
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
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

function statusDisplay(value: number | null | undefined): { label: string; tone: "poor" | "medium" | "good" } {
  const status = value ?? 60;
  if (status <= 45) return { label: "差", tone: "poor" };
  if (status <= 75) return { label: "中", tone: "medium" };
  return { label: "好", tone: "good" };
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
      chips.push({ label: "计划内", tone: "green" });
    } else {
      chips.push({ label: "计划外", tone: "yellow" });
    }

    rows.push({ record, plan: best ?? undefined, tone: rowTone(chips), chips });
  });

  return rows.sort((a, b) => {
    return a.record.startLocal.localeCompare(b.record.startLocal);
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

function dateLabel(local: string | null | undefined): string {
  if (!local) return "";
  const date = local.slice(0, 10);
  const d = new Date(`${date}T12:00:00+08:00`);
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" });
}

function sortRecords(items: TimeRecord[]): TimeRecord[] {
  return [...items].sort((a, b) => (a.startLocal ?? "").localeCompare(b.startLocal ?? ""));
}

function sortRecordsDesc(items: TimeRecord[]): TimeRecord[] {
  return [...items].sort((a, b) => (b.startLocal ?? "").localeCompare(a.startLocal ?? ""));
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState<{ eventName: string; startHHMM: string; endHHMM: string; endNextDay: boolean; note: string }>({ eventName: "", startHHMM: "09:00", endHHMM: "10:00", endNextDay: false, note: "" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TimeRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);

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
    setEditingId(null);
    setAddingNew(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const compareRows = computeCompareRows(records, plans);
  const renderRecordRow = (row: CompareRow) => (
    <SwipeDelete key={row.record.id} label="记录" onDelete={() => void deleteRecord(row.record.id)}>
      <article className={`mobile-plan-card progress-item-card is-${row.tone}`} onClick={() => startEdit(row.record)}>
        <div className="card-time-rail"><strong>{hhmmFromLocal(row.record.startLocal)}</strong><span>{endTimeLabel(row.record)}</span></div>
        <div className="card-main">
          <div className="compare-title-row">
            <b>{row.record.eventName}</b>
            <em className={`plan-scope-badge ${row.plan ? "is-inside" : "is-outside"}`}>{row.plan ? "计划内" : "计划外"}</em>
          </div>
          <div className="card-meta">
            <small>{row.record.endUtc ? durationToSecondsText(recordSeconds(row.record)) : "进行中"}</small>
            <span className={`record-status is-${statusDisplay(row.record.statusProgress).tone}`}>{statusDisplay(row.record.statusProgress).label}</span>
          </div>
          {row.record.note && <small className="card-note">{row.record.note}</small>}
        </div>
      </article>
    </SwipeDelete>
  );

  const loadHistoryPage = useCallback(async (offset: number, append: boolean) => {
    if (!searchOpen) return;
    if (append) {
      setHistoryLoadingMore(true);
    } else {
      setHistoryLoading(true);
    }
    try {
      const params = new URLSearchParams({
        limit: String(HISTORY_PAGE_SIZE),
        offset: String(offset),
        status: statusFilter
      });
      if (query.trim()) params.set("q", query.trim());
      const { records, nextOffset, hasMore } = await api.get<{ records: TimeRecord[]; nextOffset: number; hasMore: boolean }>(
        `/api/records/search?${params.toString()}`
      );
      setHistoryRecords((current) => append ? sortRecordsDesc([...current, ...records]) : sortRecordsDesc(records));
      setHistoryOffset(nextOffset);
      setHistoryHasMore(hasMore);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载历史进展失败");
    } finally {
      setHistoryLoading(false);
      setHistoryLoadingMore(false);
    }
  }, [query, searchOpen, showToast, statusFilter]);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => {
      void loadHistoryPage(0, false);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loadHistoryPage, query, searchOpen, statusFilter]);

  const handleSearchScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 180 && historyHasMore && !historyLoading && !historyLoadingMore) {
      void loadHistoryPage(historyOffset, true);
    }
  };

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
    setAddingNew(false);
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

  const openHistoryRecord = (record: TimeRecord) => {
    setSearchOpen(false);
    const recordDate = record.startLocal.slice(0, 10);
    setDate(recordDate);
    showToast(`已跳到 ${dateLabel(record.startLocal)}`);
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
      await api.post("/api/records", { eventName: name, startUtc: startIso, endUtc: endIso, statusProgress: 60, note: newDraft.note.trim() || null });
      setAddingNew(false);
      setNewDraft({ eventName: "", startHHMM: "09:00", endHHMM: "10:00", endNextDay: false, note: "" });
      await load();
      showToast("已添加记录");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "添加失败");
    }
  };

  const cancelNew = () => {
    setAddingNew(false);
    setNewDraft({ eventName: "", startHHMM: "09:00", endHHMM: "10:00", endNextDay: false, note: "" });
  };

  return (
    <section className="sketch-screen progress-screen mobile-card-screen" aria-label="进展页">
      <div className="sketch-content">
        <div className="page-sticky-control">
          <DateNavigator value={date} onChange={setDate} />
        </div>

        <div className="progress-search-entry">
          <button type="button" className="search-field search-field-button" onClick={() => setSearchOpen(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 20-4.8-4.8M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" /></svg>
            <span>查找事件</span>
          </button>
        </div>

        <section className="embedded-section">
          <div className="embedded-head">
            <div><span className="module-kicker">当天实际记录</span><h2>进展</h2></div>
            <span className="count-pill">{records.length} 条</span>
          </div>

          <div className="plan-card-list">
            {loading && <div className="embedded-empty">加载中…</div>}
            {!loading && records.length === 0 && !addingNew && (
              <button className="inline-add-card" onClick={() => setAddingNew(true)}><span>+</span>添加第一条记录</button>
            )}

            {!loading && compareRows.length === 0 && records.length > 0 && (
              <div className="embedded-empty">没有匹配的记录。</div>
            )}

            {!loading && compareRows.map(renderRecordRow)}

            {!addingNew && records.length > 0 && <button className="inline-add-card compact" onClick={() => setAddingNew(true)}><span>+</span></button>}
          </div>
        </section>
      </div>
      {searchOpen && createPortal((
        <div className="progress-search-overlay" role="dialog" aria-modal="true" aria-label="查找事件">
          <div className="progress-search-page">
            <header className="progress-search-head">
              <label className="search-field">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 20-4.8-4.8M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" /></svg>
                <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" />
              </label>
              <button type="button" onClick={() => setSearchOpen(false)}>取消</button>
            </header>
            <div className="filter-chips progress-search-filters" role="group" aria-label="状态筛选">
              {[
                { key: "all", label: "全部" },
                { key: "poor", label: "差" },
                { key: "medium", label: "中" },
                { key: "good", label: "好" }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={statusFilter === item.key ? "is-active" : ""}
                  onClick={() => setStatusFilter(item.key as StatusFilter)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <section className="progress-search-results">
              <div className="embedded-head">
                <div><span className="module-kicker">历史进展</span><h2>搜索结果</h2></div>
                <span className="count-pill">{historyRecords.length}{historyHasMore ? "+" : ""} 条</span>
              </div>
              <div className="history-record-list" onScroll={handleSearchScroll}>
                {historyLoading ? (
                  <div className="embedded-empty">加载中…</div>
                ) : historyRecords.length === 0 ? (
                  <div className="embedded-empty">没有匹配的历史进展。</div>
                ) : historyRecords.map((record) => (
                  <button key={`history-${record.id}`} type="button" className="history-record-row" onClick={() => openHistoryRecord(record)}>
                    <span className="history-record-date">{dateLabel(record.startLocal)}</span>
                    <span className="history-record-time">
                      <strong>{hhmmFromLocal(record.startLocal)}</strong>
                      <small>{endTimeLabel(record)}</small>
                    </span>
                    <span className="history-record-main">
                      <b>{record.eventName}</b>
                      <small>{record.endUtc ? durationToSecondsText(recordSeconds(record)) : "进行中"}{record.note ? ` · ${record.note}` : ""}</small>
                    </span>
                    <span className={`record-status is-${statusDisplay(record.statusProgress).tone}`}>{statusDisplay(record.statusProgress).label}</span>
                  </button>
                ))}
                {!historyLoading && historyLoadingMore && <div className="history-load-more">加载更多…</div>}
                {!historyLoading && !historyLoadingMore && historyHasMore && <div className="history-load-more">继续下滑加载</div>}
                {!historyLoading && !historyHasMore && historyRecords.length > 0 && <div className="history-load-more">已到底</div>}
              </div>
            </section>
          </div>
        </div>
      ), document.body)}
      {editingId && drafts[editingId] && (
        <RecordEditorSheet title="编辑记录" onCancel={() => { setEditingId(null); setDrafts((previous) => { const next = { ...previous }; delete next[editingId]; return next; }); }} onSave={() => saveRecord(editingId)}>
          <input className="mobile-event-input" value={drafts[editingId].eventName ?? ""} onChange={(e) => setDrafts((previous) => ({ ...previous, [editingId]: { ...previous[editingId], eventName: e.target.value } }))} placeholder="事件名" autoFocus />
          <div className="mobile-time-grid">
            <AppTimePicker label="开始时间" value={isoToHHMM(drafts[editingId].startUtc)} onChange={(value) => changeRecordTime(editingId, "start", value)} />
            <AppTimePicker label="结束时间" value={isoToHHMM(drafts[editingId].endUtc)} dayOffset={drafts[editingId].endNextDay ? 1 : 0} onDayOffsetChange={(offset) => setRecordEndDay(editingId, offset === 1)} onChange={(value) => changeRecordTime(editingId, "end", value)} />
          </div>
          <div className="mobile-status-editor" role="group" aria-label="状态">
            {[{ label: "差", value: 30, tone: "poor" }, { label: "中", value: 60, tone: "medium" }, { label: "好", value: 90, tone: "good" }].map((item) => (
              <button key={item.label} className={`status-edit-btn is-${item.tone}${statusDisplay(drafts[editingId].statusProgress).label === item.label ? " is-selected" : ""}`} onClick={() => setDrafts((previous) => ({ ...previous, [editingId]: { ...previous[editingId], statusProgress: item.value } }))}>{item.label}</button>
            ))}
          </div>
          <textarea className="mobile-note-input" value={drafts[editingId].note ?? ""} onChange={(e) => setDrafts((previous) => ({ ...previous, [editingId]: { ...previous[editingId], note: e.target.value } }))} placeholder="备注，可选" rows={2} />
        </RecordEditorSheet>
      )}
      {addingNew && (
        <RecordEditorSheet title="补录记录" onCancel={cancelNew} onSave={() => void saveNew()} saveLabel="添加记录">
          <input className="mobile-event-input" value={newDraft.eventName} onChange={(e) => setNewDraft({ ...newDraft, eventName: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void saveNew(); }} placeholder="事件名" autoFocus />
          <div className="mobile-time-grid">
            <AppTimePicker label="开始时间" value={newDraft.startHHMM} onChange={(value) => changeNewTime("start", value)} />
            <AppTimePicker label="结束时间" value={newDraft.endHHMM} dayOffset={newDraft.endNextDay ? 1 : 0} onDayOffsetChange={(offset) => setNewEndDay(offset === 1)} onChange={(value) => changeNewTime("end", value)} />
          </div>
          <textarea className="mobile-note-input" value={newDraft.note} onChange={(e) => setNewDraft({ ...newDraft, note: e.target.value })} placeholder="备注，可选" rows={2} />
        </RecordEditorSheet>
      )}
      <BackToTopButton />
    </section>
  );
}
