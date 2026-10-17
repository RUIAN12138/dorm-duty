import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import worker from "../site/worker/index.js";
import pushRuntimeModule from "../site/runtime/push-runtime.cjs";
import emailRuntimeModule from "../site/runtime/email-runtime.cjs";
import { openDatabase, ensureLocalDemo } from "../site/local/database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const minimumNode = [22, 13, 0];
const currentNode = process.versions.node.split(".").map(Number);
const supportedNode =
  currentNode[0] > minimumNode[0] ||
  (currentNode[0] === minimumNode[0] && currentNode[1] > minimumNode[1]) ||
  (currentNode[0] === minimumNode[0] &&
    currentNode[1] === minimumNode[1] &&
    currentNode[2] >= minimumNode[2]);
if (!supportedNode)
  throw new Error(`正式 Web 链路要求 Node.js 22.13.0 或更新版本，当前为 ${process.version}`);
const deploymentMode = process.env.DORM_DEPLOYMENT || "local";
if (!new Set(["local", "server"]).has(deploymentMode))
  throw new Error("DORM_DEPLOYMENT 只允许 local 或 server");
const databasePath = path.resolve(
  process.env.DORM_LOCAL_DATABASE || path.join(root, "data/dorm-local.db"),
);
if (databasePath.includes("\u0000")) throw new Error("数据库路径无效");
const databaseId = createHash("sha256").update(databasePath).digest("hex");
const host = process.env.DORM_LOCAL_HOST || "0.0.0.0";
const port = Number(process.env.DORM_LOCAL_PORT ?? "8081");
const serverDeployment = deploymentMode === "server";
const webBase = process.env.DORM_WEB_BASE || "/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(webBase))
  throw new Error("DORM_WEB_BASE 必须是安全的 /路径/ 格式");
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("DORM_LOCAL_PORT 必须是 0 至 65535 的端口号");
const lockPath = databasePath + ".server-lock";
const lockId = randomBytes(16).toString("hex");
let db,
  ownsLock = false,
  server,
  closing = false,
  pushRuntime,
  emailRuntime,
  reminderScheduler;
const waits = new Set();

async function lockDatabase() {
  await fs.mkdir(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      ownsLock = true;
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, id: lockId }),
        );
      } finally {
        await handle.close();
      }
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let record;
      try {
        record = JSON.parse(await fs.readFile(lockPath, "utf8"));
      } catch {
        throw new Error("本地数据库启动锁无法读取，请确认没有另一实例正在启动");
      }
      if (
        !Number.isSafeInteger(record.pid) ||
        record.pid < 1 ||
        typeof record.id !== "string"
      )
        throw new Error("本地数据库启动锁无效，请先检查已有进程");
      try {
        process.kill(record.pid, 0);
      } catch (probe) {
        if (probe.code !== "ESRCH") throw probe;
        await fs.unlink(lockPath);
        continue;
      }
      throw new Error(
        "已有本地服务正在使用这个数据库，请打开现有网页或先停止原服务",
      );
    }
  }
  throw new Error("无法取得本地数据库启动锁");
}

async function release() {
  await reminderScheduler?.close();
  await Promise.allSettled(waits);
  await emailRuntime?.close();
  await pushRuntime?.close();
  db?.close();
  if (ownsLock) {
    try {
      const record = JSON.parse(await fs.readFile(lockPath, "utf8"));
      if (record.id === lockId) await fs.unlink(lockPath);
    } catch (error) {
      if (error.code !== "ENOENT")
        console.error("本地启动锁清理失败，请检查服务是否已经停止");
    }
    ownsLock = false;
  }
}

