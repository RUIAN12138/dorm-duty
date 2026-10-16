<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  emailAccount,
  emailPost,
  enterEmailRoom,
  refreshEmailAccount,
  type EmailEntry,
} from "../api/email";
import HintPopover from "./HintPopover.vue";
import { showToast } from "../interaction/notice";

const props = withDefaults(
  defineProps<{
    memberToken?: string;
    ownerToken?: string;
    memberId?: number;
    gate?: boolean;
    dormId?: number;
    hideTitle?: boolean;
  }>(),
  { memberToken: "" },
);
const emit = defineEmits<{
  entered: [entry: EmailEntry];
  logout: [];
  recover: [];
}>();
const codeField = ref<HTMLInputElement>();
const email = ref(""),
  code = ref(""),
  challenge = ref(""),
  mailEnabled = ref(true);
const busy = ref(false),
  reverify = ref(false),
  error = ref(""),
  remaining = ref(0);
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
      ? props.memberToken
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
    if (props.memberToken || props.gate) await bindIdentity();
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
    await emailPost("logout");
    await refreshEmailAccount();
    emit("logout");
  });
}
onMounted(() => {
  if (!emailAccount.loaded) void act(refreshEmailAccount);
});
</script>

<template>
  <div class="email-panel" data-testid="email-account-panel" :aria-busy="busy">
    <Transition name="email-step" mode="out-in">
      <section v-if="!emailAccount.loggedIn || reverify" key="login">
        <div v-if="!hideTitle" class="email-heading">
          <h2>{{ memberToken ? "绑定你的邮箱" : "用邮箱进入轮到" }}</h2>
          <HintPopover
            title="邮箱账号"
            text="首次验证会创建账号。绑定现有宿舍身份后，换设备可用邮箱登录找回。验证码十分钟有效。"
          />
        </div>
        <form @submit.prevent="challenge ? verify() : sendCode()">
          <div class="email-field-heading">
            <label for="account-email">邮箱</label
            ><HintPopover
              v-if="hideTitle"
              title="邮箱账号"
              text="首次验证会创建账号。绑定现有宿舍身份后，换设备可用邮箱找回。验证码十分钟有效。"
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
            />接收邮件提醒</label
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
              {{ remaining > 0 ? `${remaining} 秒后重发` : "重新发送" }}
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
        <div class="email-secondary">
          <button
            :disabled="
              busy || !emailAccount.available || !emailAccount.mailEnabled
            "
            @click="test"
          >
            发送测试邮件
          </button>
          <button :disabled="busy" @click="logout">退出邮箱账号</button>
        </div>
      </section>
    </Transition>
    <p v-if="error" class="email-error" role="alert">{{ error }}</p>
    <button
      v-if="gate && error.includes('管理权限')"
      class="email-reverify"
      @click="emit('recover')"
    >
      恢复旧宿舍管理权限
    </button>
  </div>
</template>

<style scoped>
.email-panel {
  width: 100%;
  text-align: left;
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
    opacity 240ms var(--ui-ease-enter),
    transform 240ms var(--ui-ease-enter);
}
.email-code-leave-active {
  transition:
    opacity 180ms var(--ui-ease-out),
    transform 180ms var(--ui-ease-out);
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
  animation: email-arrive 240ms var(--ui-ease-enter) both;
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
    transform 240ms var(--ui-ease-enter),
    opacity 240ms var(--ui-ease-enter);
}
.email-step-leave-active {
  transition:
    transform 180ms var(--ui-ease-out),
    opacity 180ms var(--ui-ease-out);
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
    opacity 120ms var(--ui-ease-out),
    transform 120ms var(--ui-ease-out);
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
