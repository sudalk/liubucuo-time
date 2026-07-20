import { useEffect, useMemo, useState } from "react";
import { useToastStore } from "../stores/toast";
import { confirmAction } from "../stores/confirm";
import { api, type PlanItem } from "../api/client";
import { dateKey, offsetDate, pad } from "../lib/time";
import { BubbleCloud } from "../components/BubbleCloud";
import { AppTimePicker } from "../components/AppTimePicker";
import { SwipeDelete } from "../components/SwipeDelete";
import { RecordEditorSheet } from "../components/RecordEditorSheet";
import { DateNavigator } from "../components/DateNavigator";
import { BackToTopButton } from "../components/BackToTopButton";

interface HistoryEvent {
  id?: string;
  name: string;
  normalizedName: string;
  count?: number;
}

type CopyMode = "append" | "replace";

function durationToHours(m: number | null | undefined): string {
  const total = Math.max(1, Math.min(1439, m ?? 60));
  const h = total / 60;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} 小时`;
}

function durationSummary(m: number): string {
  if (m <= 0) return "0 小时";
  const h = m / 60;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} 小时`;
}

function hhmmToLocal(hhmm: string, date: string): string {
  return `${date}T${hhmm}:00`;
}

function localToHHMM(s: string | null | undefined): string {
  if (!s) return "09:00";
  return s.slice(11, 16) || "09:00";
}

function minutesToHHMM(m: number | null | undefined): string {
  const total = Math.max(1, Math.min(1439, m ?? 60));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return Math.max(1, h * 60 + m);
}

function addMinutesToHHMM(startHHMM: string, minutes: number | null | undefined): { label: string; nextDay: boolean } {
  const [h, m] = (startHHMM || "09:00").split(":").map(Number);
  const total = h * 60 + m + Math.max(1, Math.min(1439, minutes ?? 60));
  const end = total % 1440;
  return { label: `${pad(Math.floor(end / 60))}:${pad(end % 60)}`, nextDay: total >= 1440 };
}

function planEndLabel(plan: Pick<PlanItem, "plannedStartLocal" | "estimatedMinutes">): string {
  if (!plan.plannedStartLocal) return "结束待定";
  const end = addMinutesToHHMM(plan.plannedStartLocal.slice(11, 16), plan.estimatedMinutes);
  return `${end.nextDay ? "次日 " : ""}${end.label}`;
}

function nextPlanStartHHMM(items: PlanItem[]): string {
  const ordered = sortPlans(items).filter((plan) => plan.plannedStartLocal);
  const previous = ordered.at(-1);
  if (!previous?.plannedStartLocal) return "09:00";
  return addMinutesToHHMM(previous.plannedStartLocal.slice(11, 16), previous.estimatedMinutes).label;
}

function localDate(date: string): Date {
  return new Date(`${date}T12:00:00+08:00`);
}

function addDaysToDateKey(date: string, days: number): string {
  return dateKey(offsetDate(days, localDate(date)));
}

