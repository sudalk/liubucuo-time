import { useEffect, useState } from "react";
import { Clock } from "../components/Clock";
import { BubbleCloud } from "../components/BubbleCloud";
import { useTimerStore } from "../stores/timer";
import { useToastStore } from "../stores/toast";
import { useRouteStore } from "../stores/route";
import { useAuthStore } from "../stores/auth";
import { api, type EventItem } from "../api/client";
import { dateLabel } from "../lib/time";

// 状态三档：差 / 中 / 好，对应 statusProgress 30 / 60 / 90
const STATUS_LEVELS = [
  { label: "差", value: 30, color: "var(--coral)" },
  { label: "中", value: 60, color: "var(--apricot)" },
  { label: "好", value: 90, color: "var(--mint)" }
] as const;

export function Home() {
  const navigate = useRouteStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const {
    activeTimer,
    selectedEvent,
    statusProgress,
    loading,
    error,
    setSelectedEvent,
    setStatusProgress,
    patchStatus,
    fetchActive,
    start,
    stop
  } = useTimerStore();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    void fetchActive();
    void api
      .get<{ events: EventItem[] }>("/api/events")
      .then(({ events }) => setEvents(events))
      .catch((err) => showToast(err instanceof Error ? err.message : "加载事件失败"));
  }, [fetchActive, showToast]);

  useEffect(() => {
    let objectUrl: string | null = null;
    void api.getBlob("/api/upload/avatar")
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      })
      .catch(() => setAvatarUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.id]);

  const handleSelectEvent = (event: EventItem) => {
    setSelectedEvent(event);
    if (!activeTimer) showToast(`已选择 · ${event.name}`);
  };

  const handleToggle = async () => {
    if (activeTimer) {
      await stop();
      showToast("事件已结束并写入进展表");
    } else {
      if (!selectedEvent) {
        showToast("请先选择一个事件");
        return;
      }
      await start(selectedEvent.name);
      showToast(`开始记录：${selectedEvent.name}`);
    }
  };

  const handleStatusChange = (value: number) => {
    setStatusProgress(value);
    // 进行中的状态先立刻反映到时钟，再在后台写入活动计时器。
    if (activeTimer) void patchStatus();
  };

  const handleAddEvent = async () => {
    const name = newEventName.trim();
    if (!name) {
      setAddingEvent(false);
      return;
    }
    try {
      await api.post("/api/events", { eventName: name });
      const { events: updated } = await api.get<{ events: EventItem[] }>("/api/events");
      setEvents(updated);
      setNewEventName("");
      setAddingEvent(false);
      showToast(`已添加事件：${name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "添加失败");
    }
  };

  const handleDeleteEvent = async (event: EventItem) => {
    if (activeTimer?.eventName === event.name) {
      showToast("正在记录的事件不能删除");
      return;
    }
    try {
      await api.delete(`/api/events/${event.id}`);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      showToast(`已删除事件：${event.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败");
    }
  };

  const isActive = !!activeTimer;
  const buttonLabel = isActive ? "结束" : "开始计时";
  const buttonDisabled = loading || (!isActive && !selectedEvent);
  const avatarInitial = (user?.nickname ?? user?.email ?? "我").trim().charAt(0).toUpperCase() || "我";

  // 当前状态档位
  const currentLevel = STATUS_LEVELS.reduce((acc, l) =>
    Math.abs(l.value - statusProgress) < Math.abs(acc.value - statusProgress) ? l : acc
  );

  return (
    <section className="sketch-screen home-screen" aria-label="主页记录">
      <header className="home-sticky-bar">
        <button className="home-profile-button" onClick={() => navigate("profile")} aria-label="编辑个人信息">
          <span className="home-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : avatarInitial}</span>
          <span className="home-date">{dateLabel()}</span>
        </button>
        <button className="home-my-button" onClick={() => navigate("settings")} aria-label="打开我的">我的</button>
      </header>

      <div className="sketch-content">
        <Clock
          isActive={isActive}
          eventName={activeTimer?.eventName ?? selectedEvent?.name ?? ""}
          startUtc={activeTimer?.startUtc ?? null}
          buttonLabel={buttonLabel}
          buttonDisabled={buttonDisabled}
          onButtonClick={handleToggle}
        />

        {/* 状态三档 */}
        <section className="status-section" aria-label="状态">
          <div className="status-title">
            <span>状态</span>
          </div>
          <div className="status-track-three" role="group" aria-label="选择状态">
            {STATUS_LEVELS.map((level) => (
              <button
                key={level.label}
                className={`status-track-step${currentLevel.label === level.label ? " is-selected" : ""}`}
                style={{ ["--level-color" as string]: level.color }}
                onClick={() => handleStatusChange(level.value)}
              >
                <span>{level.label}</span>
              </button>
            ))}
          </div>
        </section>

        <BubbleCloud
          events={events}
          selectedName={activeTimer?.eventName ?? selectedEvent?.name ?? null}
          onSelect={(event) => handleSelectEvent(event as EventItem)}
          onAdd={() => setAddingEvent(true)}
          adding={addingEvent}
          newEventName={newEventName}
          onNewEventNameChange={setNewEventName}
          onAddConfirm={handleAddEvent}
          onAddCancel={() => { setAddingEvent(false); setNewEventName(""); }}
          onDelete={(event) => handleDeleteEvent(event as EventItem)}
        />

        {error && (
          <div className="login-error" style={{ marginTop: 18 }}>
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