const ctx = {
  waitUntil(promise) {
    const task = Promise.resolve(promise)
      .catch(() => {})
      .finally(() => waits.delete(task));
    waits.add(task);
  },
};
const failure = (status, message) =>
  new Response(JSON.stringify({ detail: { message } }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

try {
  await lockDatabase();
  db = await openDatabase(databasePath);
  const env = { DB: db, DEFAULT_DORM_INVITE_CODE: ensureLocalDemo(db) };
  let emailConfig = null;
  try {
    emailConfig = await emailRuntimeModule.loadEmailConfig(
      path.dirname(databasePath),
    );
  } catch {
    console.error("邮件配置不可用，已有身份与站内提醒继续运行");
  }
  emailRuntime = emailRuntimeModule.createEmailRuntime(db, {
    config: emailConfig,
    base: webBase,
  });
  try {
    pushRuntime = await pushRuntimeModule.createPushRuntime(
      db,
      path.dirname(databasePath),
      { enabled: serverDeployment, base: webBase },
    );
    env.PUSH_CONFIG = pushRuntime.config;
    env.NATIVE_PUSH_CONFIG = pushRuntime.nativeConfig;
    env.PUSH_WAKE = pushRuntime.kick;
  } catch {
    console.error("系统通知暂不可用，站内提醒和任务服务继续运行");
    env.PUSH_CONFIG = { available: false, public_key: null };
  }
  reminderScheduler = pushRuntimeModule.createReminderScheduler(db, { env });
  server = http.createServer(async (req, res) => {
    try {
      if (closing) {
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify({
            detail: { message: "本地服务正在停止，请稍后重试" },
          }),
        );
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65_536) {
          const response = failure(413, "提交内容过长");
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
          return;
        }
        chunks.push(chunk);
      }
      const url = new URL(req.url, "http://127.0.0.1");
      if (webBase !== "/") {
        if (url.pathname === webBase.slice(0, -1)) url.pathname = "/";
        else if (url.pathname.startsWith(webBase))
          url.pathname = `/${url.pathname.slice(webBase.length)}`;
      }
      const requestHeaders = new Headers(req.headers);
      requestHeaders.delete("CF-Connecting-IP");
      // Strip caller-controlled values. A loopback reverse proxy may supply X-Real-IP.
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress,
      );
      requestHeaders.set(
        "X-Dorm-Client",
        serverDeployment && loopback
          ? String(req.headers["x-real-ip"] || req.socket.remoteAddress)
          : req.socket.remoteAddress || "unknown",
      );
      const request = new Request(url, {
        method: req.method,
        headers: requestHeaders,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      });
      let response = await emailRuntime.wrap(request, (next, emailCreator) =>
        worker.fetch(next, { ...env, EMAIL_CREATOR: emailCreator }, ctx),
      );
      if (url.pathname === "/health" && response.ok && req.method === "GET") {
        response = new Response(
          JSON.stringify({
            ...(await response.json()),
            application: serverDeployment ? "dorm-duty" : "dorm-duty-local",
            runtime: serverDeployment ? "node-server" : "node-worker-local",
            deployment_mode: deploymentMode,
            node_version: process.versions.node,
            web_base: webBase,
            storage: "sqlite",
            persistent: true,
            database_id: databaseId,
          }),
          { status: 200, headers: response.headers },
        );
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(
        req.method === "HEAD"
          ? undefined
          : Buffer.from(await response.arrayBuffer()),
      );
    } catch {
      if (!res.headersSent)
        res.writeHead(500, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
      res.end(
        JSON.stringify({ detail: { message: "本地服务处理失败，请重试" } }),
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const actualPort = server.address().port;
  console.log(
    `运行配置：模式=${deploymentMode}；Node=${process.version}；Web Base=${webBase}；数据库=${databasePath}`,
  );
  console.log(
    `轮到 · ${serverDeployment ? "服务器版" : "本地版"}：http://127.0.0.1:${actualPort}${webBase}`,
  );
  if (host === "0.0.0.0") {
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses || []) {
        if (
          address.family === "IPv4" &&
          !address.internal &&
          /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)
        )
          console.log(
            `同一 Wi-Fi 手机入口：http://${address.address}:${actualPort}/`,
          );
      }
    }
  }
  console.log(`数据保存在 ${databasePath}；停止服务后仍保留。Ctrl+C 停止。`);
  console.log(
    "LOCAL_READY " +
      JSON.stringify({
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}/`,
        persistent: true,
      }),
  );
} catch (error) {
  await release();
  console.error(
    error.code === "EADDRINUSE"
      ? `端口 ${port} 已被占用，请停止原服务或更换 DORM_LOCAL_PORT。`
      : String(error.message),
  );
  process.exitCode = 1;
}

async function stop() {
  if (closing || !server?.listening) return;
  closing = true;
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeIdleConnections();
  });
  await release();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
process.once("message", (message) => {
  if (message !== "shutdown") return;
  stop().then(() => process.disconnect?.());
});
