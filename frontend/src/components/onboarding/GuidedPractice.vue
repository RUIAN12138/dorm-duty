<script setup lang="ts">
import { computed, provide, ref } from "vue";
import ChoreBoard from "../ChoreBoard.vue";
import ChoreBottomNav from "../ChoreBottomNav.vue";
import DormCompanion from "../DormCompanion.vue";
import ScreenStage from "../ScreenStage.vue";
import PracticeSpotlight, { type PracticeStep } from "./PracticeSpotlight.vue";
import { createTutorialPractice, PRACTICE_INVITE, tutorialPracticeKey } from "../../interaction/tutorialPractice";

const emit = defineEmits<{ done: []; skip: [] }>();
const practice = createTutorialPractice();
provide(tutorialPracticeKey, practice);
const initial = JSON.stringify(practice.board);
type Section = "duty" | "water" | "calendar";
type Lesson = "duty" | "water" | "calendar" | "messages";
const section = ref<Section>("duty"), lesson = ref<Lesson | null>(null), index = ref(0), run = ref(0);
const finished = ref(new Set<Lesson>());
const lessons: { id: Lesson; title: string; text: string; mood: string }[] = [
  { id: "duty", title: "完成一次值日", text: "切换任务、查看详情、打卡与撤销", mood: "05" },
  { id: "water", title: "催促与任务交接", text: "滑动切换、轻敲提醒、完成交接", mood: "03" },
  { id: "calendar", title: "找到完成记录", text: "查看日期、列表和统计卡片", mood: "19" },
  { id: "messages", title: "给室友留句话", text: "选择对象、确认发送、查看已读", mood: "02" },
];
const visible = (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector);
  return !!el && !el.closest("[inert],[aria-hidden=true]") && !!el.getClientRects().length &&
    getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
};
function step(id: string, target: string, title: string, text: string, result: string, completed: () => boolean): PracticeStep {
  const resultTargets: Record<string,string> = {
    "duty-detail": "[data-testid=task-detail]",
    "water-detail": "[data-testid=task-detail]",
    "duty-round": "[data-testid=round-members]",
    "duty-complete": '[data-testid="undo--11"]',
    "duty-undo": '[data-testid="complete-sink--11"]',
    "calendar-date": "[data-testid=calendar-day-details]",
    "message-start": "[data-testid=conversation-note]",
    "message-recipient": "[data-testid=conversation-note]",
    "message-content": "[data-testid=conversation-note]",
  };
  return { id, target, title, text, result, completed, resultTarget: resultTargets[id] };
}
const chapters = computed<Record<Lesson, PracticeStep[]>>(() => ({
  duty: [
    step("duty-select", ".task-selector button:nth-child(2)", "先切换到洗手池", "点这里切换，也可以左右滑动。", "大字任务名已变成洗手池，完成按钮只对应当前任务。", () => document.querySelector('.task-selector button[aria-pressed=true]')?.textContent?.includes("洗手池") || false),
    step("duty-detail", '.task-title-stage h2:not([inert]) .task-title-button', "点任务名，看具体要做什么", "先看清任务说明，再去完成。", "这里可以确认任务内容、负责人和完成状态。", () => visible('[data-testid=task-detail]')),
    step("duty-detail-close", ".sheet-layer:not([inert]) .elastic-sheet", "关闭详情，回到任务", "点右上角关闭按钮。也可以按原有方式下滑收起。", "已回到任务页。现在练习一次打卡。", () => !visible('[data-testid=task-detail]')),
    step("duty-complete", '[data-testid="complete-sink--11"]', "完成后，点「我已完成」", "这次是练习，不会改动你的宿舍记录。", "按钮变成已完成，轮次进度和日历也会同步记录。", () => practice.events.complete > 0 && visible('[data-testid="undo--11"]')),
    step("duty-round", '[data-testid=round-progress]', "点圆环，查看本轮进度", "这里能看到已经完成和还没完成的室友。", "本轮名单已打开。默认先显示已完成的人。", () => visible('[data-testid=round-members]')),
    step("duty-pending", '.round-filters button:nth-child(2)', "切到「未完成」", "看看这一轮还有谁没完成。名单较长时可在抽屉内滚动。", "两位练习室友仍未完成。全员完成后才会开启下一轮。", () => document.querySelector('.round-filters button:nth-child(2)')?.getAttribute('aria-pressed') === 'true'),
    step("duty-round-close", ".sheet-layer:not([inert]) .elastic-sheet", "收起轮次名单", "回到刚才已完成的任务。", "现在试试修正一次误点。", () => !visible('[data-testid=round-members]')),
    step("duty-undo", '[data-testid="undo--11"]', "再点一次「已完成」撤销", "误点时可以直接撤销，不需要重新打卡。", "任务恢复待完成，练习中的进度和记录一并恢复。", () => practice.events.undo > 0 && visible('[data-testid="complete-sink--11"]')),
  ],
  water: [
    step("water-nav", '[data-testid=nav-water]', "点底部「催促」", "底部导航用来切换主页面。", "现在是催促页，左右滑动大字可以换任务。", () => section.value === "water" && visible('[data-testid=pane-water]')),
    step("water-detail", '.water-task-text', "先点「查看任务」", "确认抬水的具体内容。", "详情中可以看到由谁负责，以及任务状态。", () => visible('[data-testid=task-detail]')),
    step("water-detail-close", ".sheet-layer:not([inert]) .elastic-sheet", "看完后收起详情", "点关闭，回到催促页。", "接下来模拟你已经把水送到宿舍。", () => !visible('[data-testid=task-detail]')),
    step("water-complete", '[data-testid="complete-water--13"]', "点「我已抬水」完成交接", "只在已经完成抬水后记录。当前操作是练习。", "交接动画之后，下一位变成小林；刚才的完成记录保留。", () => practice.events.complete > 0 && practice.board.water_task?.assignee_id === -2),
    step("water-nudge", '[data-testid=water-nudge]', "轻点小林，练习提醒", "正式使用时会按原有限流规则提醒当前负责人。", "你已经学会催促。本次没有给任何真实室友发送通知。", () => practice.events.nudge > 0),
    step("water-swipe", '[data-testid=nudge-task-swipe]', "向左滑动大字，换一个任务", "不用找切换按钮，在任务名称上滑动即可。", "已切换到其他任务，提醒仍沿用相同规则。", () => !!document.querySelector('.nudge-task-name')?.textContent?.includes("地板")),
  ],
  calendar: [
    step("calendar-nav", '[data-testid=nav-calendar]', "点底部「日历」", "已完成的任务可以在这里查找。", "日期上的标记表示当天有完成记录。", () => section.value === "calendar" && visible('[data-testid=chore-calendar]')),
    step("calendar-date", `[data-testid="calendar-day-${practice.board.today}"]`, "点今天，查看当天记录", "练习日历里预先放了一条示例记录。", "这里显示谁完成了哪项任务，以及完成时间。", () => visible('[data-testid=calendar-day-details]')),
    step("calendar-close", ".sheet-layer:not([inert]) .elastic-sheet", "收起当天记录", "点右上角关闭，回到日历。", "除了按日期查看，还可以切换成列表。", () => !visible('[data-testid=calendar-day-details]')),
    step("calendar-list", '[data-testid=calendar-view-list]', "切换到「列表」", "按日期展开记录，查找完成历史。", "列表和日历使用同一份记录。正式使用时可在已有侧滑入口中修正。", () => document.querySelector('[data-calendar-panel=list]')?.getAttribute('aria-hidden') === 'false'),
    step("calendar-stats", '[data-testid=calendar-view-stats]', "再切换到「卡片」", "用卡片查看任务的完成情况和间隔。", "已进入统计卡片。这里可以沿用现有的左右滑动与配色设置。", () => document.querySelector('[data-calendar-panel=stats]')?.getAttribute('aria-hidden') === 'false'),
  ],
  messages: [
    step("message-ball", '.companion-identity .companion-frame', "单击球球，打开聊天", "单击进入聊天；双击仍是表情互动。", "聊天已展开。留言不需要先向AI提问。", () => visible('.companion-chat')),
    step("message-start", '[data-testid=chat-quick-prompts] button:first-child', "点「我要留言」", "它会进入留言流程，而不是发送普通聊天。", "选择一个或多个室友，再点继续。", () => document.querySelector('[data-testid=conversation-note]')?.getAttribute('data-phase') === 'recipient'),
    step("message-recipient", '.recipient-list .recipient-option:first-child', "选择小林", "可以选择一位或多位室友。", "小林已选中，再点继续。", () => document.querySelector('.recipient-list .recipient-option:first-child')?.getAttribute('aria-pressed') === 'true'),
    step("message-recipient-confirm", '.conversation-note-actions .chat-primary', "点「继续」", "选好收件人后继续写留言。", "收件人已确定。接下来写留言内容。", () => document.querySelector('[data-testid=conversation-note]')?.getAttribute('data-phase') === 'content'),
    step("message-content", '[data-testid=chat-composer]', "写一句留言，再点发送箭头", "例如：晚点回来，我会记得值日。这里只会生成确认卡片。", "确认卡片已出现。请检查收件人和内容，也可以修改或取消。", () => document.querySelector('[data-testid=conversation-note]')?.getAttribute('data-phase') === 'confirm'),
    step("message-confirm", '[data-testid=conversation-note]', "检查后，点「确认发送」", "只有这一步才提交留言。发送失败时保留内容，可重试。", "练习留言已经确认，真实宿舍没有收到这条消息。", () => practice.events.note > 0),
    step("message-back", '.companion-chat button[aria-label="返回宿舍"]', "点返回，回到任务页", "聊天历史与未发送草稿沿用原有保留规则。", "回到任务页后，可以从设置查看收到的消息。", () => !visible('.companion-chat')),
    step("message-tools", '[data-testid=open-tools]', "点右上角设置", "「使用引导」也在这里，以后可以重新练习。", "找到设置里的「室友消息」。", () => visible('[data-testid=open-messages]')),
    step("message-inbox", '[data-testid=open-messages]', "打开「室友消息」", "查看收到的留言和任务提醒。", "大字显示发送者姓名，下面是留言内容。", () => visible('[data-testid=chore-reminders]')),
    step("message-read", '[data-testid="reminder-read--50"]', "点「知道了」，练习标记已读", "只标记这一条消息。正式使用时会同步到服务端。", "这条练习消息已读；不会改变其他消息的状态。", () => practice.events.read > 0),
  ],
}));
const current = computed(() => lesson.value ? chapters.value[lesson.value][index.value] : undefined);
function start(id: Lesson) {
  Object.assign(practice.board, JSON.parse(initial));
  Object.keys(practice.events).forEach((key) => { practice.events[key as keyof typeof practice.events] = 0; });
  practice.sentNotes.length = 0;
  if (id === "calendar") {
    const task = practice.board.today_tasks[0]!;
    practice.board.calendar.push({ ...task, completed_at: new Date().toISOString(), completed_date: practice.board.today });
  }
  section.value = "duty"; index.value = 0; run.value++; lesson.value = id;
}
function next() {
  if (!lesson.value || !current.value?.completed()) return;
  if (index.value + 1 < chapters.value[lesson.value].length) index.value++;
  else { finished.value = new Set([...finished.value, lesson.value]); lesson.value = null; }
}
</script>
<template>
  <div class="guided-practice" data-testid="guided-practice">
    <template v-if="lesson && current">
      <ScreenStage :key="run" signed-in preserve-content-layout>
        <main class="guest-page practice-page">
          <ChoreBoard :invite="PRACTICE_INVITE" dorm-name="练习宿舍" :member-id="-1" token="" :demo="false" preview :preview-data="practice.board" :section="section" @section-change="section=$event" @exit-preview="lesson=null" />
        </main>
      </ScreenStage>
      <ChoreBottomNav preview :section="section" @select="section=$event" />
      <PracticeSpotlight :step="current" :index="index" :count="chapters[lesson].length" @next="next" @leave="lesson=null" />
    </template>
    <main v-else class="practice-directory">
      <header><button @click="emit('skip')">退出教程</button><span>轮到 · 动手练习</span></header>
      <DormCompanion :size="64" mood="05" :interactive="false" :tips="false" :lite-effects="true" />
      <h1>{{ finished.size === lessons.length ? '已经会用了' : '跟着点一遍' }}</h1>
      <p class="practice-safety">使用练习数据，不会打卡或通知真实室友。</p>
      <div class="practice-lessons">
        <button v-for="item in lessons" :key="item.id" :data-testid="`lesson-${item.id}`" @click="start(item.id)">
          <strong>{{ item.title }}</strong><span>{{ item.text }}</span><small v-if="finished.has(item.id)">已练习 · 可重试</small>
        </button>
      </div>
      <button class="practice-finish" @click="emit('done')">{{ finished.size ? '回到宿舍' : '稍后再学' }}</button>
    </main>
  </div>
