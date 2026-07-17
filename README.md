# 柳不匆 (lbc)

个人活动记录产品 — 网页版先行，后续 Capacitor 打包 Android。

## 快速开始

### 1. 安装依赖

```bash
cd lbc
pnpm install
```

### 2. 配置本地密钥

复制 `.dev.vars.example` 为 `.dev.vars`，填入从 `hb_agent` 项目复制的 key：

```bash
cp .dev.vars.example .dev.vars
```

需要填：
- `AUTH_SECRET` — 本项目独立密钥，随便生成一个长字符串
- `RESEND_API_KEY` — 从 `/Users/likang/geminicode/xy/hb_agent/.dev.vars` 复制
- `OPENAI_CHAT_API_KEY` — 同上

### 3. 初始化本地 D1 数据库

```bash
# 应用 schema 迁移到本地 D1（wrangler dev 用的是 .wrangler/state 下的本地 D1）
npx wrangler d1 migrations apply lbc-db --local
```

### 4. 启动开发服务器

```bash
pnpm dev
```

会同时起：
- Vite 前端：`http://localhost:5173`
- Wrangler worker：`http://localhost:8787`（本地 D1/KV/R2）

浏览器打开 `http://localhost:5173`。Vite 把 `/api/*` 代理到 worker。

## 部署到 Cloudflare

> ⚠️ 部署前请先完成 `TECH.md` 第 14 节的清单。

```bash
# 1. 创建资源（一次性）
npx wrangler d1 create lbc-db
npx wrangler r2 bucket create lbc-uploads
npx wrangler kv namespace create KV
# 把返回的 ID 填进 wrangler.jsonc

# 2. 应用远程 schema
npx wrangler d1 migrations apply lbc-db --remote

# 3. 设置 secrets
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put OPENAI_CHAT_API_KEY

# 4. 部署
pnpm deploy
```

部署后访问 `https://lbc.myelephantgo.xyz`（DNS 配置后生效，配置前用 `workers.dev` 子域）。

## 项目结构

```
lbc/
├── src/                    # React 前端（Vite）
│   ├── pages/              # 主页/计划/进展/分析/设置/登录
│   ├── components/         # Clock / StatusTrack / BubbleCloud / Layout / Nav
│   ├── stores/             # Zustand：timer / auth / route / toast
│   ├── api/                # fetch 封装
│   ├── lib/                # eventColor / time 工具
│   └── styles/             # 迁自原型的 styles.css
├── worker/                 # Hono 后端
│   ├── index.ts            # 入口，挂载路由 + 静态资源
│   ├── schema.ts           # Drizzle 表定义
│   ├── types.ts            # Cloudflare 环境绑定类型
│   ├── middleware/         # 认证中间件
│   ├── routes/             # auth / records / plans / events / ai
│   └── lib/                # db / session / code / email / llm / utils
├── migrations/             # D1 SQL 迁移
├── public/                 # 静态资源 + PWA manifest
├── wrangler.jsonc          # Cloudflare 配置（复用 hb_agent 的 account_id + 模式）
├── vite.config.ts          # Vite + PWA
├── tailwind.config.ts      # 扩展 DESIGN.md token
└── package.json
```

## 已实现

- 邮箱验证码登录（Resend 发码 + HMAC session cookie）
- 主页：钟表计时器 + 连续状态进度 + 历史事件泡泡 + 开始/结束
- 计划页：日期切换 + 插入/删除计划行（行内编辑和双列滚轮下一版）
- 进展页：按日期查看时间记录（修改和对比下一版）
- 分析页：AI 日关键词生成（周总结、周期分析下一版）
- 设置页：账号、AI 授权、数据导出、提醒
- D1 数据模型（10 张表，预留 user_id + 双时区字段）
- PWA manifest（可装到手机主屏）

## 待完善

- 计划页行内编辑 + 双列时间滚轮
- 进展页修改态 + 计划对比
- 分析页时间统计、状态统计、周期对比、感悟输入
- AI 周总结、周期分析
- 头像上传到 R2
- 数据导入、清除 AI 内容
- 离线缓存（IndexedDB / Dexie）
