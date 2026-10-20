import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("../", import.meta.url));
const action = process.argv[2] || "";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const minimumNode = [22, 13, 0];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertRuntime() {
  const current = process.versions.node.split(".").map(Number);
  const supported =
    current[0] > minimumNode[0] ||
    (current[0] === minimumNode[0] && current[1] > minimumNode[1]) ||
    (current[0] === minimumNode[0] &&
      current[1] === minimumNode[1] &&
      current[2] >= minimumNode[2]);
  if (!supported) fail(`Web 正式链路要求 Node.js 22.13.0 或更新版本，当前为 ${process.version}。`);
  if (!process.getBuiltinModule?.("node:sqlite")) {
    fail("当前 Node.js 不支持内置 SQLite，无法启动正式 Web 链路。");
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: process.platform === "win32" && command.endsWith(".cmd"),
  });
  if (result.error) {
    console.error(`无法运行 ${command}：${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function buildFrontend(output, { server = false, release = "" } = {}) {
  const args = ["run", "build", "--prefix", "frontend"];
  const env = {};
  if (release) env.DORM_RELEASE_NAME = release;
  args.push("--", "--outDir", output, "--emptyOutDir");
  if (server) {
    env.DORM_WEB_BASE = process.env.DORM_WEB_BASE || "/dorm-duty/";
  }
  return run(npm, args, { env });
}

function embed(frontend, worker) {
  return run(process.execPath, ["site/scripts/embed-frontend.mjs"], {
    env: { DORM_FRONTEND_DIST: frontend, DORM_WORKER_OUTPUT: worker },
  });
}

function build({ frontend, worker, server = false }) {
  const frontendStatus = buildFrontend(frontend, { server });
  if (frontendStatus !== 0) process.exit(frontendStatus);
  const workerStatus = embed(frontend, worker);
  if (workerStatus !== 0) process.exit(workerStatus);
}

const frontendStateScripts = [
  "scripts/check-companion-preview-check.mjs",
  "scripts/check-screen-gesture-check.mjs",
  "scripts/check-theme-check.mjs",
  "scripts/check-stats-palette.mjs",
  "scripts/check-emotion-integration.mjs",
  "scripts/check-api-transport.mjs",
  "scripts/check-water-handoff-receipts.mjs",
  "scripts/check-calendar-data.mjs",
  "scripts/check-background-refresh.mjs",
  "scripts/check-settings-save-lifecycle.mjs",
  "scripts/check-identity-races.mjs",
  "scripts/check-reminder-composer.mjs",
  "scripts/check-reminder-inbox.mjs",
  "scripts/check-reminder-banner.mjs",
  "scripts/check-navigation-components.mjs",
  "scripts/check-marker-editor.mjs",
  "scripts/check-completion-state.mjs",
  "scripts/check-history-mutation.mjs",
  "scripts/check-view-load.mjs",
  "scripts/check-push-identity.mjs",
];

const verificationScripts = [
  ...frontendStateScripts,
  "site/scripts/check-roommate-notes.mjs",
  "scripts/check-web-architecture.mjs",
  "site/scripts/check-worker.mjs",
  "site/scripts/check-cloud-backend.mjs",
  "site/scripts/check-chores.mjs",
  "site/scripts/check-rounds.mjs",
  "site/scripts/check-history.mjs",
  "site/scripts/check-recency.mjs",
  "site/scripts/check-email-accounts.mjs",
  "site/scripts/check-email-delivery.mjs",
  "site/scripts/check-email-entry-policy.mjs",
  "site/scripts/check-auth-boundaries.mjs",
  "site/scripts/check-email-unbind.mjs",
  "site/scripts/check-email-hardening.mjs",
  "site/scripts/check-round-order.mjs",
  "site/scripts/check-water-reassign.mjs",
  "site/scripts/check-undo.mjs",
  "site/scripts/check-native-push.mjs",
  "site/scripts/check-member-push.mjs",
  "site/scripts/check-scheduled-reminders.mjs",
  "site/scripts/check-reminder-runtime.mjs",
];

assertRuntime();

if (action === "dev") {
  build({
    frontend: resolve(root, "frontend/dist"),
    worker: resolve(root, "site/worker/index.js"),
  });
  process.exitCode = run(process.execPath, ["scripts/local-server.mjs"]);
} else if (action === "build") {
  const buildName = `web-build-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
  const output = resolve(root, process.env.DORM_WEB_BUILD_DIR || `data/${buildName}`);
  build({ frontend: join(output, "frontend"), worker: join(output, "site/worker/index.js") });
  console.log(`构建产物：${output}`);
} else if (action === "test-state") {
  const failed = [];
  for (const script of frontendStateScripts) {
    if (run(process.execPath, [script]) !== 0) failed.push(script);
  }
  if (failed.length) {
    console.error(`前端状态回归失败：${failed.join(", ")}`);
    process.exitCode = 1;
  } else console.log(`前端状态回归通过：${frontendStateScripts.length}项`);
} else if (action === "verify") {
  const temporary = mkdtempSync(join(tmpdir(), "dorm-web-verify-"));
  const frontend = join(temporary, "frontend");
  const worker = join(temporary, "site/worker/index.mjs");
  const results = [];
  try {
    const buildStatus = buildFrontend(frontend);
    results.push(["frontend build", buildStatus]);
    if (buildStatus === 0) {
      const workerStatus = embed(frontend, worker);
      results.push(["worker build", workerStatus]);
      results.push([
        "email runtime build",
        run(process.execPath, ["site/scripts/build-email-runtime.mjs"]),
      ]);
      for (const script of verificationScripts) {
        if (workerStatus !== 0) break;
        const env = {
          DORM_WORKER_INPUT: worker,
          DORM_FRONTEND_DIST: frontend,
        };
        results.push([script, run(process.execPath, [script], { env })]);
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  const failed = results.filter(([, status]) => status !== 0);
  console.log("\nWeb 验证汇总：");
  for (const [name, status] of results)
    console.log(`${status === 0 ? "通过" : "失败"} ${name}`);
  if (failed.length) process.exitCode = 1;
} else if (action === "release") {
  const name = process.argv[3] || process.env.DORM_RELEASE_NAME || `web-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}`;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) fail("发布包名称只能包含字母、数字、下划线和连字符。");
  const temporary = mkdtempSync(join(tmpdir(), "dorm-web-release-"));
  let status = 1;
  try {
    const frontend = join(temporary, "frontend");
    const frontendStatus = buildFrontend(frontend, { server: true, release: name });
    status = frontendStatus === 0
      ? run(python, ["deploy/prepare-release.py", name, frontend])
      : frontendStatus;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  if (status !== 0) process.exit(status);
  console.log("仅生成发布包，未连接服务器、未安装、未上线。");
} else {
  fail("用法：npm run web:dev | web:build | web:test-state | web:verify | web:release -- <发布包名>");
}
