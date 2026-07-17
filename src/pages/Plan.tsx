import { useEffect, useState } from "react";
import { useToastStore } from "../stores/toast";
import { confirmAction } from "../stores/confirm";
import { api, type PlanItem } from "../api/client";
import { dateKey, pad } from "../lib/time";
import { BubbleCloud } from "../components/BubbleCloud";
import { AppTimePicker } from "../components/AppTimePicker";
import { SwipeDelete } from "../components/SwipeDelete";
import { RecordEditorSheet } from "../components/RecordEditorSheet";
import { DateNavigator } from "../components/DateNavigator";

interface HistoryEvent {
  id?: string;
  name: string;
  normalizedName: string;
  count?: number;
}

function durationToHours(m: number | null | undefined): string {
  const total = Math.max(1, Math.min(1439, m ?? 60));
  const h = total / 60;
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
  const [newDraft, setNewDraft] = useState<{ eventName: string; startHHMM: string; durationHHMM: string }>({
    eventName: "",
    startHHMM: "09:00",
    durationHHMM: "01:00"
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
      sortOrder: d.sortOrder ?? item.sortOrder
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
      sortOrder: d.sortOrder
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

  const startNewFromHistoryEvent = (eventName: string) => {
    // 和点击加号完全相同，只是预先填入事件名，仍需由用户确认时间与预计耗时。
    setEditingId(null);
    setNewDraft((current) => ({ ...current, eventName }));
    setAddingNew(true);
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
        sortOrder: plans.length
      });
      setAddingNew(false);
      setNewDraft({ eventName: "", startHHMM: "09:00", durationHHMM: "01:00" });
      await load();
      showToast("已添加");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "添加失败");
    }
  };

  const cancelNew = () => {
    setAddingNew(false);
    setNewDraft({ eventName: "", startHHMM: "09:00", durationHHMM: "01:00" });
  };

  return (
    <section className="sketch-screen plan-screen mobile-card-screen" aria-label="计划页">
      <div className="sketch-content">
        <DateNavigator value={date} onChange={setDate} />

        <section className="embedded-section">
          <div className="embedded-head">
            <div>
              <span className="module-kicker">当天安排</span>
              <h2>计划</h2>
            </div>
            <span className="count-pill">{plans.length} 条</span>
          </div>

          <div className="plan-card-list">
            {loading && <div className="embedded-empty">加载中…</div>}
            {!loading && plans.length === 0 && !addingNew && (
              <button className="inline-add-card" onClick={() => setAddingNew(true)}>
                <span>+</span>
                添加第一条计划
              </button>
            )}

            {plans.map((plan) => (
                <SwipeDelete key={plan.id} label="计划" onDelete={() => void deletePlan(plan.id)}>
                  <article className="mobile-plan-card" onClick={() => startEdit(plan)}>
                    <div className="card-time-rail">
                      <strong>{plan.plannedStartLocal?.slice(11, 16) ?? "待定"}</strong>
                      <span>{durationToHours(plan.estimatedMinutes)}</span>
                    </div>
                    <div className="card-main">
                      <b>{plan.eventName}</b>
                      <small>点击修改</small>
                    </div>
                  </article>
                </SwipeDelete>
            ))}

            {!addingNew && plans.length > 0 && (
              <button className="inline-add-card compact" onClick={() => setAddingNew(true)}>
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
        </RecordEditorSheet>
      )}
      {addingNew && (
        <RecordEditorSheet title="添加计划" onCancel={cancelNew} onSave={() => void saveNew()} saveLabel="添加计划">
          <input className="mobile-event-input" value={newDraft.eventName} onChange={(e) => setNewDraft({ ...newDraft, eventName: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void saveNew(); }} placeholder="事件名" autoFocus />
          <div className="mobile-time-grid">
            <AppTimePicker label="预计耗时" value={newDraft.durationHHMM} hourMin={0} hourMax={12} onChange={(value) => setNewDraft({ ...newDraft, durationHHMM: value })} />
            <AppTimePicker label="开始时间" value={newDraft.startHHMM} onChange={(value) => setNewDraft({ ...newDraft, startHHMM: value })} />
          </div>
        </RecordEditorSheet>
      )}
    </section>
  );
}
