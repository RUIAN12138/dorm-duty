import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localDate, planned } from "../worker/backend.mjs";

// Direct Cloudflare hosting is separate from the existing Sites identity.
// Wrangler owns authentication; this helper never reads or saves credentials.
const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = path.join(root, "wrangler.json");
const version = "4.149.0";
const args = process.argv.slice(2);
const command = args[0] || "check";
const environment = { ...process.env, WRANGLER_SEND_METRICS: "false" };

function wrangler(arguments_, { quiet = false, allowLoggedOut = false } = {}) {
  const result = spawnSync(
    "npx",
    ["--yes", `wrangler@${version}`, ...arguments_, "--config", configPath],
    {
      cwd: root,
      env: environment,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    if (allowLoggedOut) {
      try {
        if (JSON.parse(result.stdout).loggedIn === false) return result.stdout;
      } catch {
        // Keep genuine CLI/network failures distinct from a logged-out identity.
      }
    }
    // Auth/error output can include account information; do not echo it.
    throw new Error(
      `Wrangler ${arguments_.slice(0, 2).join(" ")} 未完成（退出码 ${result.status ?? "未知"}）。请检查账号授权、资源权限和网络。`,
    );
  }
  if (!quiet) process.stdout.write(result.stdout);
  return result.stdout;
}

async function saveConfig(config) {
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}

function identity({ requirePublish = false } = {}) {
  let info;
  try {
    info = JSON.parse(
      wrangler(["whoami", "--json"], { quiet: true, allowLoggedOut: true }),
    );
  } catch {
    throw new Error(
      "无法完成 Cloudflare CLI 身份检查，请检查网络与 Wrangler 状态。此结果不能确认账号是否已授权。",
    );
  }
  if (info.loggedIn === false)
    throw new Error(
      "Wrangler 明确返回未登录，尚未取得本机发布凭据，请完成当前官方授权请求。",
    );
  if (info.loggedIn !== true || !Array.isArray(info.accounts))
    throw new Error("Cloudflare 身份返回结构无法确认，请检查 Wrangler 状态。");
  if (!info.accounts.length)
    throw new Error("账号已登录，但没有可用的 Cloudflare 账号资源。");
  if (requirePublish && Array.isArray(info.tokenPermissions)) {
    const required = [
      "account:read",
      "workers:write",
      "workers_scripts:write",
      "d1:write",
    ];
    const missing = required.filter(
      (scope) => !info.tokenPermissions.includes(scope),
    );
    if (missing.length)
      throw new Error(
        `账号已登录，但发布授权缺少 ${missing.join("、")}。请在 Cloudflare 官方授权页补齐权限后重试；现有数据库会继续复用。`,
      );
  }
  return info.accounts;
}

function d1Rows(binding, sql) {
  const result = JSON.parse(
    wrangler(
      ["d1", "execute", binding, "--remote", "--command", sql, "--json"],
      { quiet: true },
    ),
  );
  if (!Array.isArray(result) || result.some((entry) => entry.success === false))
    throw new Error("D1 查询失败，停止发布。");
  return result.flatMap((entry) => entry.results || []);
}

const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";

export function createDemoSql(now = new Date()) {
  // Only generated fake names are inserted. No local database is imported.
  const today = localDate(now);
  const names = ["张同学", "李同学", "王同学", "陈同学", "刘同学", "赵同学"];
  const prefix = "cloud_demo_" + randomBytes(9).toString("hex");
  const invite = randomBytes(4).toString("hex").toUpperCase();
  const usernames = names.map((_, index) => `${prefix}_${index}`);
  const user = (index) =>
    `(SELECT id FROM users WHERE username=${literal(usernames[index])})`;
  const room = `(SELECT id FROM dormitories WHERE invite_code=${literal(invite)} AND is_demo=1)`;
  const sql = names.map(
    (name, index) =>
      `INSERT INTO users(username,password_hash,nickname,created_at) VALUES (${literal(usernames[index])},${literal("disabled$" + randomBytes(32).toString("hex"))},${literal(name)},${literal(now.toISOString())});`,
  );
  const order =
    "'[' || " + names.map((_, i) => user(i)).join(" || ',' || ") + " || ']'";
  sql.push(
    `INSERT INTO dormitories(name,invite_code,admin_user_id,rotation_order,rotation_start_date,is_demo) VALUES ('6-402',${literal(invite)},${user(0)},${order},${literal(today)},1);`,
  );
  names.forEach((_, index) => {
    sql.push(
      `UPDATE users SET current_dorm_id=${room} WHERE username=${literal(usernames[index])};`,
      `INSERT INTO dorm_members(dorm_id,user_id,role,sort_order,joined_at) VALUES (${room},${user(index)},${literal(index === 0 ? "admin" : "member")},${index},${literal(now.toISOString())});`,
    );
  });
  for (let index = 0; index < 30; index++) {
    const day = new Date(Date.parse(today + "T00:00:00Z") + index * 86400000)
      .toISOString()
      .slice(0, 10);
    const task = planned(
      {
        rotation_order: [0, 1, 2, 3, 4, 5],
        rotation_start_date: today,
        deadline_time: "22:00",
        task_text: "扫地、拖地、倒垃圾",
        schedule_rules: {
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          rotation_days: 1,
          horizon_days: 30,
          skip_dates: [],
          weekly_tasks: {},
        },
      },
      day,
    );
    sql.push(
      `INSERT INTO duty_tasks(dorm_id,duty_date,assignee_id,assignee_name_snapshot,task_text,deadline_at) VALUES (${room},${literal(day)},${user(task.assignee_id)},${literal(names[task.assignee_id])},${literal(task.task_text)},${literal(task.deadline_at)});`,
    );
  }
  return { sql: sql.join("\n") + "\n", invite };
}

async function ensureDemo(binding) {
  const demos = d1Rows(
    binding,
    "SELECT id,invite_code FROM dormitories WHERE is_demo=1 ORDER BY id LIMIT 2",
  );
  if (demos.length > 1)
    throw new Error("云端存在多个游客宿舍，须先确定要展示的宿舍。");
  if (demos.length === 1) return demos[0].invite_code;
  const { sql, invite } = createDemoSql();
  const file = path.join(root, ".wrangler/cloud-demo.sql");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, sql);
  try {
    wrangler(["d1", "execute", binding, "--remote", "--file", file, "--yes"], {
      quiet: true,
    });
  } finally {
    await fs.unlink(file).catch(() => {});
  }
  const [verified] = d1Rows(
    binding,
    `SELECT is_demo,(SELECT count(*) FROM dorm_members WHERE dorm_id=d.id) AS members,(SELECT count(*) FROM sessions WHERE user_id=d.admin_user_id) AS sessions FROM dormitories d WHERE invite_code=${literal(invite)}`,
  );
  if (
    !verified ||
    verified.is_demo !== 1 ||
    verified.members !== 6 ||
    verified.sessions !== 0
  )
    throw new Error("游客初始化校验失败，停止发布。");
  console.log(
    "已初始化只读游客宿舍：6-402 / 6 位示例成员 / 无管理员设备会话。",
  );
  return invite;
}

