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
    "单击我，给室友留句话。",
    "做完再打卡，撤销也很方便。",
    "今天的小事，一起分担。",
  ],
  water: ["抬完水，再点“我已抬水”。", "这次辛苦啦，下一位接棒。"],
  calendar: ["点一天，看看谁照顾了宿舍。", "切走再回来，我替你记着位置。"],
  login: ["早上好，今天也一起照顾宿舍。", "密码和验证码，我会看别处。"],
  general: ["慢慢来，我在这里。", "双击我，可以逗我一下。"],
};
export async function companionReply(
  scene: CompanionScene,
  intent: "tip" | "play",
  signal: AbortSignal,
): Promise<string> {
  if (provider) return await provider({ scene, intent }, signal);
  const list = tips[scene];
  return intent === "play"
    ? "被你发现啦，今天也要开心。"
    : list[Math.floor(Math.random() * list.length)];
}
