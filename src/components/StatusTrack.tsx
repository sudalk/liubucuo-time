interface StatusTrackProps {
  value: number;
  onChange: (value: number) => void;
}

/**
 * 由细到粗的连续状态进度轨道
 * 基于 status-progress-shell + status-wedge
 */
export function StatusTrack({ value, onChange }: StatusTrackProps) {
  return (
    <section className="status-section" aria-label="状态进度">
      <div className="status-title">
        <span>状态进度</span>
        <strong>{value}</strong>
      </div>
      <div className="status-progress-shell" style={{ ["--status" as string]: `${value}%` }}>
        <div className="status-wedge" />
        <input
          aria-label="状态进度"
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </section>
  );
}
