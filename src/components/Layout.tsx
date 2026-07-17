import { useEffect, type ReactNode } from "react";
import { BottomNav } from "./Navigation";
import { type Route, useRouteStore } from "../stores/route";

interface LayoutProps {
  children: ReactNode;
}

/** 应用外壳：顶栏占位由各页自己渲染（原型里只有 home 有 sketch-top），底部导航统一 */
export function Layout({ children }: LayoutProps) {
  const route = useRouteStore((s) => s.route);
  const navigate = useRouteStore((s) => s.navigate);
  const isHome = route === "home";
  const pageTitle: Record<Exclude<Route, "home" | "login">, string> = {
    plan: "计划",
    progress: "进展",
    analysis: "分析",
    reflections: "一周总结",
    settings: "我的",
    profile: "个人信息",
    "time-need": "时间管理需求"
  };

  useEffect(() => {
    document.querySelector<HTMLElement>(".sketch-screen")?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [route]);

  return (
    <div className={`app-shell${isHome ? "" : " has-page-bar"}`}>
      {!isHome && (
        <header className="app-page-bar">
          <button className="app-home-button" onClick={() => navigate("home")} aria-label="返回主页">
            <span aria-hidden="true">‹</span>
            <b>返回</b>
          </button>
          <strong>{pageTitle[route as Exclude<Route, "home" | "login">]}</strong>
          <span className="app-page-bar-spacer" aria-hidden="true" />
        </header>
      )}
      <main id="main" className="main-view" tabIndex={-1}>
        <div className="screen-shell">{children}</div>
      </main>
      <BottomNav route={route} onNavigate={navigate} />
    </div>
  );
}
