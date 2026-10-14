import http from "node:http";
import worker from "../site/worker/index.js";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";

// Isolated local preview of the exact bundled Worker, using a SQLite D1 shim.
// Hosted D1 is verified separately after publication.
const harness = await createHarness();
const waits = new Set();
const context = {
  waitUntil(promise) {
    const task = Promise.resolve(promise)
      .catch(() => {})
      .finally(() => waits.delete(task));
    waits.add(task);
  },
};
const demoResponse = await worker.fetch(
  new Request("http://127.0.0.1:8081/guest/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "6-402",
      nickname: "张同学",
      members: ["李同学", "王同学", "陈同学", "刘同学", "赵同学"],
    }),
  }),
  harness.env,
  context,
);
if (demoResponse.status !== 201) throw new Error("独立预览演示初始化失败");
harness.env.DEFAULT_DORM_INVITE_CODE = (await demoResponse.json()).invite_code;

const server = http.createServer(async (req, res) => {
  try {
    const bytes = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) {
        res.writeHead(413, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ detail: { message: "提交内容过长" } }));
        return;
      }
      bytes.push(chunk);
    }
    const body = !["GET", "HEAD"].includes(req.method)
      ? Buffer.concat(bytes)
      : undefined;
    const request = new Request(new URL(req.url, "http://127.0.0.1:8081"), {
      method: req.method,
      headers: req.headers,
      body,
    });
    const response = await worker.fetch(request, harness.env, context);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent)
      res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: { message: "本地预览处理失败" } }));
  }
});
server.listen(8081, "127.0.0.1", () =>
  console.log("Cloudflare Worker 本地预览：http://127.0.0.1:8081（隔离数据）"),
);
function close() {
  server.close(async () => {
    await Promise.all(waits);
    harness.close();
  });
  server.closeIdleConnections();
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
