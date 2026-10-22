import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../../frontend/node_modules/vite/dist/node/index.js";
import { createHarness } from "../../site/scripts/check-cloud-backend.mjs";
import { createCompanionRuntime } from "../companion-ai.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  front = path.join(root, "frontend");
export async function createConversationPreview({
  port = 0,
  host = "127.0.0.1",
} = {}) {
  const h = await createHarness(),
    counts = new Map();
  const room = await (
    await h.request("/guest/create", {
      method: "POST",
      data: {
        name: "隔离预览宿舍",
        nickname: "体验者",
        members: ["张三", "李四", "王五"],
      },
    })
  ).json();
  const people = [];
  for (const m of room.dorm.members) {
    const claim = await (
      await h.request("/chores/claim", {
        method: "POST",
        data: { invite_code: room.invite_code, nickname: m.nickname },
      })
    ).json();
    people.push({ ...m, token: claim.access_token });
  }
  for (const [i, person] of people.entries()) {
    const account = h.db.sqlite
      .prepare(
        "INSERT INTO email_accounts(email,mail_enabled_at,created_at) VALUES(?,?,?)",
      )
      .run(
        `preview-${i}@example.invalid`,
        new Date().toISOString(),
        new Date().toISOString(),
      ).lastInsertRowid;
    h.db.sqlite
      .prepare(
        "INSERT INTO email_members(account_id,user_id,dorm_id,bound_at) VALUES(?,?,?,?)",
      )
      .run(account, person.user_id, room.dorm.id, new Date().toISOString());
  }
  const board = async (p = people[0]) =>
    (
      await h.request(
        `/chores/board?invite_code=${room.invite_code}&member_id=${p.user_id}`,
        { token: p.token },
      )
    ).json();
  const water = (await board()).water_task;
  await h.request(`/chores/tasks/${water.id}/complete`, {
    method: "PATCH",
    token: people[0].token,
    data: {},
  });
  const seededHandoff = (await board()).water_handoff;
  const runtime = createCompanionRuntime(h.db, {
    config: {
      api_key: "isolated-preview-placeholder",
      base_url: "https://preview.invalid/v1",
      model: "isolated-preview",
    },
    env: h.env,
    autoStart: false,
    dispatch: (r) =>
      h.request(new URL(r.url).pathname + new URL(r.url).search, {
        token: people[0].token,
      }),
    fetcher: async () => {
      await new Promise((r) => setTimeout(r, 350));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                messages: ["这里是隔离预览环境。", "点“我要留言”就能试用。"],
                emotion: "10",
                reminder: null,
              }),
            },
          },
        ],
      });
    },
  });
  const filename = `conversation-preview-${process.pid}-${Math.random().toString(36).slice(2)}.vue`,
    generated = path.join(
      front,
      "node_modules/.dorm-preview-runtime",
      filename,
    );
  await fs.mkdir(path.dirname(generated), { recursive: true });
  await fs.writeFile(
    generated,
    `<script setup lang="ts">import{computed,ref}from'vue';import{useRoute}from'vue-router';import Stage from'/src/components/ScreenStage.vue';import Board from'/src/components/ChoreBoard.vue';import Nav from'/src/components/ChoreBottomNav.vue';import{provideSheetNavigation}from'/src/interaction/sheetNavigation';provideSheetNavigation();const route=useRoute(),section=computed(()=>route.path==='/water'?'water':route.path==='/calendar'?'calendar':'duty');const people=${JSON.stringify(people)},person=people[Math.min(people.length-1,Math.max(0,Number(new URLSearchParams(location.search).get('as'))||0))],started=ref(new URLSearchParams(location.search).has('start'));</script><template><section v-if="!started" class="preview-entry"><h1>交互预览</h1><p>全新隔离宿舍 · AI 为演示回复<br>不会发送真实邮件或系统通知</p><p>当前体验身份：{{person.nickname}}</p><button data-testid="preview-start" @click="started=true">开始体验</button></section><template v-else><Stage signed-in><main class="guest-page"><Board invite="${room.invite_code}" dorm-name="隔离预览宿舍" :member-id="person.user_id" :token="person.token" :demo="false" :section="section"/></main></Stage><Nav :section="section"/></template></template><style>.preview-entry{min-height:85dvh;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:24px;text-align:center;padding:24px;box-sizing:border-box}.preview-entry h1{font-size:32px}.preview-entry p{line-height:1.7}.preview-entry button{border:0;border-radius:24px;background:#111;color:#fff;min-height:52px;padding:12px 44px;font:inherit;transition:transform .25s}.preview-entry button:active{transform:scale(.96)}</style>`,
  );
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>轮到 · 隔离交互预览</title></head><body><div id="app"></div>${["rings", "emotions", "ball", "engine"].map((n) => `<script src="/vendor/emotion-ball/${n}.js"></script>`).join("")}<script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Badge,Button,Cell,CellGroup,Checkbox,Field,Form,Icon,Loading,Switch}from'vant';import Root from'/node_modules/.dorm-preview-runtime/${filename}';import'vant/es/badge/style/index.mjs';import'vant/es/button/style/index.mjs';import'vant/es/cell/style/index.mjs';import'vant/es/cell-group/style/index.mjs';import'vant/es/checkbox/style/index.mjs';import'vant/es/field/style/index.mjs';import'vant/es/form/style/index.mjs';import'vant/es/icon/style/index.mjs';import'vant/es/loading/style/index.mjs';import'vant/es/switch/style/index.mjs';import'vant/es/dialog/style/index.mjs';import'vant/es/toast/style/index.mjs';import'./src/theme.css';import'./src/screen.css';import'./src/style.css';import'./src/focus.css';import{installTheme}from'/src/interaction/theme';import{installInputMode}from'/src/interaction/inputMode';import{installNativeBack}from'/src/interactions/nativeBack';import{installMotionTokens}from'/src/interaction/motion';import{installPressFeedback}from'/src/interaction/pressFeedback';import{tilt}from'/src/interactions/tilt';installMotionTokens();installTheme();installPressFeedback();installInputMode();installNativeBack();${people.map((p) => `if(!localStorage.getItem('dorm-water-handoff-v2:${room.invite_code}:${p.user_id}'))localStorage.setItem('dorm-water-handoff-v2:${room.invite_code}:${p.user_id}',${JSON.stringify(JSON.stringify({ sequence: seededHandoff.sequence, id: seededHandoff.id, completedAt: Date.parse(seededHandoff.completed_at) }))});`).join("")}createApp(Root).use(createPinia()).use(Badge).use(Button).use(Cell).use(CellGroup).use(Checkbox).use(Field).use(Form).use(Icon).use(Loading).use(Switch).directive('tilt',tilt).use(createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]})).mount('#app');</script></body></html>`;
  let vite;
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://localhost");
      if (u.pathname === "/__preview/status") {
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            isolated: true,
            database: "in-memory",
            ai: "simulated",
            email: false,
            push: false,
          }),
        );
      }
      if (
        /^\/(?:email|guest|auth|dorms|duties|notifications|push|health|docs|openapi\.json)(?:\/|$)/.test(
          u.pathname,
        )
      ) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: { message: "隔离预览不连接账号与发信服务" },
          }),
        );
      }
      if (u.pathname.startsWith("/chores/")) {
        const key = `${req.method} ${u.pathname}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        const chunks = [];
        for await (const b of req) chunks.push(b);
        const body = chunks.length
          ? Buffer.concat(chunks).toString()
          : undefined;
        const request = new Request(
          "https://preview.invalid" + u.pathname + u.search,
          {
            method: req.method,
            headers: req.headers,
            ...(body ? { body } : {}),
          },
        );
        const response = u.pathname.startsWith("/chores/companion/")
          ? await runtime.route(request)
          : await h.request(u.pathname + u.search, {
              method: req.method,
              token: req.headers.authorization?.replace(/^Bearer /, ""),
              ...(body ? { data: JSON.parse(body) } : {}),
            });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      if (["/", "/water", "/calendar"].includes(u.pathname)) {
        res.setHeader("Content-Type", "text/html");
        return res.end(
          await vite.transformIndexHtml("/index.html", html, req.url),
        );
      }
      vite.middlewares(req, res, () => {
        res.writeHead(404);
        res.end("preview resource missing");
      });
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "隔离预览请求失败" } }));
      console.error(error.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  vite = await createServer({
    root: front,
    configFile: path.join(front, "vite.config.ts"),
    appType: "custom",
    base: "/",
    server: {
      middlewareMode: true,
      // Acceptance previews are frozen snapshots. Other regression fixtures in
      // frontend/ must not reload an emulator halfway through a conversation.
      watch: null,
      hmr: { server, clientPort: server.address().port },
      proxy: {},
      fs: { allow: [root, path.resolve(front, "node_modules")] },
    },
    define: { "import.meta.env.VITE_RELEASE_VERSION": JSON.stringify("") },
  });
  await vite.watcher.close();
  let closed = false;
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    port: server.address().port,
    h,
    room,
    people,
    board,
    counts,
    async close() {
      if (closed) return;
      closed = true;
      await runtime.close();
      await vite.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      h.close();
      await fs.rm(generated, { force: true });
    },
  };
}
