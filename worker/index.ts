import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { HonoEnv } from "./types";
import { authMiddleware } from "./middleware/auth";
import authRoutes from "./routes/auth";
import recordsRoutes from "./routes/records";
import plansRoutes from "./routes/plans";
import eventsRoutes from "./routes/events";
import aiRoutes from "./routes/ai";
import reflectionsRoutes from "./routes/reflections";
import summariesRoutes from "./routes/summaries";
import profileRoutes from "./routes/profile";
import uploadRoutes from "./routes/upload";
import dataRoutes from "./routes/data";

const app = new Hono<HonoEnv>();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Lbc-Client"]
  })
);

// 健康检查
app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

// 认证中间件
app.use("/api/*", authMiddleware);

// API 路由
app.route("/api/auth", authRoutes);
app.route("/api/records", recordsRoutes);
app.route("/api/plans", plansRoutes);
app.route("/api/events", eventsRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/reflections", reflectionsRoutes);
app.route("/api/summaries", summariesRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/api/data", dataRoutes);

// 静态资源
app.all("*", (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