function readableDate(date: string): string {
  const d = localDate(date);
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

function monthStart(date: string): Date {
  const d = localDate(date);
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

function sortPlans(items: PlanItem[]): PlanItem[] {
  return [...items].sort((a, b) => {
    const ta = a.plannedStartLocal;
    const tb = b.plannedStartLocal;
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta.localeCompare(tb);
  });
}

export function Plan() {
  const showToast = useToastStore((s) => s.show);
  const [date, setDate] = useState(dateKey());
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PlanItem>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceDate, setCopySourceDate] = useState(() => addDaysToDateKey(dateKey(), -1));
  const [copySourceMonth, setCopySourceMonth] = useState(() => monthStart(addDaysToDateKey(dateKey(), -1)));
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [newDraft, setNewDraft] = useState<{ eventName: string; startHHMM: string; durationHHMM: string; note: string }>({
    eventName: "",
    startHHMM: "09:00",
    durationHHMM: "01:00",
    note: ""
  });

  const load = async () => {
    setLoading(true);
    try {
      const [{ plans }, { events: yEvents }] = await Promise.all([
        api.get<{ plans: PlanItem[] }>(`/api/plans?date=${date}`),
        api.get<{ events: HistoryEvent[] }>(`/api/events`)
      ]);
      setPlans(sortPlans(plans));
      setHistoryEvents(yEvents);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载计划失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    setEditingId(null);
    setAddingNew(false);
    setCopyOpen(false);
    setCopyConfirmOpen(false);
    const source = addDaysToDateKey(date, -1);
    setCopySourceDate(source);
    setCopySourceMonth(monthStart(source));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const startEdit = (plan: PlanItem) => {
    setAddingNew(false);
    setEditingId(plan.id);
    setDraft({ ...plan });
  };

  const saveDraft = () => {
    if (!editingId) return;
    const d = draft as Partial<PlanItem>;
    const before = plans;
    const updated = sortPlans(plans.map((item) => item.id === editingId ? {
      ...item,
      eventName: d.eventName ?? item.eventName,
      plannedStartLocal: d.plannedStartLocal ?? item.plannedStartLocal,
      estimatedMinutes: d.estimatedMinutes ?? item.estimatedMinutes,
      sortOrder: d.sortOrder ?? item.sortOrder,
      note: d.note ?? item.note
    } : item));
    // 本地卡片立即退出编辑，网络同步不再阻塞用户。
    setPlans(updated);
    setEditingId(null);
    setDraft({});
    void api.put("/api/plans", {
      id: d.id,
      date: d.date,
      eventName: d.eventName ?? "",
      plannedStartLocal: d.plannedStartLocal,
      estimatedMinutes: d.estimatedMinutes,
      sortOrder: d.sortOrder,
      note: d.note ?? null
    }).then(() => showToast("已保存"))
      .catch((err) => {
        setPlans(before);
        showToast(err instanceof Error ? err.message : "保存失败，已恢复原内容");
      });
  };

  const deletePlan = async (id: string) => {
    if (!(await confirmAction("删除这条计划？"))) return;
    try {
      await api.delete(`/api/plans/${id}`);
      setEditingId(null);
      await load();
      showToast("已删除");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败");
    }
  };

  const openNewPlan = (eventName = "") => {
    setEditingId(null);
    setNewDraft({
      eventName,
      startHHMM: nextPlanStartHHMM(plans),
      durationHHMM: "01:00",
      note: ""
    });
    setAddingNew(true);
  };

  const startNewFromHistoryEvent = (eventName: string) => {
    // 和点击加号完全相同，只是预先填入事件名，仍需由用户确认时间与预计耗时。
    openNewPlan(eventName);
  };

  const saveNew = async () => {
    const name = newDraft.eventName.trim();
    if (!name) {
      setAddingNew(false);
      return;
    }
    try {
      await api.put("/api/plans", {
        date,
        eventName: name,
        plannedStartLocal: hhmmToLocal(newDraft.startHHMM, date),
        estimatedMinutes: hhmmToMinutes(newDraft.durationHHMM),
        sortOrder: plans.length,
        note: newDraft.note.trim() || null
      });
      setAddingNew(false);
      setNewDraft({ eventName: "", startHHMM: "09:00", durationHHMM: "01:00", note: "" });
      await load();
      showToast("已添加");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "添加失败");
    }
  };

  const cancelNew = () => {
    setAddingNew(false);
    setNewDraft({ eventName: "", startHHMM: "09:00", durationHHMM: "01:00", note: "" });
  };

  const plannedMinutes = useMemo(
    () => plans.reduce((sum, plan) => sum + Math.max(0, plan.estimatedMinutes ?? 0), 0),
    [plans]
  );
  const plannedRatio = Math.min(100, Math.round((plannedMinutes / 1440) * 100));
  const remainingMinutes = Math.max(0, 1440 - plannedMinutes);

  const openCopySheet = () => {
    const source = addDaysToDateKey(date, -1);
    setCopySourceDate(source);
    setCopySourceMonth(monthStart(source));
    setCopyOpen(true);
  };

  const chooseCopySource = () => {
    if (copying) return;
    if (!copySourceDate || copySourceDate === date) {
      showToast("请选择其他日期");
      return;
    }
    if (plans.length > 0) {
      setCopyOpen(false);
      setCopyConfirmOpen(true);
      return;
    }
    void copyPlansFromDate("append");
  };

  const copyPlansFromDate = async (mode: CopyMode) => {
    if (copying) return;
    if (!copySourceDate || copySourceDate === date) {
      showToast("请选择其他日期");
      return;
    }
    setCopying(true);
    try {
      const { copied } = await api.post<{ copied: number }>("/api/plans/copy", {
        sourceDate: copySourceDate,
        targetDate: date,
        mode
      });
      setCopyConfirmOpen(false);
      setCopyOpen(false);
      await load();
      showToast(`已从 ${readableDate(copySourceDate)} 复制 ${copied} 条计划`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "复制失败");
    } finally {
      setCopying(false);
    }
  };

  const editingEnd = editingId
    ? planEndLabel({
        plannedStartLocal: draft.plannedStartLocal ?? plans.find((plan) => plan.id === editingId)?.plannedStartLocal ?? null,
        estimatedMinutes: draft.estimatedMinutes ?? plans.find((plan) => plan.id === editingId)?.estimatedMinutes ?? null
      } as Pick<PlanItem, "plannedStartLocal" | "estimatedMinutes">)
    : "";
  const newEnd = addMinutesToHHMM(newDraft.startHHMM, hhmmToMinutes(newDraft.durationHHMM));
  const sourceFirstWeekday = (copySourceMonth.getDay() + 6) % 7;
  const sourceDaysInMonth = new Date(copySourceMonth.getFullYear(), copySourceMonth.getMonth() + 1, 0).getDate();
  const sourceCalendarCells = Array.from({ length: Math.ceil((sourceFirstWeekday + sourceDaysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - sourceFirstWeekday + 1;
    return day > 0 && day <= sourceDaysInMonth ? new Date(copySourceMonth.getFullYear(), copySourceMonth.getMonth(), day, 12) : null;
  });

  return (
    <section className="sketch-screen plan-screen mobile-card-screen" aria-label="计划页">
      <div className="sketch-content">
        <div className="page-sticky-control">
          <DateNavigator value={date} onChange={setDate} />
        </div>

        <section className="embedded-section">
          <div className="embedded-head">
            <div>
              <span className="module-kicker">当天安排</span>
              <h2>计划</h2>
            </div>
            <span className="count-pill">{plans.length} 条</span>
          </div>
          <div className="day-budget-card">
            <div>
              <span>已安排 {durationSummary(plannedMinutes)}</span>
              <strong>还剩 {durationSummary(remainingMinutes)}</strong>
            </div>
            <button type="button" onClick={openCopySheet}>从某天复制</button>
            <i style={{ ["--plan-ratio" as string]: `${plannedRatio}%` }} aria-hidden="true" />
          </div>

          <div className="plan-card-list">
            {loading && <div className="embedded-empty">加载中…</div>}
            {!loading && plans.length === 0 && !addingNew && (
              <button className="inline-add-card" onClick={() => openNewPlan()}>
                <span>+</span>
                添加第一条计划
              </button>
            )}

            {plans.map((plan) => (
                <SwipeDelete key={plan.id} label="计划" onDelete={() => void deletePlan(plan.id)}>
                  <article className="mobile-plan-card" onClick={() => startEdit(plan)}>
                    <div className="card-time-rail">
                      <strong>{plan.plannedStartLocal?.slice(11, 16) ?? "待定"}</strong>
                      <span>{planEndLabel(plan)}</span>
                    </div>
                    <div className="card-main">
                      <b>{plan.eventName}</b>
                      <small>{durationToHours(plan.estimatedMinutes)} · 点击修改</small>
                      {plan.note && <small className="card-note">{plan.note}</small>}
                    </div>
                  </article>
                </SwipeDelete>
            ))}

            {!addingNew && plans.length > 0 && (
              <button className="inline-add-card compact" onClick={() => openNewPlan()}>
                <span>+</span>
              </button>
            )}
          </div>
        </section>

        <BubbleCloud
          title="常用事件"
          helperText="点选后补全时间和时长"
          events={historyEvents.map((event) => ({ id: event.id ?? event.normalizedName, name: event.name }))}
          selectedName={null}
          onSelect={(event) => startNewFromHistoryEvent(event.name)}
        />
      </div>
      {editingId && (
        <RecordEditorSheet title="编辑计划" onCancel={() => { setEditingId(null); setDraft({}); }} onSave={saveDraft}>
          <input className="mobile-event-input" value={draft.eventName ?? ""} onChange={(e) => setDraft({ ...draft, eventName: e.target.value })} placeholder="事件名" autoFocus />
          <div className="mobile-time-grid">
            <AppTimePicker label="预计耗时" value={minutesToHHMM(draft.estimatedMinutes)} hourMin={0} hourMax={12} onChange={(value) => setDraft({ ...draft, estimatedMinutes: hhmmToMinutes(value) })} />
            <AppTimePicker label="开始时间" value={localToHHMM(draft.plannedStartLocal)} onChange={(value) => setDraft({ ...draft, plannedStartLocal: hhmmToLocal(value, date) })} />
          </div>
          <textarea className="mobile-note-input" value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="备注，可选" rows={2} />
          <p className="computed-time-note">结束时间：{editingEnd}</p>
        </RecordEditorSheet>
      )}
      {addingNew && (
        <RecordEditorSheet title="添加计划" onCancel={cancelNew} onSave={() => void saveNew()} saveLabel="添加计划">
          <input className="mobile-event-input" value={newDraft.eventName} onChange={(e) => setNewDraft({ ...newDraft, eventName: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void saveNew(); }} placeholder="事件名" autoFocus />
          <div className="mobile-time-grid">
            <AppTimePicker label="预计耗时" value={newDraft.durationHHMM} hourMin={0} hourMax={12} onChange={(value) => setNewDraft({ ...newDraft, durationHHMM: value })} />
            <AppTimePicker label="开始时间" value={newDraft.startHHMM} onChange={(value) => setNewDraft({ ...newDraft, startHHMM: value })} />
          </div>
          <textarea className="mobile-note-input" value={newDraft.note} onChange={(e) => setNewDraft({ ...newDraft, note: e.target.value })} placeholder="备注，可选" rows={2} />
          <p className="computed-time-note">结束时间：{newEnd.nextDay ? "次日 " : ""}{newEnd.label}</p>
        </RecordEditorSheet>
      )}
      {copyOpen && (
        <RecordEditorSheet
          title="选择来源日期"
          kicker=""
          onCancel={() => { setCopyOpen(false); setCopyConfirmOpen(false); }}
          onSave={chooseCopySource}
          saveLabel={copying ? "复制中…" : "下一步"}
        >
          <div className="copy-plan-panel is-simple">
            <div className="copy-calendar" aria-label="选择来源日期">
              <header className="date-calendar-head">
                <button type="button" onClick={() => setCopySourceMonth(new Date(copySourceMonth.getFullYear(), copySourceMonth.getMonth() - 1, 1, 12))} aria-label="上个月">‹</button>
                <strong>{copySourceMonth.getFullYear()} 年 {copySourceMonth.getMonth() + 1} 月</strong>
                <button type="button" onClick={() => setCopySourceMonth(new Date(copySourceMonth.getFullYear(), copySourceMonth.getMonth() + 1, 1, 12))} aria-label="下个月">›</button>
              </header>
              <div className="date-calendar-weekdays" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="date-calendar-grid">
                {sourceCalendarCells.map((cell, index) => {
                  if (!cell) return <span key={`empty-${index}`} />;
                  const key = dateKey(cell);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${key === copySourceDate ? "is-selected" : ""}${key === date ? " is-today" : ""}`}
                      onClick={() => setCopySourceDate(key)}
                    >
                      {cell.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </RecordEditorSheet>
      )}
      {copyConfirmOpen && (
        <div className="copy-confirm-scrim" role="dialog" aria-modal="true" aria-label="确认复制方式">
          <div className="copy-confirm-dialog">
            <button type="button" className="copy-confirm-close" onClick={() => setCopyConfirmOpen(false)} aria-label="取消复制">×</button>
            <h2>当前已有计划</h2>
            <p>要覆盖当天计划吗？</p>
            <div className="copy-confirm-actions">
              <button type="button" onClick={() => void copyPlansFromDate("append")} disabled={copying}>不覆盖，只增加</button>
              <button type="button" className="is-danger" onClick={() => void copyPlansFromDate("replace")} disabled={copying}>覆盖当天计划</button>
            </div>
          </div>
        </div>
      )}
      <BackToTopButton />
    </section>
  );
}
