import http from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Temporary phone acceptance gateway. Keep it behind a trusted HTTPS tunnel.
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const host = "127.0.0.1";
function portFrom(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} 必须是 1–65535 之间的端口`);
  }
  return value;
}
const port = portFrom("GATEWAY_PORT", 8080);
const apiPort = portFrom("GATEWAY_API_PORT", 8000);
const distRoot = await realpath(path.join(projectRoot, "frontend", "dist"));
const indexFile = await realpath(path.join(distRoot, "index.html"));
if (!indexFile.startsWith(`${distRoot}${path.sep}`)) {
  throw new Error("构建首页必须位于 frontend/dist 内");
}
if (!(await stat(indexFile)).isFile())
  throw new Error("请先构建 frontend/dist");
const apiPaths =
  /^\/(email|chores|auth|dorms|duties|guest|notifications|push|health|docs|openapi\.json)(\/|$)/;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};
const hopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const pendingProxies = new Set();
let stopping = false;

function endJson(req, res, status, message, extra = {}) {
  if (res.destroyed) return;
  const body = JSON.stringify({ detail: { message } });
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

function filteredHeaders(headers) {
  const blocked = new Set(hopHeaders);
  for (const token of String(headers.connection ?? "").split(",")) {
    blocked.add(token.trim().toLowerCase());
  }
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase())),
  );
}

function proxy(req, res) {
  const headers = filteredHeaders(req.headers);
  delete headers.forwarded;
  headers.host = req.headers.host ?? `${host}:${port}`;
  headers["x-forwarded-host"] = headers.host;
  headers["x-forwarded-proto"] =
    req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  // Never forward a client-supplied address chain into the local API.
  headers["x-forwarded-for"] = req.socket.remoteAddress ?? host;
  const upstream = http.request(
    {
      hostname: host,
      port: apiPort,
      path: req.url,
      method: req.method,
      headers,
    },
    (response) => {
      const responseHeaders = filteredHeaders(response.headers);
      responseHeaders["cache-control"] = "no-store";
      responseHeaders["x-content-type-options"] = "nosniff";
      res.writeHead(response.statusCode ?? 502, responseHeaders);
      response.on("error", () => res.destroy());
      response.pipe(res);
    },
  );
  pendingProxies.add(upstream);
  upstream.once("close", () => pendingProxies.delete(upstream));
  upstream.setTimeout(20000, () =>
    upstream.destroy(new Error("upstream timeout")),
  );
  upstream.on("error", () => {
    if (!res.headersSent)
      endJson(req, res, 502, "暂时无法连接服务，请稍后重试");
    else res.destroy();
  });
  req.once("aborted", () => upstream.destroy());
  res.once("close", () => {
    if (!res.writableEnded) upstream.destroy();
  });
  req.pipe(upstream);
}

async function serve(req, res) {
  if (stopping) return endJson(req, res, 503, "服务正在重启，请稍后重试");
  const rawPath = String(req.url ?? "").split("?")[0];
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) {
    return endJson(req, res, 400, "请求路径无效");
  }
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    return endJson(req, res, 400, "请求路径无效");
  }
  if (pathname.includes("\\") || pathname.includes("\0")) {
    return endJson(req, res, 400, "请求路径无效");
  }
  if (pathname.split("/").some((segment) => segment.startsWith("."))) {
    return endJson(req, res, 403, "无法访问此路径");
  }
  if (apiPaths.test(pathname)) return proxy(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    return endJson(req, res, 405, "此路径仅支持 GET 和 HEAD", {
      Allow: "GET, HEAD",
    });
  }

  let filename = path.resolve(distRoot, `.${pathname}`);
  let metadata;
  try {
    filename = await realpath(filename);
    if (
      filename !== distRoot &&
      !filename.startsWith(`${distRoot}${path.sep}`)
    ) {
      return endJson(req, res, 403, "无法访问此路径");
    }
    metadata = await stat(filename);
    if (!metadata.isFile()) metadata = undefined;
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
  }
  if (!metadata) {
    // Resource requests must retain their 404 rather than receiving SPA HTML.
    if (
      path.extname(pathname) ||
      pathname === "/assets" ||
      pathname.startsWith("/assets/")
    ) {
      return endJson(req, res, 404, "资源不存在");
    }
    filename = indexFile;
    metadata = await stat(filename);
  }
  const cache =
    pathname.startsWith("/assets/") &&
    /-[A-Za-z0-9_-]{8,}\./.test(path.basename(filename))
      ? "public, max-age=31536000, immutable"
      : "no-cache";
  res.writeHead(200, {
    "Content-Type":
      contentTypes[path.extname(filename)] ?? "application/octet-stream",
    "Content-Length": metadata.size,
    "Last-Modified": metadata.mtime.toUTCString(),
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") return res.end();
  const stream = createReadStream(filename);
  stream.on("error", () => res.destroy());
  res.once("close", () => stream.destroy());
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  serve(req, res).catch(() => {
    if (!res.headersSent) endJson(req, res, 500, "服务暂时不可用，请稍后重试");
    else res.destroy();
  });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.on("error", (error) => {
  console.error(`验收网关启动失败：${error.code ?? "未知错误"}`);
  process.exitCode = 1;
});
server.listen(port, host, () =>
  console.log(
    `手机验收网关：http://${host}:${port}（仅供可信 HTTPS 隧道接入）`,
  ),
);
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => {
    for (const request of pendingProxies) request.destroy();
    server.closeAllConnections();
  }, 5000);
  timer.unref();
  server.close(() => clearTimeout(timer));
  server.closeIdleConnections();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
