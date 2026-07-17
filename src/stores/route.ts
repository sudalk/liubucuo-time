import { create } from "zustand";

export type Route = "home" | "plan" | "progress" | "analysis" | "reflections" | "settings" | "profile" | "time-need" | "login";

interface RouteState {
  route: Route;
  navigate: (route: Route) => void;
}

export const useRouteStore = create<RouteState>((set) => ({
  route: "home",
  navigate: (route) => {
    set({ route });
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }
}));
