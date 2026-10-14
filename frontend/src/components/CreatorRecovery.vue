<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { showToast } from "vant";
import ElasticSheet from "./ElasticSheet.vue";
import {
  getRecovery,
  generateRecovery,
  recoverOwner,
  type RecoveryStatus,
} from "../api/recovery";
import type { GuestCreation } from "../api/guest";
import { ApiError } from "../api";
const props = defineProps<{
  modelValue: boolean;
  mode: "manage" | "restore";
  token?: string;
  invite?: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  restored: [value: GuestCreation];
  closed: [];
}>();
const status = ref<RecoveryStatus | null>(null),
  busy = ref(false),
  error = ref("");
const inviteEntry = ref(""),
  codeEntry = ref(""),
  generatedCode = ref(""),
  copyHint = ref(""),
  revealed = ref(false),
  confirming = ref(false);
let epoch = 0,
  controller: AbortController | null = null;
function begin() {
  controller?.abort();
  controller = new AbortController();
  return { id: ++epoch, signal: controller.signal };
}
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      ++epoch;
      controller?.abort();
      return;
    }
    const { id, signal } = begin();
    status.value = null;
    error.value = "";
    generatedCode.value = "";
    copyHint.value = "";
    inviteEntry.value = props.invite || "";
    codeEntry.value = "";
    revealed.value = false;
    confirming.value = false;
    busy.value = props.mode === "manage";
    if (props.mode !== "manage") return;
    try {
      const result = await getRecovery(props.token || "", signal);
      if (id === epoch) status.value = result;
    } catch (e) {
      if (id === epoch) error.value = (e as Error).message;
    } finally {
      if (id === epoch) busy.value = false;
    }
  },
);
async function generate() {
  if (busy.value || !status.value) return;
  if (status.value.configured && !confirming.value) {
    confirming.value = true;
    return;
  }
  const { id, signal } = begin();
  busy.value = true;
  error.value = "";
  try {
    const result = await generateRecovery(
      props.token || "",
      status.value.version,
      signal,
    );
    if (id !== epoch) return;
    status.value = result;
    generatedCode.value = result.recovery_code;
    revealed.value = false;
    confirming.value = false;
  } catch (e) {
    if (id !== epoch) return;
    error.value = (e as Error).message;
    if (e instanceof ApiError && e.status === 409) {
      const latest = await getRecovery(props.token || "", signal).catch(
        () => null,
      );
      if (id !== epoch) return;
      status.value = latest;
      generatedCode.value = "";
      confirming.value = false;
    }
  } finally {
    if (id === epoch) busy.value = false;
  }
}
async function copy() {
  copyHint.value = "";
  try {
    await navigator.clipboard.writeText(generatedCode.value);
    copyHint.value = "已复制，请保存到你自己的安全位置。";
    showToast("恢复码已复制，请保存");
  } catch {
    revealed.value = true;
    copyHint.value = "无法自动复制，请长按上方恢复码复制。";
    showToast("请长按恢复码复制");
  }
}
async function restore() {
  if (busy.value) return;
  const { id, signal } = begin();
  busy.value = true;
  error.value = "";
  try {
    const result = await recoverOwner(
      inviteEntry.value,
      codeEntry.value,
      signal,
    );
    if (id === epoch) emit("restored", result);
  } catch (e) {
    if (id === epoch) error.value = (e as Error).message;
  } finally {
    if (id === epoch) busy.value = false;
  }
}
function closed() {
  generatedCode.value = "";
  copyHint.value = "";
  codeEntry.value = "";
  status.value = null;
  busy.value = false;
  revealed.value = false;
  confirming.value = false;
  emit("closed");
}
onUnmounted(() => {
  ++epoch;
  controller?.abort();
});
</script>
<template>
  <ElasticSheet
    :model-value="modelValue"
    :title="mode === 'manage' ? '管理恢复码' : '恢复管理权限'"
    motion="bottom"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="closed"
  >
    <div class="recovery-form" data-testid="creator-recovery">
      <template v-if="mode === 'manage'">
        <h3>
          {{
            generatedCode
              ? "保存恢复码"
              : status?.configured
                ? "恢复码已设置"
                : "换设备，也能管理"
          }}
        </h3>
        <p class="recovery-note">换手机时，用邀请码和恢复码取回管理权限。</p>
        <template v-if="generatedCode">
          <textarea
            v-if="revealed"
            class="recovery-code"
            :value="generatedCode"
            aria-label="恢复码"
            readonly
            rows="3"
            spellcheck="false"
          ></textarea>
          <div
            v-else
            class="recovery-code recovery-hidden"
            aria-label="恢复码已隐藏"
          >
            •••• •••• •••• ••••
          </div>
          <button
            class="guest-primary"
            data-testid="recovery-copy"
            @click="copy"
          >
            复制恢复码
          </button>
          <button
            class="recovery-secondary"
            @click="
              revealed = !revealed;
              copyHint = '';
            "
          >
            {{ revealed ? "隐藏恢复码" : "显示恢复码" }}
          </button>
          <p v-if="copyHint" class="recovery-note" role="status">
            {{ copyHint }}
          </p>
          <p class="recovery-note">只在这次显示，请保存。不要发给室友。</p>
        </template>
        <template v-else>
          <p v-if="confirming" class="recovery-note" role="alert">
            重新生成会使旧恢复码失效。
          </p>
          <button
            class="guest-primary"
            data-testid="recovery-generate"
            :disabled="busy || !status"
            @click="generate"
          >
            {{
              busy
                ? "正在处理…"
                : confirming
                  ? "确认重新生成"
                  : status?.configured
                    ? "重新生成恢复码"
                    : "生成恢复码"
            }}
          </button>
          <button
            v-if="confirming"
            class="recovery-secondary"
            @click="confirming = false"
          >
            取消
          </button>
        </template>
      </template>
      <form v-else @submit.prevent="restore">
        <label for="recovery-invite">宿舍邀请码</label>
        <input
          id="recovery-invite"
          v-model="inviteEntry"
          data-testid="recovery-invite"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="16"
          required
          :disabled="busy"
        />
        <label for="recovery-code">恢复码</label>
        <input
          id="recovery-code"
          type="password"
          v-model="codeEntry"
          data-testid="recovery-code"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          maxlength="128"
          placeholder="粘贴创建者保存的恢复码"
          required
          :disabled="busy"
        />
        <button
          class="guest-primary"
          data-testid="recovery-submit"
          :disabled="busy"
        >
          {{ busy ? "正在恢复…" : "恢复管理权限" }}
        </button>
        <p class="recovery-note">
          未保存恢复码时，请在原创建设备的「…」菜单中生成。
        </p>
      </form>
      <p v-if="error" class="recovery-error" role="alert">{{ error }}</p>
    </div>
  </ElasticSheet>
</template>
<style scoped>
.recovery-form h3 {
  font-size: 28px;
  line-height: 1.3;
  margin: 0 0 20px;
}
.recovery-note,
.recovery-error {
  font-size: 15px;
  line-height: 1.6;
  margin: 16px 0;
  color: #555;
}
.recovery-form label {
  display: block;
  margin: 20px 0 10px;
  font-size: 16px;
}
.recovery-form input,
.recovery-form textarea,
.recovery-code {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 14px;
  font-size: 16px;
  line-height: 1.6;
  color: #111;
  background: #fff;
}
.recovery-form textarea {
  resize: vertical;
}
.recovery-code {
  font-family: ui-monospace, monospace;
  overflow-wrap: anywhere;
}
.recovery-hidden {
  text-align: center;
  min-height: 80px;
  display: grid;
  place-items: center;
  letter-spacing: 2px;
}
.recovery-secondary {
  border: 0;
  background: none;
  width: 100%;
  min-height: 48px;
  font-size: 16px;
  color: #555;
}
.recovery-form .guest-primary {
  margin-top: 20px;
}
.recovery-error {
  color: #111;
}
</style>
