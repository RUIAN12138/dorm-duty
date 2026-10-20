// Future model adapters receive scene intent only. Authentication fields never enter this API.
export type CompanionScene =
  | "duty"
  | "water"
  | "calendar"
  | "login"
  | "general";
export type CompanionReplyProvider = (
  context: { scene: CompanionScene; intent: "tip" | "play" },
  signal: AbortSignal,
) => Promise<string>;
let provider: CompanionReplyProvider | null = null;
export function setCompanionReplyProvider(next: CompanionReplyProvider | null) {
  provider = next;
}
export function speechPages(text: string): string[] {
  const clean = Array.from(
    String(text)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim(),
  ).slice(0, 40);
  return [clean.slice(0, 20).join(""), clean.slice(20, 40).join("")].filter(
    Boolean,
  );
}
const tips: Record<CompanionScene, string[]> = {
  duty: [
    "单击我，给室友留言。",
    "双击我，看看我的新表情。",
    "点任务名称，可查看详情。",
    "左右滑动任务名，切换任务。",
    "点完成按钮，即可打卡。",
    "再点已完成，可撤销打卡。",
    "点圆环，查看本轮完成情况。",
    "点右上角轮序，查看排班。",
    "点右上角更多，可以查看消息。",
  ],
  water: [
    "抬完水，点“我已抬水”。",
    "点轮序，查看下一位室友。",
    "点提醒，可以通知抬水室友。",
  ],
  calendar: [
    "点日期，查看当天完成记录。",
    "左右滑动月份，查看往月。",
    "切到记录，可按日期查看明细。",
    "切到统计，查看完成情况。",
  ],
  login: ["可以切换邮箱或账号登录。", "新用户可以切到注册。"],
  general: ["在更多里调整提醒和球球。", "双击球球，可以与它互动。"],
};
const tipCursor: Partial<Record<CompanionScene, number>> = {};

export async function companionReply(
  scene: CompanionScene,
  intent: "tip" | "play",
  signal: AbortSignal,
): Promise<string> {
  if (provider) return await provider({ scene, intent }, signal);
  const list = tips[scene];
  if (intent === "play") return "再双击一次，换个表情。";
  const index = tipCursor[scene] || 0;
  tipCursor[scene] = (index + 1) % list.length;
  return list[index];
}
