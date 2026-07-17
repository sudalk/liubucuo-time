import { useEffect } from "react";
import { Layout } from "./components/Layout";
import { Toast } from "./components/Toast";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { Plan } from "./pages/Plan";
import { Progress } from "./pages/Progress";
import { Analysis } from "./pages/Analysis";
import { Reflections } from "./pages/Reflections";
import { Settings } from "./pages/Settings";
import { TimeNeed } from "./pages/TimeNeed";
import { useAuthStore } from "./stores/auth";
import { useRouteStore } from "./stores/route";

export function App() {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const init = useAuthStore((s) => s.init);
  const route = useRouteStore((s) => s.route);

  useEffect(() => {
    void init();
  }, [init]);

  if (!initialized) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <p className="login-sub">加载中…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        <Toast />
        <ConfirmDialog />
      </>
    );
  }

  return (
    <>
      <Layout>
        {route === "home" && <Home />}
        {route === "plan" && <Plan />}
        {route === "progress" && <Progress />}
        {route === "analysis" && <Analysis />}
        {route === "reflections" && <Reflections />}
        {route === "settings" && <Settings />}
        {route === "profile" && <Settings profileOnly />}
        {route === "time-need" && <TimeNeed />}
      </Layout>
      <Toast />
      <ConfirmDialog />
    </>
  );
}
