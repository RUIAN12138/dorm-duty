import "./build-push-runtime.mjs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(
  siteRoot,
  process.env.DORM_FRONTEND_DIST || "../frontend/dist",
);
const workerOutput = resolve(
  siteRoot,
  process.env.DORM_WORKER_OUTPUT || "worker/index.js",
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
const assets = {};
let totalBytes = 0;

async function collect(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name, "en"),
  );
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.endsWith(".map")) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("不允许嵌入符号链接资源");
    if (entry.isDirectory()) {
      await collect(path);
    } else if (entry.isFile()) {
      const type = types[extname(entry.name).toLowerCase()];
      if (!type) throw new Error(`未声明资源类型：${entry.name}`);
      const bytes = await readFile(path);
      assets[`/${relative(frontendRoot, path).split("\\").join("/")}`] = {
        type,
        base64: bytes.toString("base64"),
      };
      totalBytes += bytes.length;
    }
  }
}

await collect(frontendRoot);
const manifest = JSON.parse(
  await readFile(join(frontendRoot, "manifest.webmanifest"), "utf8"),
);
const workerScope = manifest.scope || "/";
if (
  !assets["/index.html"] ||
  !assets["/sw.js"] ||
  !assets["/manifest.webmanifest"]
)
  throw new Error("请先构建包含首页、Service Worker 和 Manifest 的前端");

const runtime = String.raw`
const decodedAssets = new Map();
const apiRoute = /^\/(?:auth|dorms|duties|guest|chores|notifications|push|health|docs)(?:\/|$)|^\/openapi\.json$/;

function safePath(pathname) {
  let path;
  try { path = decodeURIComponent(pathname); } catch { return null; }
  if (/[\u0000-\u001f\u007f\\%]/.test(path) || path.includes("//")) return null;
  if (path.split("/").some((part) => part === "." || part === "..")) return null;
  return path;
}

function staticResponse(path, method) {
  const asset = ASSETS[path];
  if (!decodedAssets.has(path)) decodedAssets.set(path, Uint8Array.from(atob(asset.base64), (character) => character.charCodeAt(0)));
  const bytes = decodedAssets.get(path);
  const immutable = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(path);
  const headers = {
    "Content-Type": asset.type,
    "Content-Length": String(bytes.length),
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (path === "/sw.js") headers["Service-Worker-Allowed"] = SERVICE_WORKER_SCOPE;
  return new Response(method === "HEAD" ? null : bytes, { headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = safePath(url.pathname);
    if (path === null) return new Response(JSON.stringify({detail:{code:"invalid_path",message:"访问路径无效"}}), {status:400,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
    if (apiRoute.test(path)) return handleApi(request, env, ctx);
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("不支持此请求方式", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
    if (Object.hasOwn(ASSETS, path)) return staticResponse(path, request.method);
    const lastPart = path.split("/").pop();
    if (path === "/assets" || path.startsWith("/assets/") || lastPart.includes("."))
      return new Response(request.method === "HEAD" ? null : "资源不存在", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
    return staticResponse("/index.html", request.method);
  },
};
`;

const result = await build({
  stdin: {
    contents: `import { handleApi } from "./backend.mjs";\nconst ASSETS = ${JSON.stringify(assets)};\nconst SERVICE_WORKER_SCOPE = ${JSON.stringify(workerScope)};\n${runtime}`,
    sourcefile: "site-entry.js",
    resolveDir: join(siteRoot, "worker"),
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  logLevel: "silent",
});
await mkdir(dirname(workerOutput), { recursive: true });
await writeFile(workerOutput, result.outputFiles[0].text);

console.log(
  `已嵌入 ${Object.keys(assets).length} 个前端资源，原始 ${totalBytes} 字节`,
);