async function main() {
  if (command === "check") {
    const accounts = identity();
    console.log(
      JSON.stringify(
        {
          authenticated: true,
          accounts: accounts.map(({ id, name }) => ({ id, name })),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "dry-run") {
    wrangler(["deploy", "--dry-run", "--outdir", ".wrangler/release"]);
    return;
  }
  if (command !== "deploy" || !args.includes("--public"))
    throw new Error(
      "用法：node scripts/cloudflare.mjs check | dry-run | deploy --public。--public 明确发布开放的 workers.dev 网页入口；仅本人验收应先配置 Cloudflare Access。",
    );

  const accounts = identity({ requirePublish: true });
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const selected = environment.CLOUDFLARE_ACCOUNT_ID || config.account_id;
  const account = selected
    ? accounts.find((entry) => entry.id === selected)
    : accounts.length === 1
      ? accounts[0]
      : undefined;
  if (!account)
    throw new Error(
      "账号选择不明确，请通过 CLOUDFLARE_ACCOUNT_ID 明确目标账号后重试。",
    );
  environment.CLOUDFLARE_ACCOUNT_ID = account.id;
  config.account_id = account.id;
  const binding = config.d1_databases.find((entry) => entry.binding === "DB");
  if (!binding) throw new Error("缺少 DB 绑定。");
  if (!binding.database_id) {
    const databases = JSON.parse(
      wrangler(["d1", "list", "--json"], { quiet: true }),
    );
    if (databases.some((entry) => entry.name === binding.database_name))
      throw new Error(
        "账号中已有同名 D1 数据库，须明确其 database_id 后才能复用，避免误改其他数据。",
      );
    await saveConfig(config);
    const output = wrangler(
      [
        "d1",
        "create",
        binding.database_name,
        "--location",
        "apac",
        "--update-config=false",
      ],
      { quiet: true },
    );
    const id = output.match(/database_id["\s]*[:=]["\s]*([a-f0-9-]{36})/i)?.[1];
    if (!id)
      throw new Error(
        "D1 已请求创建，但返回 ID 无法识别；请先查询已有数据库，不要重复创建。",
      );
    binding.database_id = id;
    await saveConfig(config);
  }
  console.log(`发布目标：${config.name}；数据库：${binding.database_name}。`);
  wrangler(["d1", "info", binding.database_name, "--json"], { quiet: true });
  wrangler(["d1", "migrations", "apply", binding.database_name, "--remote"]);
  const demoInvite = await ensureDemo(binding.database_name);
  config.vars = { ...config.vars, DEFAULT_DORM_INVITE_CODE: demoInvite };
  config.workers_dev = true;
  await saveConfig(config);
  const output = wrangler(["deploy"]);
  const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i)?.[0];
  const versionId = output.match(/Current Version ID:\s*([a-f0-9-]+)/i)?.[1];
  if (!url)
    throw new Error("未读取到部署 URL，请查看 Cloudflare 部署记录后继续。");
  if (
    !versionId ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(versionId)
  )
    throw new Error(
      "发布请求已执行，但没有取得有效版本 ID，请查询部署记录后继续，尚不记录交付成功。",
    );
  const response = await fetch(new URL("/health", url), {
    signal: AbortSignal.timeout(30000),
  });
  const health = await response.json();
  if (
    !response.ok ||
    health.runtime !== "cloudflare-worker" ||
    health.storage !== "d1"
  )
    throw new Error("线上 Worker / D1 健康检查未通过，尚不能交付。");
  const evidence = path.resolve(
    root,
    "../docs/evidence/cloudflare/deployment.json",
  );
  await fs.mkdir(path.dirname(evidence), { recursive: true });
  await fs.writeFile(
    evidence,
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        url,
        audience: "public",
        worker: config.name,
        database_id: binding.database_id,
        worker_sha256: createHash("sha256")
          .update(await fs.readFile(path.resolve(root, config.main)))
          .digest("hex"),
        version_id: versionId,
        health,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Cloudflare 部署和 D1 健康检查通过：${url}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
