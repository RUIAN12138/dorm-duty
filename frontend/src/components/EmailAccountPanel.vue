<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  emailAccount,
  emailPost,
  enterEmailRoom,
  refreshEmailAccount,
  type EmailEntry,
  type EmailRoom,
  unbindEmailIdentity,
} from "../api/email";
import { choreRequest } from "../api/chores";
import {
  motionAllowed,
  motionTiming,
  motionEaseCss,
} from "../interaction/motion";
import { ApiError } from "../api";
import HintPopover from "./HintPopover.vue";
import { logoutAll } from "../api/logout";
import { showToast } from "../interaction/notice";
import { preferredEntryRoom } from "../interaction/entryRoom";

const props = withDefaults(
  defineProps<{
    memberToken?: string;
    ownerToken?: string;
    memberId?: number;
    gate?: boolean;
    dormId?: number;
    hideTitle?: boolean;
    autoEnter?: boolean;
    preferredInvite?: string;
  }>(),
  { memberToken: "" },
);
const emit = defineEmits<{
  entered: [entry: EmailEntry];
  logout: [];
  recover: [];
  reenter: [];
  verification: [active: boolean];
}>();
const codeField = ref<HTMLInputElement>();
const operations = ref<{
  failed: number;
  pending: number;
  counters: { name: string; count: number; updated_at: string }[];
} | null>(null);
const mailFailure = computed(() =>
  operations.value?.counters.find((item) => item.name === "mail_failed"),
);
let fieldAnimation: Animation | undefined;
function animateCode(error = false) {
  fieldAnimation?.cancel();
  if (!motionAllowed() || !codeField.value) return;
  const transforms = error
    ? [
        "translateX(0)",
        "translateX(-4px)",
        "translateX(4px)",
        "translateX(-2px)",
        "translateX(0)",
      ]
    : ["scale(1)", "scale(0.985)", "scale(1)"];
  fieldAnimation = codeField.value.animate(
    transforms.map((transform) => ({ transform })),
    {
      duration: motionTiming.page * 1000,
      easing: motionEaseCss,
    },
  );
}
onUnmounted(() => fieldAnimation?.cancel());
watch(
  () =>
    JSON.stringify([
      emailAccount.loggedIn,
      emailAccount.email,
      emailAccount.rooms
        .filter((room) => room.is_creator)
        .map((room) => room.id),
    ]),
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    operations.value = null;
    if (
      !emailAccount.loggedIn ||
      !emailAccount.rooms.some((room) => room.is_creator)
    )
      return;
    try {
      const result = await choreRequest<typeof operations.value>(
        "/email/operations",
        "",
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) operations.value = result;
    } catch {
      /* Optional diagnostics never block identity entry. */
    }
  },
  { immediate: true },
);
const pendingUnbind = ref<EmailRoom | null>(null);
const confirmUnbindRoom = ref<EmailRoom | null>(null);
const keepBindingButton = ref<HTMLButtonElement>();
const unbindButton = ref<HTMLButtonElement>();
let restoreUnbindFocus = false;
function stepEntered() {
  if (confirmUnbindRoom.value)
    keepBindingButton.value?.focus({ preventScroll: true });
  else if (restoreUnbindFocus) {
    restoreUnbindFocus = false;
    unbindButton.value?.focus({ preventScroll: true });
  }
}
const currentRoom = computed(() =>
  emailAccount.rooms.find(
    (room) =>
      room.id === props.dormId ||
      (props.gate && room.member_id === props.memberId),
  ),
);
const email = ref(""),
  code = ref(""),
  challenge = ref(""),
  mailEnabled = ref(false);
let previousChallenge = "";
watch(email, () => {
  previousChallenge = "";
});
watch(challenge, (value) => {
  if (value) previousChallenge = value;
  emit("verification", !!value);
});
function backToEmail() {
  if (busy.value) return;
  challenge.value = "";
  code.value = "";
  error.value = "";
}

const busy = ref(false),
  reverify = ref(false),
  error = ref(""),
  remaining = ref(0);
function resumeVerification() {
  challenge.value = previousChallenge;
}
defineExpose({ backToEmail, resumeVerification, busy });
let retryAt = 0;
const timer = setInterval(() => {
  remaining.value = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}, 1000);
