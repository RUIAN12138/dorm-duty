// Future model adapters receive scene intent only. Authentication fields never enter this API.
export type CompanionScene =
  | "duty"
  | "water"
  | "calendar"
  | "login"
  | "chat"
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
    "单击我，就能和我聊天。",
    "点聊天里的“我要留言”。",
    "双击我，看看我的新表情。",
    "点任务名称，可查看详情。",
    "左右滑动任务名，切换任务。",
    "点完成按钮，即可打卡。",
    "再点已完成，可撤销打卡。",
    "点圆环，查看本轮完成情况。",
    "点设置，查看轮序。",
    "点设置，查看室友消息。",
    "单击我，可以聊聊值日。",
  ],
  water: [
    "左右滑动大字，换个任务催促。",
    "点一下名字，轻轻提醒室友 👋",
    "催促后，稍等室友回应。",
    "自己的任务，还能在这里完成。",
    "点任务名称，可查看详情。",
  ],
  calendar: [
    "单击我，就能和我聊天。",
    "点日期，查看当天完成记录 📅",
    "左右滑动月份，查看往月。",
    "切到记录，可按日期查看明细。",
    "切到统计，查看完成情况。",
  ],
  login: ["可以切换邮箱或账号登录。", "新用户可以切到注册。"],
  chat: [
    "点点我，也能换个表情。",
    "从左边缘右滑，可以返回。",
    "提醒安排，确认后才会生效。",
  ],
  general: ["在设置里调整提醒和球球。", "双击球球，可以与它互动。"],
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
