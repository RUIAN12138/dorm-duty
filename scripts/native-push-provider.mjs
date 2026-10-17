import fs from "node:fs/promises";
import path from "node:path";
export async function readNativeConfig(directory) {
  const filename = path.join(directory, "native-push.json");
  try {
    const stat = await fs.stat(filename);
    if ((stat.mode & 0o077) !== 0)
      throw new Error("安装版推送配置必须为仅服务账号可读");
    const value = JSON.parse(await fs.readFile(filename, "utf8"));
    for (const platform of Object.keys(value)) {
      if (
        !["android", "harmony"].includes(platform) ||
        !/^[a-f0-9]{24}$/i.test(value[platform]?.appKey) ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(value[platform]?.masterSecret)
      )
        throw new Error("安装版推送配置格式无效");
    }
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
// Keys stay on the server; the request has exactly one registration ID, never broadcast.
export function createNativeSender(config, transport = fetch) {
  return async (subscription, payload, options = {}) => {
    const app = config[subscription.platform];
    const match = /^jpush:(android|harmony):([A-Za-z0-9_-]{8,256})$/.exec(
      subscription.endpoint,
    );
    if (!app || !match || match[1] !== subscription.platform)
      throw new Error("安装版推送尚未配置");
    const message = JSON.parse(payload);
    const platform = subscription.platform === "harmony" ? "hmos" : "android";
    const notification = {
      alert: message.body,
      title: message.title,
      extras: { url: message.url, tag: message.tag },
    };
    if (platform === "android") notification.channel_id = "dorm-reminders";
    else {
      notification.category = "IM";
      notification.push_type = 0;
    }
    const response = await transport("https://api.jpush.cn/v3/push", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(`${app.appKey}:${app.masterSecret}`).toString("base64"),
      },
      body: JSON.stringify({
        platform: [platform],
        audience: { registration_id: [match[2]] },
        notification: { [platform]: notification },
        options: {
          // This release uses JPush's own connection on both platforms. Never
          // silently switch to a vendor channel that has not been configured.
          third_party_channel: Object.fromEntries(
            (platform === "hmos"
              ? ["hmos"]
              : ["xiaomi", "huawei", "honor", "meizu", "oppo", "vivo", "fcm"]
            ).map((channel) => [channel, {
              distribution: "jpush",
              ...(platform === "android" && channel !== "fcm"
                ? { distribution_fcm: "jpush" }
                : {}),
            }]),
          ),
          time_to_live:
            Number.isInteger(options.TTL) &&
            options.TTL >= 1 &&
            options.TTL <= 86400
              ? options.TTL
              : 86400,
        },
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.error) {
      const error = new Error("安装版推送服务未接受通知");
      // Invalid registration: deactivate; credentials/configuration errors are not retried forever.
      error.statusCode =
        result?.error?.code === 1000
          ? 503
          : result?.error?.code === 2002
            ? 429
            : result?.error?.code === 1011
              ? 410
              : response.ok
                ? 400
                : response.status;
      throw error;
    }
    if (!result?.msg_id) throw new Error("安装版推送服务响应无效");
    return { statusCode: 201 };
  };
}