onUnmounted(() => clearInterval(timer));
const linked = computed(() =>
  emailAccount.rooms.some(
    (room) =>
      room.id === props.dormId ||
      (props.gate && room.member_id === props.memberId),
  ),
);
const submitLabel = computed(() =>
  busy.value
    ? "正在处理…"
    : challenge.value
      ? pendingUnbind.value
        ? "验证并解除绑定"
        : props.memberToken
          ? "验证并绑定"
          : "验证并进入"
      : "获取验证码",
);
async function act(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = (e as Error).message;
    if (challenge.value) animateCode(true);
  } finally {
    busy.value = false;
  }
}
async function sendCode() {
  await act(async () => {
    const result = await emailPost<{
      challenge_id: string;
      retry_after: number;
    }>("code", { email: email.value });
    challenge.value = result.challenge_id;
    retryAt = Date.now() + result.retry_after * 1000;
    remaining.value = result.retry_after;
    showToast("验证码已发送，请查看邮箱");
    await nextTick();
    codeField.value?.focus({ preventScroll: true });
    codeField.value?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}
async function bindIdentity() {
  if (linked.value) return;
  let failure: unknown;
  const proofs = [
    ...new Set(
      [props.memberToken, ...(props.gate ? [props.ownerToken] : [])].filter(
        Boolean,
      ),
    ),
  ];
  for (const proof of proofs) {
    try {
      await emailPost("bind", {
        member_token: proof,
        ...(props.memberId ? { member_id: props.memberId } : {}),
      });
      await refreshEmailAccount();
      return;
    } catch (e) {
      failure = e;
    }
  }
  if (failure) throw failure;
}
async function enterBoundRoom() {
  const room = emailAccount.rooms.find(
    (room) => room.member_id === props.memberId,
  );
  if (props.gate && room) emit("entered", await enterEmailRoom(room.id));
  else if (props.autoEnter && !props.memberToken && !props.gate) {
    const next = preferredEntryRoom(emailAccount.rooms, props.preferredInvite);
    if (next) emit("entered", await enterEmailRoom(next.id));
  }
}
async function verify() {
  await act(async () => {
    await emailPost("verify", {
      email: email.value,
      challenge_id: challenge.value,
      code: code.value,
      mail_enabled: mailEnabled.value,
    });
    challenge.value = "";
    code.value = "";
    await refreshEmailAccount();
    reverify.value = false;
    if (pendingUnbind.value) {
      await unbindEmailIdentity(pendingUnbind.value);
      pendingUnbind.value = null;
      showToast("已解除绑定，请输入你自己的名字");
      return;
    }
    if (props.memberToken || props.gate) {
      try {
        await bindIdentity();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          showToast("邮箱验证成功，旧设备身份已停用，请重新输入邀请码与姓名");
          emit("reenter");
          return;
        }
        throw e;
      }
    }
    await enterBoundRoom();
    showToast(props.memberToken ? "邮箱已绑定当前身份" : "邮箱验证成功");
  });
}
function enter(dormId: number) {
  void act(async () => {
    const result = await enterEmailRoom(dormId);
    emit("entered", result);
  });
}
function bind() {
  void act(async () => {
    await bindIdentity();
    await enterBoundRoom();
    showToast("当前身份已绑定邮箱");
  });
}
function setPreference() {
  void act(async () => {
    await emailPost("preferences", { mail_enabled: !emailAccount.mailEnabled });
    await refreshEmailAccount();
  });
}
function test() {
  void act(async () => {
    await emailPost("test");
    showToast("测试邮件已排队，请查看邮箱");
  });
}
function logout() {
  void act(async () => {
    try {
      await logoutAll();
    } finally {
      emit("logout");
    }
  });
}
async function unbind(room: EmailRoom) {
  if (busy.value) return;
  confirmUnbindRoom.value = room;
}
async function cancelUnbind() {
  restoreUnbindFocus = true;
  confirmUnbindRoom.value = null;
}
async function confirmUnbind() {
  const room = confirmUnbindRoom.value;
  if (!room || busy.value) return;
  confirmUnbindRoom.value = null;
  await act(async () => {
    try {
      await unbindEmailIdentity(room);
      showToast("已解除绑定，请输入你自己的名字");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        pendingUnbind.value = room;
        email.value = emailAccount.email;
        mailEnabled.value = emailAccount.mailEnabled;
        reverify.value = true;
      }
      throw e;
    }
  });
}
onMounted(() => {
  if (!emailAccount.loaded) void act(refreshEmailAccount);
});
</script>

