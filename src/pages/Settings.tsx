import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../stores/auth";
import { useToastStore } from "../stores/toast";
import { confirmAction } from "../stores/confirm";
import { useRouteStore } from "../stores/route";
import { api } from "../api/client";

type ReminderKey = "longTimer" | "dailyReview" | "weeklyReview";
type ReminderPreferences = Record<ReminderKey, boolean>;

const REMINDER_KEY = "lbc-reminder-preferences";
const DEFAULT_REMINDERS: ReminderPreferences = { longTimer: true, dailyReview: false, weeklyReview: true };

function loadReminderPreferences(): ReminderPreferences {
  try {
    return { ...DEFAULT_REMINDERS, ...JSON.parse(localStorage.getItem(REMINDER_KEY) ?? "{}") };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export function Settings({ profileOnly = false }: { profileOnly?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const init = useAuthStore((s) => s.init);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useRouteStore((s) => s.navigate);
  const showToast = useToastStore((s) => s.show);

  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "");
  const [aiAuthorized, setAiAuthorized] = useState(user?.aiAuthorized ?? true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [reminders, setReminders] = useState<ReminderPreferences>(loadReminderPreferences);
  const fileRef = useRef<HTMLInputElement>(null);

  // 浏览器时区，作为默认值
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    setNickname(user?.nickname ?? "");
    setTimezone(user?.timezone ?? "");
    setAiAuthorized(user?.aiAuthorized ?? true);
  }, [user]);

  const refreshAvatar = async () => {
    try {
      const blob = await api.getBlob("/api/upload/avatar");
      const nextUrl = URL.createObjectURL(blob);
      setAvatarUrl((previous) => {
        if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
        return nextUrl;
      });
    } catch {
      setAvatarUrl(null);
    }
  };

  // 头像加载，走统一 API 客户端，Android 会自动携带本地保存的登录令牌。
  useEffect(() => {
    void refreshAvatar();
    return () => {
      setAvatarUrl((previous) => {
        if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
        return null;
      });
    };
    // refreshAvatar 只依赖稳定 API 客户端，登录用户变化时重新读取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const saveProfile = async () => {
    try {
      await api.patch("/api/profile/personal", { nickname, timezone, aiAuthorized });
      await init();
      showToast("已保存");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    }
  };

  const toggleAi = async () => {
    const next = !aiAuthorized;
    setAiAuthorized(next);
    try {
      await api.patch("/api/profile/personal", { aiAuthorized: next });
      await init();
      showToast(next ? "AI 数据授权已开启" : "AI 数据授权已关闭");
    } catch (err) {
      setAiAuthorized(!next);
      showToast(err instanceof Error ? err.message : "切换失败");
    }
  };

  const handleAvatarSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      showToast("请选择 PNG、JPEG 或 WebP 图片");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("图片请控制在 10MB 以内");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropSource(typeof reader.result === "string" ? reader.result : null);
      setCropScale(1);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const uploadCroppedAvatar = async () => {
    if (!cropSource) return;
    setUploadingAvatar(true);
    try {
      const image = new Image();
      image.src = cropSource;
      await image.decode();
      const sourceSide = Math.min(image.naturalWidth, image.naturalHeight) / cropScale;
      const sourceX = (image.naturalWidth - sourceSide) / 2;
      const sourceY = (image.naturalHeight - sourceSide) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("图片剪裁初始化失败");
      context.drawImage(image, sourceX, sourceY, sourceSide, sourceSide, 0, 0, 512, 512);
      const avatarBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片剪裁失败")), "image/jpeg", 0.9);
      });
      const form = new FormData();
      form.append("file", avatarBlob, "avatar.jpg");
      await api.upload("/api/upload/avatar", form);
      setCropSource(null);
      showToast("头像已更新");
      await refreshAvatar();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const toggleReminder = (key: ReminderKey) => {
    setReminders((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem(REMINDER_KEY, JSON.stringify(next));
      return next;
    });
    showToast("提醒偏好已保存");
  };

  const handleExport = async () => {
    try {
      // 走统一客户端，Android 也会携带本机 Bearer 会话。
      const data = await api.get<unknown>("/api/data/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lbc-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("已导出 JSON");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "导出失败");
    }
  };

  const handleClearAi = async () => {
    if (!(await confirmAction("清除所有 AI 生成的总结内容？你的感悟和记录会保留。"))) return;
    try {
      await api.post("/api/data/clear-ai", {});
      showToast("AI 内容已清除");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "清除失败");
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast("已登出");
  };

  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <section className="sketch-screen settings-screen" aria-label="设置页">
      <div className="sketch-content">
        <div className="page-head">
          <div>
            <p className="eyebrow">{profileOnly ? "个人信息" : "我的"}</p>
            <h1>{profileOnly ? "个人资料" : "偏好与数据"}</h1>
            <p className="subtle">{profileOnly ? "管理头像、昵称与时区。" : "管理 AI 授权、提醒与数据。"}</p>
          </div>
        </div>

        {profileOnly && <section className="setting-section">
          <h2 style={{ margin: "0 0 6px" }}>账号</h2>
          <p className="subtle" style={{ margin: "0 0 14px" }}>
            当前登录：<strong>{user?.email ?? "未知"}</strong>
          </p>

          <div className="profile-field">
            <label>头像</label>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="avatar-preview">
                {avatarUrl ? <img src={avatarUrl} alt="头像" /> : initial}
              </div>
              <button className="btn btn-soft" onClick={() => fileRef.current?.click()}>
                上传头像
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={handleAvatarSelection}
              />
            </div>
            <small className="subtle">支持 PNG/JPEG/WebP，最大 2MB。</small>
          </div>

          <div className="profile-field">
            <label htmlFor="nickname">昵称</label>
            <input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="给自己起个名字"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="timezone">时区</label>
            <input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder={browserTimezone}
            />
            <small className="subtle">默认使用浏览器时区（{browserTimezone}）。</small>
          </div>

          <button className="btn btn-primary" onClick={saveProfile}>保存</button>
        </section>}

        {!profileOnly && <>
        <section className="setting-section">
          <h2 style={{ margin: "0 0 6px" }}>AI 数据授权</h2>
          <p className="subtle" style={{ margin: 0 }}>
            授权后，AI 调用使用你的时间记录和感悟生成关键词、总结和分析。数据不用于训练。
          </p>
          <div className="setting-row">
            <span>授权 AI 读取数据</span>
            <button
              className={`switch${aiAuthorized ? " is-on" : ""}`}
              onClick={toggleAi}
              aria-pressed={aiAuthorized}
              aria-label="切换 AI 数据授权"
            />
          </div>
        </section>

        <section className="setting-section">
          <h2 style={{ margin: "0 0 6px" }}>时间管理需求</h2>
          <p className="subtle" style={{ margin: "0 0 14px" }}>
            描述你的管理目标、场景、约束和希望改善的问题，AI 整理为结构化目标。
          </p>
          <button className="btn btn-soft" onClick={() => navigate("time-need")}>编辑时间管理需求</button>
        </section>

        <section className="setting-section">
          <h2 style={{ margin: "0 0 6px" }}>数据管理</h2>
          <div className="setting-row">
            <span>导出全部数据（JSON）</span>
            <button className="btn btn-soft" onClick={handleExport}>导出</button>
          </div>
          <div className="setting-row">
            <span>清除 AI 生成内容</span>
            <button className="btn btn-danger" onClick={handleClearAi}>清除</button>
          </div>
        </section>

        <section className="setting-section">
          <h2 style={{ margin: "0 0 6px" }}>提醒</h2>
          <div className="setting-row">
            <span>超长计时提醒（&gt;12 小时）</span>
            <button className={`switch${reminders.longTimer ? " is-on" : ""}`} onClick={() => toggleReminder("longTimer")} aria-pressed={reminders.longTimer} aria-label="切换超长计时提醒" />
          </div>
          <div className="setting-row">
            <span>日复盘提醒</span>
            <button className={`switch${reminders.dailyReview ? " is-on" : ""}`} onClick={() => toggleReminder("dailyReview")} aria-pressed={reminders.dailyReview} aria-label="切换日复盘提醒" />
          </div>
          <div className="setting-row">
            <span>周总结提醒</span>
            <button className={`switch${reminders.weeklyReview ? " is-on" : ""}`} onClick={() => toggleReminder("weeklyReview")} aria-pressed={reminders.weeklyReview} aria-label="切换周总结提醒" />
          </div>
          <small className="subtle">开关会保存在当前设备。系统通知服务接入后，将按这里的偏好发送。</small>
        </section>
        <section className="setting-section">
          <div className="setting-row">
            <span>登出当前账号</span>
            <button className="btn btn-soft" onClick={handleLogout}>登出</button>
          </div>
        </section>
        </>}
      </div>
      {cropSource && (
        <div className="avatar-crop-scrim" role="presentation" onMouseDown={() => !uploadingAvatar && setCropSource(null)}>
          <section className="avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="avatar-crop-title">调整头像</h2>
            <p>头像会裁成正方形，你可以放大调整取景范围。</p>
            <div className="avatar-crop-preview">
              <img src={cropSource} alt="头像裁剪预览" style={{ transform: `scale(${cropScale})` }} />
            </div>
            <label className="avatar-crop-zoom">缩放
              <input type="range" min="1" max="3" step="0.05" value={cropScale} onChange={(event) => setCropScale(Number(event.target.value))} />
            </label>
            <div className="avatar-crop-actions">
              <button className="btn btn-soft" disabled={uploadingAvatar} onClick={() => setCropSource(null)}>取消</button>
              <button className="btn btn-primary" disabled={uploadingAvatar} onClick={() => void uploadCroppedAvatar()}>{uploadingAvatar ? "上传中…" : "裁剪并上传"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
