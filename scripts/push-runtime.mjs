import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import webpush from "../site/node_modules/web-push/src/index.js";
import {
  readNativeConfig,
  createNativeSender,
} from "./native-push-provider.mjs";
import { validPushEndpoint } from "../site/shared/push-endpoint.mjs";

export function createPushDelivery(
  db,
  send,
  { base = "/dorm-duty/", publicOrigin = null, now = () => new Date() } = {},
) {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
    throw new Error("通知入口路径无效");
  if (publicOrigin !== null) {
    const origin = new URL(publicOrigin);
    if (origin.protocol !== "https:" || origin.origin !== publicOrigin)
      throw new Error("通知入口必须是 HTTPS origin");
  }
  let stopped = false,
    running = null;
  const run = async () => {
    const time = now().toISOString();
    const jobs = db.sqlite
      .prepare(
        "SELECT id FROM chore_push_jobs WHERE (status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<?) ORDER BY id LIMIT 16",
      )
      .all(time, time);
    for (const { id } of jobs) {
      if (stopped) break;
      const lease = randomBytes(16).toString("hex"),
        date = now(),
        until = new Date(date.getTime() + 120000).toISOString();
      const claimed = db.sqlite
        .prepare(
          "UPDATE chore_push_jobs SET status='sending',attempts=attempts+1,lease=?,lease_until=? WHERE id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<?))",
        )
        .run(lease, until, id, date.toISOString(), date.toISOString());
      if (!claimed.changes) continue;
      const job = db.sqlite
        .prepare(
          `SELECT j.*,s.endpoint,s.p256dh,s.auth,s.provider,s.platform,s.is_active,s.revision,s.dorm_id AS device_dorm,s.user_id AS device_user,
        r.sender_name_snapshot,r.task_name_snapshot,r.task_content_snapshot,r.target_member_id,r.dorm_id AS reminder_dorm,r.read_at,r.created_at AS reminder_created,t.status AS task_status,t.key AS task_key,t.assignee_id,c.enabled AS category_enabled,
        m.is_active AS member_active,u.current_dorm_id,u.nickname AS recipient_name FROM chore_push_jobs j JOIN chore_push_subscriptions s ON s.id=j.subscription_id
        LEFT JOIN chore_reminders r ON r.id=j.reminder_id LEFT JOIN chore_tasks t ON t.id=r.task_id LEFT JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
        LEFT JOIN dorm_members m ON m.dorm_id=j.dorm_id AND m.user_id=j.user_id LEFT JOIN users u ON u.id=j.user_id WHERE j.id=? AND j.lease=?`,
        )
        .get(id, lease);
      const finish = (status, http = null, next = null) =>
        db.sqlite
          .prepare(
            "UPDATE chore_push_jobs SET status=?,last_status=?,next_attempt_at=COALESCE(?,next_attempt_at),accepted_at=CASE WHEN ?='accepted' THEN ? ELSE accepted_at END,lease=NULL,lease_until=NULL WHERE id=? AND lease=?",
          )
          .run(status, http, next, status, now().toISOString(), id, lease);
      const stale =
        !job ||
        !job.is_active ||
        job.revision !== job.subscription_revision ||
        job.device_dorm !== job.dorm_id ||
        job.device_user !== job.user_id ||
        !job.member_active ||
        job.current_dorm_id !== job.dorm_id ||
        !(job.provider === "web"
          ? validPushEndpoint(job.endpoint)
          : job.provider === "jpush" &&
            /^jpush:(android|harmony):[A-Za-z0-9_-]{8,256}$/.test(
              job.endpoint,
            )) ||
        date.getTime() - Date.parse(job.created_at) > 86400000 ||
        job.attempts > 5;
      const obsoleteReminder =
        job?.kind === "reminder" &&
        (job.target_member_id !== job.user_id ||
          job.reminder_dorm !== job.dorm_id ||
          job.read_at ||
          job.task_status !== "pending" ||
          job.assignee_id !== job.user_id ||
          !job.category_enabled);
      if (stale || obsoleteReminder) {
        finish("cancelled");
        continue;
      }
      const route =
        job.kind === "reminder" && job.task_key === "water" ? "water" : "";
      const message = {
        title:
          job.kind === "test"
            ? "轮到 · 测试通知"
            : `${job.sender_name_snapshot} 提醒你${job.task_name_snapshot}`,
        body:
          job.kind === "test"
            ? `${job.recipient_name}，这是一条测试提醒。示例：室友提醒你抬水，抬完后记得打卡。`
            : `待办：${job.task_name_snapshot}。${String(job.task_content_snapshot || "").trim() || "完成后记得打卡。"}`.slice(
                0,
                160,
              ),
        tag:
          job.kind === "test"
            ? `dorm-test-${id}`
            : `dorm-reminder-${job.reminder_id}`,
        url: base + route,
      };
      // Keep flat fields for installed older workers and native clients. Safari
      // can display this same content even if its optional worker fails to run.
      if (job.provider === "web" && publicOrigin) {
        message.web_push = 8030;
        message.notification = {
          title: message.title,
          body: message.body,
          tag: message.tag,
          lang: "zh-CN",
          navigate: new URL(message.url, publicOrigin).href,
        };
      }
      const payload = JSON.stringify(message);
      try {
        const response = await send(
          {
            endpoint: job.endpoint,
            provider: job.provider,
            platform: job.platform,
            keys: { p256dh: job.p256dh, auth: job.auth },
          },
          payload,
          {
            TTL: 86400,
            urgency: "high",
            timeout: 10000,
            contentEncoding: "aes128gcm",
          },
        );
        finish("accepted", response?.statusCode || 201);
      } catch (error) {
        const code = Number.isInteger(error.statusCode)
          ? error.statusCode
          : null;
        if (code === 404 || code === 410) {
          db.sqlite
            .prepare(
              "UPDATE chore_push_subscriptions SET is_active=0,updated_at=? WHERE id=? AND revision=?",
            )
            .run(
              now().toISOString(),
              job.subscription_id,
              job.subscription_revision,
            );
          finish("failed", code);
        } else if (
          job.attempts >= 5 ||
          (code && code >= 400 && code < 500 && code !== 429)
        )
          finish("failed", code);
        else
          finish(
            "pending",
            code,
            new Date(
              now().getTime() +
                Math.min(300, 15 * 2 ** (job.attempts - 1)) * 1000,
            ).toISOString(),
          );
        // Never log endpoints, cryptographic material or provider error bodies.
      }
    }
  };
  const drain = () => {
    if (stopped) return Promise.resolve();
    if (!running)
      running = run().finally(() => {
        running = null;
      });
    return running;
  };
  return {
    drain,
    kick: () => {
      void drain().catch(() => console.error("系统通知队列暂时处理失败"));
    },
    close: async () => {
      stopped = true;
      await running;
    },
  };
}
export async function createPushRuntime(
  db,
  directory,
  {
    enabled = false,
    base = "/dorm-duty/",
    subject = "https://8.148.190.114/dorm-duty/",
    publicOrigin = "https://8.148.190.114",
  } = {},
) {
  if (!enabled)
    return {
      config: { available: false, public_key: null },
      kick() {},
      async close() {},
    };
  // App-owned key material is generated once inside its private StateDirectory.
  // Existing keys are read, never rotated or overwritten by releases.
  const filename = path.join(directory, "webpush-vapid.json");
  let keys;
  try {
    keys = JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("系统通知配置无法读取");
    keys = { ...webpush.generateVAPIDKeys(), subject };
    try {
      await fs.writeFile(filename, JSON.stringify(keys), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (writeError) {
      if (writeError.code !== "EEXIST") throw new Error("系统通知配置无法保存");
      keys = JSON.parse(await fs.readFile(filename, "utf8"));
    }
  }
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  const native = await readNativeConfig(directory);
  const nativeSender = createNativeSender(native);
  const delivery = createPushDelivery(
    db,
    (subscription, payload, options) =>
      subscription.provider === "jpush"
        ? nativeSender(subscription, payload)
        : webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: subscription.keys },
            payload,
            options,
          ),
    { base, publicOrigin },
  );
  const timer = setInterval(delivery.kick, 2000);
  timer.unref();
  delivery.kick();
  return {
    config: { available: true, public_key: keys.publicKey },
    nativeConfig: {
      android: Boolean(native.android),
      harmony: Boolean(native.harmony),
    },
    kick: delivery.kick,
    close: async () => {
      clearInterval(timer);
      await delivery.close();
    },
  };
}
