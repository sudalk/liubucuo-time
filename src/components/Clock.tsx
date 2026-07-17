import { useEffect, useState } from "react";
import { formatDurationSeconds, timeText } from "../lib/time";

interface ClockProps {
  isActive: boolean;
  eventName: string;
  startUtc: string | null;
  buttonLabel: string;
  buttonDisabled: boolean;
  onButtonClick: () => void;
}

/**
 * 钟表计时器：数字计时保持秒级更新，表针作为分钟指针每分钟推进一次。
 */
export function Clock({
  isActive,
  eventName,
  startUtc,
  buttonLabel,
  buttonDisabled,
  onButtonClick
}: ClockProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isActive || !startUtc) {
      setSeconds(0);
      return;
    }
    const start = new Date(startUtc).getTime();
    let frame = 0;
    let lastSecond = -1;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const nextSecond = Math.max(0, Math.floor((Date.now() - start) / 1000));
      // Android WebView 会节流 setInterval；用动画帧持续校时，但只有秒数变化才触发 React 渲染。
      if (nextSecond !== lastSecond) {
        lastSecond = nextSecond;
        setSeconds(nextSecond);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [isActive, startUtc]);

  const minuteAngle = (Math.floor(seconds / 60) % 60) * 6;
  const ticks = Array.from({ length: 60 }, (_, i) => i);

  return (
    <section className="clock-section" aria-label="计时器">
      <div
        className={`clock-face${isActive ? " is-running" : ""}`}
        style={{ ["--minutes-angle" as string]: `${minuteAngle}deg` }}
      >
        {ticks.map((i) => (
          <i
            key={i}
            className={`clock-tick${i % 5 === 0 ? " major" : ""}`}
            style={{ ["--tick" as string]: `${i * 6}deg` }}
          />
        ))}
        <span className="clock-number n0">00</span>
        <span className="clock-number n15">15</span>
        <span className="clock-number n30">30</span>
        <span className="clock-number n45">45</span>
        <i className="clock-hand" style={{ transform: `rotate(${minuteAngle}deg)` }} />
        <div className="clock-core">
          <span className="timer-label">{isActive ? eventName : "开始"}</span>
          <strong className="timer-value">{formatDurationSeconds(seconds)}</strong>
          <span className="timer-since">
            {isActive && startUtc ? `从 ${timeText(startUtc)} 开始` : "选择事件后点击开始"}
          </span>
          <button
            className={`record-button${isActive ? " is-running" : ""}`}
            disabled={buttonDisabled}
            onClick={onButtonClick}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
