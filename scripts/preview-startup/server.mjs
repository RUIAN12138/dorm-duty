// Local-only disposable SQLite; never forwards to production or AI providers.
import http from "node:http";
import { createServer } from "../../frontend/node_modules/vite/dist/node/index.js";
import { createHarness } from "../../site/scripts/check-cloud-backend.mjs";
const h = await createHarness();
const room = await (
  await h.request("/guest/create", {
    method: "POST",
    data: {
      name: "启动隔离预览",
      nickname: "体验者",
      members: ["小林", "小陈"],
    },
  })
).json();
const member = room.dorm.members[0];
const claim = await (
  await h.request("/chores/claim", {
    method: "POST",
    data: { invite_code: room.invite_code, nickname: member.nickname },
  })
).json();
let entry = {
  id: room.dorm.id,
  name: "启动隔离预览",
  invite_code: room.invite_code,
  member_id: member.user_id,
  nickname: member.nickname,
  marker_id: member.marker_id,
  is_creator: false,
};
let currentToken = claim.access_token;
let logged = true;
const api = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString();
    if (u.pathname === "/__preview/logout") {
      logged = false;
      res.end("模拟邮箱已退出，刷新预览页即可；不影响正式账号");
      return;
    }
    if (u.pathname === "/__preview/login") {
      logged = true;
      res.end("模拟邮箱已恢复，刷新预览页即可");
      return;
    }
    if (u.pathname.startsWith("/email/")) {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          u.pathname === "/email/config"
            ? { available: true, registration_required: true }
            : u.pathname === "/email/me"
              ? {
                  logged_in: logged,
                  email: logged ? "preview@example.invalid" : "",
                  rooms: logged ? [entry] : [],
                }
              : u.pathname === "/email/enter"
                ? { ...entry, access_token: currentToken }
                : {},
        ),
      );
      return;
    }
    if (u.pathname.startsWith("/chores/companion/")) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "此启动预览未连接AI" } }));
      return;
    }
    const response = await h.request(u.pathname + u.search, {
      method: req.method,
      token: req.headers.authorization?.replace(/^Bearer /, ""),
      ...(body ? { data: JSON.parse(body) } : {}),
    });
    const text = await response.text();
    if (u.pathname === "/guest/create" && response.ok) {
      const created = JSON.parse(text);
      const user = created.dorm.members.find(
        (m) => m.user_id === created.member_id,
      );
      entry = {
        id: created.dorm.id,
        name: created.dorm.name,
        invite_code: created.invite_code,
        member_id: created.member_id,
        nickname: user.nickname,
        marker_id: user.marker_id,
        is_creator: true,
      };
      currentToken = created.access_token;
    }
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(text);
  } catch {
    res.writeHead(500);
    res.end("{}");
  }
});
const apiPort = Number(process.env.DORM_PREVIEW_API_PORT || 8096);
await new Promise((r) => api.listen(apiPort, "127.0.0.1", r));
process.env.DORM_API_ORIGIN = `http://127.0.0.1:${apiPort}`;
const previewPort = Number(process.env.DORM_PREVIEW_PORT || 8094);
const vite = await createServer({
  root: process.cwd() + "/frontend",
  configFile: process.cwd() + "/frontend/vite.config.ts",
  server: { port: previewPort, host: "127.0.0.1", strictPort: true },
});
await vite.listen();
console.log(
  `隔离启动预览 http://127.0.0.1:${previewPort}/ · 临时SQLite/合成身份/无真实邮件或AI`,
);
async function close() {
  await vite.close();
  api.close();
  h.close?.();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