<template>
  <div class="email-panel" data-testid="email-account-panel" :aria-busy="busy">
    <Transition name="email-step" mode="out-in" @after-enter="stepEntered">
      <section
        v-if="confirmUnbindRoom"
        key="unbind"
        class="email-unbind-confirm"
        aria-labelledby="unbind-title"
      >
        <h2 id="unbind-title">
          解除与「{{ confirmUnbindRoom.nickname }}」的绑定？
        </h2>
        <p>
          {{
            confirmUnbindRoom.is_creator
              ? "邮箱账号和宿舍记录会保留，所有设备退出本宿舍的此身份，其他宿舍不受影响。重新进入时验证邮箱并输入邀请码与姓名。"
              : "邮箱账号和打卡记录会保留，所有设备退出本宿舍的此身份，其他宿舍不受影响。随后可绑定尚未绑定邮箱的成员。"
          }}
        </p>
        <button class="guest-primary" :disabled="busy" @click="confirmUnbind">
          解除绑定
        </button>
        <button
          ref="keepBindingButton"
          class="email-reverify"
          @click="cancelUnbind"
        >
          保留绑定
        </button>
      </section>
      <section v-else-if="!emailAccount.loggedIn || reverify" key="login">
        <div v-if="!hideTitle" class="email-heading">
          <h2>{{ memberToken ? "绑定你的邮箱" : "用邮箱进入轮到" }}</h2>
          <HintPopover
            title="邮箱验证说明"
            text="首次验证会创建账号。绑定后换设备可用邮箱找回。验证码十分钟有效；重发不会废止其他验证页面的旧码，请在获取该码的页面输入。"
          />
        </div>
        <p class="email-message">首次验证即创建账号，已有账号直接登录。</p>
        <form @submit.prevent="challenge ? verify() : sendCode()">
          <div class="email-field-heading">
            <label for="account-email">邮箱</label
            ><HintPopover
              v-if="hideTitle"
              title="邮箱验证说明"
              text="首次验证会创建账号。绑定后换设备可用邮箱找回。验证码十分钟有效；重发不会废止其他验证页面的旧码，请在获取该码的页面输入。"
            />
          </div>
          <input
            id="account-email"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            maxlength="254"
            required
            :readonly="!!challenge || reverify"
            :disabled="busy"
            placeholder="你的邮箱地址"
          />
          <Transition name="email-code">
            <div v-if="challenge" class="email-code-field">
              <label for="account-code">验证码</label>
              <input
                ref="codeField"
                id="account-code"
                v-model="code"
                @focus="animateCode()"
                @input="animateCode()"
                :aria-invalid="!!error"
                aria-describedby="email-error"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9]{6}"
                maxlength="6"
                required
                :disabled="busy"
                placeholder="六位验证码"
              />
            </div>
          </Transition>
          <label class="email-check"
            ><input
              v-model="mailEnabled"
              type="checkbox"
              :disabled="busy"
            />接收室友催促和已设置的定时提醒（可选）</label
          >
          <button
            class="guest-primary"
            type="submit"
            :disabled="busy || !emailAccount.available"
          >
            <Transition name="email-label" mode="out-in"
              ><span :key="submitLabel">{{ submitLabel }}</span></Transition
            >
          </button>
          <div v-if="challenge" class="email-secondary">
            <button
              type="button"
              :disabled="busy || remaining > 0"
              @click="sendCode"
            >
              <Transition name="email-label" mode="out-in"
                ><span :key="remaining" class="email-countdown">{{
                  remaining > 0 ? `${remaining} 秒后重发` : "重新发送"
                }}</span></Transition
              >
            </button>
            <button
              type="button"
              :disabled="busy"
              @click="
                challenge = '';
                code = '';
              "
            >
              更换邮箱
            </button>
          </div>
        </form>
        <p
          v-if="emailAccount.loaded && !emailAccount.available"
          class="email-message"
          role="status"
        >
          邮箱服务尚未配置
        </p>
      </section>
      <section v-else key="account">
        <div v-if="!hideTitle" class="email-heading">
          <h2>邮箱账号</h2>
          <HintPopover
            title="邮件与系统通知"
            text="邮件提醒不依赖轮到 App 保持运行。邮件客户端何时弹出通知由其系统设置与同步频率决定。极光和 iOS 系统通知仍可分别开启。"
          />
        </div>
        <div class="email-field-heading">
          <p class="email-address">{{ emailAccount.email }}</p>
          <HintPopover
            v-if="hideTitle"
            title="邮件与系统通知"
            text="邮件客户端何时弹出通知由其系统设置与同步频率决定。极光和 iOS 系统通知仍可分别开启。"
          />
        </div>
        <button
          v-if="memberToken && !linked"
          class="guest-primary"
          :disabled="busy"
          @click="bind"
        >
          绑定当前身份
        </button>
        <button
          v-if="memberToken && !linked"
          class="email-reverify"
          :disabled="busy"
          @click="
            email = emailAccount.email;
            reverify = true;
            error = '';
          "
        >
          重新验证邮箱
        </button>
        <div
          v-if="(!memberToken || gate) && emailAccount.rooms.length"
          class="email-rooms"
        >
          <button
            v-for="room in emailAccount.rooms"
            :key="room.id"
            :disabled="busy"
            @click="enter(room.id)"
          >
            <span
              ><strong>{{ room.name }}</strong
              ><span>{{ room.nickname }}</span></span
            ><van-icon name="arrow" aria-hidden="true" />
          </button>
        </div>
        <button
          class="email-setting"
          :disabled="busy || !emailAccount.available"
          @click="setPreference"
        >
          <span>邮件提醒</span
          ><Transition name="email-label" mode="out-in"
            ><span :key="String(emailAccount.mailEnabled)">{{
              emailAccount.mailEnabled ? "已开启" : "已关闭"
            }}</span></Transition
          >
        </button>
        <button
          v-if="currentRoom"
          ref="unbindButton"
          class="email-setting email-unbind"
          :disabled="busy"
          data-testid="email-unbind"
          @click="unbind(currentRoom)"
        >
          <span
            ><strong>{{ currentRoom.nickname }}</strong
            ><span class="email-bound-label">当前身份</span></span
          >
          <span>解除身份绑定</span>
        </button>
        <div class="email-secondary">
          <button
            :disabled="
              busy || !emailAccount.available || !emailAccount.mailEnabled
            "
            @click="test"
          >
            发送测试邮件
          </button>
          <button :disabled="busy" @click="logout">退出登录</button>
        </div>
      </section>
    </Transition>
    <Transition name="email-code"
      ><p v-if="error" id="email-error" class="email-error" role="alert">
        {{ error
        }}<span v-if="reverify && emailAccount.loggedIn"
          >。当前仍是旧登录状态（{{
            emailAccount.email
          }}），验证成功后才切换。</span
        >
      </p></Transition
    >
    <button
      v-if="gate && error.includes('管理权限')"
      class="email-reverify"
      @click="emit('recover')"
    >
      恢复旧宿舍管理权限
    </button>
    <p v-if="mailFailure && operations" class="email-message" role="status">
      邮件服务曾发生发送失败，待重试 {{ operations.pending }} 封，最终失败
      {{ operations.failed }} 封。最近失败：{{
        new Date(mailFailure.updated_at).toLocaleString()
      }}
    </p>
    <p
      v-if="emailAccount.version && emailAccount.loggedIn"
      class="email-message"
      data-testid="release-version"
    >
      版本 {{ emailAccount.version }}
    </p>
  </div>