</template>
<style scoped>
.guided-practice { position: fixed; inset: 0; z-index: 230; overflow-y: auto; background: var(--canvas); color: var(--ink); }
.practice-page { padding-bottom: calc(104px + env(safe-area-inset-bottom)); }
.practice-directory { width: min(100%,520px); min-height: 100%; margin-inline: auto; padding: calc(env(safe-area-inset-top) + 12px) 24px calc(env(safe-area-inset-bottom) + 20px); }
header { display: flex; justify-content: center; align-items: center; position: relative; min-height: 44px; color: var(--muted); font-size: 13px; margin-bottom: 20px; }
header button { position: absolute; right: 0; padding-inline: 0; }
h1 { font-size: clamp(34px,9vw,44px); line-height: 1.2; margin: 18px 0 12px; letter-spacing: -.04em; }
.practice-safety { color: var(--muted); font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
.practice-lessons { display: grid; gap: 10px; }
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; min-height: 44px; transition: transform 180ms var(--ui-ease-out),background-color 160ms; }
button:active { transform: scale(.98); }
.practice-lessons button { padding: 18px 20px; border-radius: 24px; text-align: left; background: color-mix(in srgb,var(--ink) 4%,var(--canvas)); display: grid; gap: 6px; }
.practice-lessons strong { font-size: 21px; font-weight: 600; }
.practice-lessons span,.practice-lessons small { color: var(--muted); font-size: 13px; line-height: 1.4; }
.practice-finish { width: 100%; background: var(--ink); color: var(--canvas); border-radius: 30px; min-height: 54px; margin-top: 24px; }
@media (prefers-reduced-motion:reduce) { button { transition: none; } button:active { transform: none; } }
</style>
