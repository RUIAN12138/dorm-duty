import { ref } from "vue";
export interface EmotionDefinition {
  id: string;
  name: string;
  group: string;
  desc: string;
}
export interface EmotionEngine {
  emotionId: string;
  setEmotion(id: string): boolean;
  setActive(on: boolean): void;
  renderStatic(): void;
  destroy(): void;
  setGaze(x: number, y: number): void;
  clearGaze(): void;
  captureState(): unknown;
  restoreState(state: unknown): boolean;
  on(event: string, callback: (event: { id: string }) => void): void;
}
declare global {
  interface Window {
    EMOTION_SEED?: EmotionDefinition[];
    EmotionBall?: {
      create(el: HTMLElement, options: Record<string, unknown>): EmotionEngine;
    };
  }
}
export const emotions =
  (typeof window !== "undefined" ? window.EMOTION_SEED : undefined) || [];
export const companionPreview = ref("");
export const companionEnabled = ref(true);
export const displayedEmotion = ref("02");
// Renderer state stays in memory: never conversation, identity or credentials.
let liveBall: EmotionEngine | undefined;
let ballState: unknown;
export function releaseCompanion(engine: EmotionEngine) {
  if (liveBall === engine) {
    ballState = engine.captureState();
    liveBall = undefined;
  }
}
export function acquireCompanion(engine: EmotionEngine) {
  if (liveBall === engine) return false;
  const state = liveBall?.captureState() || ballState;
  const restored = !!state && engine.restoreState(state);
  liveBall = engine;
  ballState = undefined;
  return restored;
}
export const emotionUses: Record<string, string> = {
  "00": "久置 100 秒后睡觉",
  "01": "休息后继续操作，缓缓睁眼",
  "02": "平常待机，左右看看、眨眼",
  "03": "切换任务或轻轻逗它时好奇",
  "04": "25 秒没操作，开始发呆",
  "05": "初次出现时加载苏醒",
  "06": "70 秒没操作，进入休眠",
  "07": "戳醒睡着的球球",
  "10": "轻点球球的开心回应",
  "11": "提醒发送没有成功时疑惑",
  "12": "网络断开时失落",
  "13": "室友提醒浮窗出现",
  "14": "连续逗它时害羞",
  "15": "45 秒没操作，开始犯困",
  "16": "查看待办详情时专注",
  "17": "短时间点很多下，慌张一下",
  "18": "成功撤销打卡后，无奈一下",
  "19": "今日任务做完后满意",
  "20": "版本冲突或任务更新时困惑",
  "21": "连续戳太多次，短暂假装生气",
  "30": "打开排班设置或轮序时思考",
  "31": "切到抬水页，接收任务",
  "32": "提交打卡或撤销中",
  "33": "服务确认完成且原按钮动画结束后庆祝",
  "34": "操作失败时出错",
  "35": "打开提醒编辑器，等待选择",
  "36": "刷新安排、重新联网时加载",
  "37": "查看历史完成记录时回忆",
  "38": "没有权限或身份失效时摇头",
  "39": "打开消息抽屉时回应",
  "40": "进入日历查找记录",
  "41": "关闭球球前安静收尾",
};
try {
  companionEnabled.value =
    localStorage.getItem("dorm-companion-enabled") !== "off";
} catch {}
export function saveCompanionEnabled(value: boolean) {
  companionEnabled.value = value;
  try {
    localStorage.setItem("dorm-companion-enabled", value ? "on" : "off");
  } catch {}
}
export function ambientEmotion(elapsed: number): string {
  return elapsed >= 100000
    ? "00"
    : elapsed >= 70000
      ? "06"
      : elapsed >= 45000
        ? "15"
        : elapsed >= 25000
          ? "04"
          : "02";
}
export function errorEmotion(message: string): string {
  return /权限|身份|登录|认证|403|401/.test(message)
    ? "38"
    : /版本|冲突|已更新|重选/.test(message)
      ? "20"
      : /离线|网络|断网/.test(message)
        ? "12"
        : "34";
}

// Only geometry is carried from login to the task page; never form contents.
export const companionEntering = ref(false);
let arrival: {
  left: number;
  top: number;
  width: number;
  height: number;
  at: number;
} | null = null;
let arrivalTimeout: ReturnType<typeof setTimeout> | undefined;
export function captureCompanionHandoff() {
  const element = document.querySelector<HTMLElement>(
    "[data-companion-login] .dorm-companion",
  );
  if (!companionEnabled.value || !element) return;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  arrival = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    at: Date.now(),
  };
  companionEntering.value = true;
  clearTimeout(arrivalTimeout);
  arrivalTimeout = setTimeout(finishCompanionHandoff, 6000);
}
export function takeCompanionHandoff() {
  const value = arrival;
  arrival = null;
  return value && Date.now() - value.at < 6000 ? value : null;
}
export function finishCompanionHandoff() {
  clearTimeout(arrivalTimeout);
  arrival = null;
  companionEntering.value = false;
}