</template>

<style scoped>
.email-panel {
  width: 100%;
  text-align: left;
}
.email-unbind {
  margin-top: 16px;
}
.email-unbind-confirm {
  display: grid;
  gap: 24px;
}
.email-unbind-confirm h2 {
  font-size: 20px;
  line-height: 1.4;
  margin: 0;
  text-align: center;
}
.email-unbind-confirm p {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  color: #666;
}
.email-unbind > span:first-child {
  display: grid;
  gap: 4px;
  text-align: left;
  min-width: 0;
  overflow-wrap: anywhere;
}
.email-unbind > span:last-child {
  flex-shrink: 0;
}
.email-bound-label {
  font-size: 13px;
  color: #777;
}
.email-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.email-heading h2 {
  margin: 0;
  font-size: var(--text-card, 20px);
  line-height: 1.2;
  letter-spacing: -0.035em;
}
.email-panel form {
  display: grid;
  gap: 16px;
}
.email-panel form > .guest-primary {
  margin-top: 24px;
  min-height: 52px;
}
.email-code-field {
  display: grid;
  gap: 12px;
  margin-top: 8px;
}
.email-panel input {
  scroll-margin-block: 32px;
}
.email-code-enter-active {
  transition:
    opacity var(--ui-drawer-time) var(--ui-ease-out),
    transform var(--ui-drawer-time) var(--ui-ease-out);
}
.email-code-leave-active {
  transition:
    opacity var(--ui-page-time) var(--ui-ease-out),
    transform var(--ui-page-time) var(--ui-ease-out);
}
.email-code-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.email-code-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.email-panel > section {
  animation: email-arrive var(--ui-drawer-time) var(--ui-ease-out) both;
}
@keyframes email-arrive {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.email-panel label {
  font-size: 16px;
}
.email-panel input:not([type="checkbox"]) {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 52px;
  border: 1px solid #dedede;
  border-radius: 14px;
  background: #fff;
  padding: 12px 16px;
  font: inherit;
  font-size: 16px;
}
.email-panel input:focus-visible {
  outline: 2px solid #111;
  outline-offset: 3px;
}
.email-check {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
}
.email-check input {
  width: 20px;
  height: 20px;
  accent-color: #111;
}
.email-secondary {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
}
.email-secondary button {
  min-height: 44px;
  background: transparent;
  border: 0;
  padding: 8px 0;
  color: #555;
  font: inherit;
  font-size: 14px;
}
.email-reverify {
  min-height: 44px;
  border: 0;
  background: transparent;
  color: #555;
  padding: 8px 0;
  font: inherit;
  font-size: 14px;
}
.email-address {
  font-size: 18px;
  overflow-wrap: anywhere;
  margin: 0 0 24px;
}
.email-field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.email-field-heading .email-address {
  margin-bottom: 0;
}
.email-setting,
.email-rooms button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
  border: 1px solid #e3e3e3;
  border-radius: 14px;
  padding: 16px;
  min-height: 56px;
  margin-top: 16px;
  font: inherit;
}
.email-setting span:last-child {
  color: #666;
  font-size: 14px;
}
.email-rooms button > span {
  display: grid;
  gap: 8px;
  text-align: left;
}
.email-rooms strong {
  font-size: 18px;
}
.email-rooms button > span > span {
  font-size: 14px;
  color: #666;
}
.email-error,
.email-message {
  font-size: 14px;
  line-height: 1.5;
  margin-top: 16px;
}
.email-error {
  color: #a43737;
}
.email-step-enter-active {
  transition:
    transform var(--ui-drawer-time) var(--ui-ease-out),
    opacity var(--ui-drawer-time) var(--ui-ease-out);
}
.email-step-leave-active {
  transition:
    transform var(--ui-page-time) var(--ui-ease-out),
    opacity var(--ui-page-time) var(--ui-ease-out);
}
.email-step-enter-from {
  opacity: 0;
  transform: translateX(8px);
}
.email-step-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
.email-label-enter-active,
.email-label-leave-active {
  transition:
    opacity var(--ui-page-time) var(--ui-ease-out),
    transform var(--ui-page-time) var(--ui-ease-out);
}
.email-label-enter-from {
  opacity: 0;
  transform: translateY(3px);
}
.email-label-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>

<style scoped>
.email-countdown {
  display: inline-block;
  font-variant-numeric: tabular-nums;
}
</style>
