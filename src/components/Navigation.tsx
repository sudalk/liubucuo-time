import type { Route } from "../stores/route";

interface TopBarProps {
  route: Route;
  onNavigate: (route: Route) => void;
  dateText: string;
}

/** 计划页顶部遗留组件，保留给桌面兼容。 */
export function TopBar({ onNavigate, dateText }: TopBarProps) {
  return (
    <header className="sketch-top">
      <button className="top-link" onClick={() => onNavigate("plan")}>
        今日计划
      </button>
      <span className="sketch-date">{dateText}</span>
      <button className="top-link" onClick={() => onNavigate("settings")}>
        我的
      </button>
    </header>
  );
}

interface BottomNavProps {
  route: Route;
  onNavigate: (route: Route) => void;
}

type NavIcon = "plan" | "progress" | "home" | "analysis";

function NavGlyph({ kind }: { kind: NavIcon }) {
  if (kind === "plan") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 17h6" /></svg>;
  }
  if (kind === "progress") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V10M10 19V5M16 19v-7M22 19H2" /></svg>;
  }
  if (kind === "home") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v5l3 2M9 3h6M12 3v2" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6" /></svg>;
}

/** 底部主导航：计划、进展、主页、分析。 */
export function BottomNav({ route, onNavigate }: BottomNavProps) {
  const items: Array<{ key: Route; label: string; icon: NavIcon }> = [
    { key: "plan", label: "计划", icon: "plan" },
    { key: "home", label: "计时", icon: "home" },
    { key: "progress", label: "进展", icon: "progress" },
    { key: "analysis", label: "分析", icon: "analysis" }
  ];
  return (
    <nav className="bottom-app-nav" aria-label="主导航">
      {items.map((item) => (
        <button
          key={item.key}
          className={route === item.key ? "is-active" : ""}
          onClick={() => onNavigate(item.key)}
        >
          <span className="nav-icon"><NavGlyph kind={item.icon} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
