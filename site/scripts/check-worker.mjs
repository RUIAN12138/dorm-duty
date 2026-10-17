import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { default: worker } = await import(
  pathToFileURL(
    resolve(siteRoot, process.env.DORM_WORKER_INPUT || "worker/index.js"),
  ).href
);
const frontendRoot = resolve(
  siteRoot,
  process.env.DORM_FRONTEND_DIST || "../frontend/dist",
);
const siteOrigin = "https://dorm.example.site";
const env = {};
const originalFetch = globalThis.fetch;
const request = (path, options) => new Request(siteOrigin + path, options);
const call = (path, options, bindings = env) =>
  worker.fetch(request(path, options), bindings);
let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

async function assetChecks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.endsWith(".map")) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await assetChecks(file);
    else if (entry.isFile()) {
      const path = "/" + relative(frontendRoot, file).split("\\").join("/");
      const [expected, response] = await Promise.all([
        readFile(file),
        call(path),
      ]);
      check(response.status === 200, `静态资源状态 ${path}`);
      check(
        Buffer.from(await response.arrayBuffer()).equals(expected),
        `资源字节一致 ${path}`,
      );
      check(
        Number(response.headers.get("Content-Length")) === expected.length,
        `资源长度 ${path}`,
      );
      const head = await call(path, { method: "HEAD" });
      check(
        head.status === 200 && (await head.text()) === "",
        `静态 HEAD ${path}`,
      );
      if (path.startsWith("/assets/"))
        check(
          response.headers.get("Cache-Control").includes("immutable"),
          `hash 资源缓存 ${path}`,
        );
      else
        check(
          response.headers.get("Cache-Control") === "no-cache",
          `入口缓存 ${path}`,
        );
    }
  }
}

try {
  globalThis.fetch = () => {
    throw new Error("静态路径不应访问上游");
  };
  await assetChecks(frontendRoot);
  for (const path of ["/", "/login?next=%2F", "/schedule", "/dorm/settings"])
    check(
      (await (await call(path)).text()).includes("轮到 · 宿舍值日"),
      `SPA ${path}`,
    );
  for (const path of [
    "/assets/missing.js",
    "/assets/missing",
    "/missing.png",
    "/.env",
  ])
    check((await call(path)).status === 404, `缺失静态 404 ${path}`);
  for (const path of [
    "/%ZZ",
    "/auth/%2e%2e%2fme",
    "/%252e%252e/x",
    "/x%5cy",
    "//auth/me",
    "/x%00",
  ])
    check((await call(path)).status === 400, `坏路径防护 ${path}`);
  const disallowed = await call("/login", { method: "POST", body: "{}" });
  check(
    disallowed.status === 405 &&
      disallowed.headers.get("Allow") === "GET, HEAD",
    "静态 405",
  );
  for (const path of [
    "/health",
    "/guest/dorm",
    "/chores/board",
    "/chores/claim",
    "/auth/me",
    "/duties",
    "/notifications",
  ]) {
    const response = await call(path);
    check(response.status === 503, `无数据库绑定时 API 不回退到 Mac ${path}`);
    check(
      response.headers.get("Cache-Control") === "no-store",
      `API 无缓存 ${path}`,
    );
  }
  const { createHarness } = await import("./check-cloud-backend.mjs");
  const harness = await createHarness();
  try {
    const health = await call("/health", undefined, harness.env);
    check(health.status === 200, "同一 Worker 直接查询持久数据库");
    const body = await health.json();
    check(
      body.runtime === "cloudflare-worker" && body.storage === "d1",
      "云端运行和数据存储标记",
    );
    check(
      (await call("/dorms/current", undefined, harness.env)).status === 401,
      "匿名管理仍被拒绝",
    );
    check(
      (await call("/guest/dorm", undefined, harness.env)).status === 400,
      "默认演示未配置时不猜测宿舍",
    );
    const creation = await call(
      "/guest/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Worker路由验收",
          nickname: "验收甲",
          members: ["验收乙"],
        }),
      },
      harness.env,
    );
    check(creation.status === 201, "免账号创建路由");
    const created = await creation.json();
    harness.env.DEFAULT_DORM_INVITE_CODE = created.invite_code;
    check(
      (await call("/guest/dorm", undefined, harness.env)).status === 400,
      "未提供邀请码时默认正式宿舍不能暴露成员",
    );
    const room = await (
      await call(
        `/guest/dorm?invite_code=${created.invite_code}`,
        undefined,
        harness.env,
      )
    ).json();
    check(
      room.id === created.dorm.id && room.members.length === 0,
      "邀请码仅返回宿舍概要，不暴露名单",
    );
    const own = await (
      await call(
        `/guest/tasks?invite_code=${created.invite_code}&member_id=${created.member_id}`,
        { headers: {Authorization: `Bearer ${created.access_token}`} },
        harness.env,
      )
    ).json();
    check(own.today_task?.can_complete === false, "选成员不授予写入权限");
    check(
      (
        await call(
          `/duties/${own.today_task.id}/complete`,
          { method: "PATCH" },
          harness.env,
        )
      ).status === 401,
      "匿名打卡不得绕过管理认证",
    );
  } finally {
    harness.close();
  }
  console.log(
    `Worker 检查通过：${assertions} 项断言，全部正式资源字节一致，无上游 API 请求`,
  );
} finally {
  globalThis.fetch = originalFetch;
}
