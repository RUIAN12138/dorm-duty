<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import ElasticSheet from "./ElasticSheet.vue";
import { choreRequest, type ChoreMember } from "../api/chores";
const props = defineProps<{
  modelValue: boolean;
  members: ChoreMember[];
  memberId: number;
  token: string;
  invite: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  sent: [];
  closed: [];
}>();
const target = ref<number | null>(null),
  text = ref(""),
  busy = ref(false),
  error = ref("");
const others = computed(() =>
  props.members.filter((m) => m.user_id !== props.memberId),
);
const length = computed(() => Array.from(text.value).length);
let epoch = 0,
  dead = false;
watch(
  () => [props.modelValue, props.token, props.invite, props.memberId],
  () => {
    epoch++;
    error.value = "";
    if (props.modelValue) {
      text.value = "";
      target.value = others.value.length === 1 ? others.value[0].user_id : null;
    }
  },
);
async function send() {
  if (
    !props.modelValue ||
    busy.value ||
    !target.value ||
    !text.value.trim() ||
    length.value > 120
  )
    return;
  const identity = `${props.invite}:${props.memberId}:${props.token}`,
    generation = epoch;
  const snapshot = { target_member_id: target.value, text: text.value.trim() };
  busy.value = true;
  error.value = "";
  try {
    await choreRequest("/chores/notes", props.token, {
      method: "POST",
      body: JSON.stringify(snapshot),
    });
    if (dead || identity !== `${props.invite}:${props.memberId}:${props.token}`)
      return;
    emit("sent");
    if (generation === epoch) emit("update:modelValue", false);
  } catch (e) {
    if (!dead && generation === epoch) error.value = (e as Error).message;
  } finally {
    if (!dead) busy.value = false;
  }
}
onBeforeUnmount(() => {
  dead = true;
  epoch++;
});
</script>
<template>
  <ElasticSheet
    :model-value="modelValue"
    title="给室友留句话"
    motion="bottom"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="emit('closed')"
  >
    <form class="companion-note-form" @submit.prevent="send">
      <div
        v-if="others.length"
        class="note-recipients"
        role="group"
        aria-label="留言给谁"
      >
        <button
          v-for="person in others"
          :key="person.user_id"
          type="button"
          :aria-pressed="target === person.user_id"
          :class="{ selected: target === person.user_id }"
          :disabled="busy"
          @click="target = person.user_id"
        >
          {{ person.nickname }}
        </button>
      </div>
      <p v-else class="note-empty">室友加入后，就能给他们留言了。</p>
      <label v-if="others.length" for="companion-note-text" class="sr-only"
        >留言内容</label
      ><textarea
        v-if="others.length"
        id="companion-note-text"
        v-model="text"
        rows="3"
        maxlength="240"
        :disabled="busy"
        placeholder="比如：晚点回来，帮我留个门。"
        aria-describedby="companion-note-count"
      />
      <span v-if="others.length" id="companion-note-count" class="note-count"
        >{{ length }} / 120</span
      >
      <p v-if="error" role="alert" class="note-error">{{ error }}</p>
      <button
        v-if="others.length"
        class="guest-primary"
        :disabled="busy || !target || !text.trim() || length > 120"
      >
        {{ busy ? "正在送达…" : "送给室友" }}
      </button>
    </form>
  </ElasticSheet>
</template>
<style scoped>
.companion-note-form {
  display: grid;
  gap: 16px;
}
.note-recipients {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.note-recipients button {
  padding: 10px 16px;
  border: 1px solid #e8e8e8;
  border-radius: 20px;
  background: #fff;
  color: #777;
  font: inherit;
  font-size: 14px;
}
.note-recipients button.selected {
  background: #222;
  color: #fff;
  border-color: #222;
}
.companion-note-form textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  min-height: 110px;
  padding: 16px;
  border: 1px solid #e8e8e8;
  background: #fafafa;
  border-radius: 20px;
  line-height: 1.7;
  font: inherit;
  font-size: 16px;
}
.note-count {
  font-size: 11px;
  color: #aaa;
  justify-self: end;
  margin-top: -10px;
}
.note-error,
.note-empty {
  color: #777;
  font-size: 13px;
  line-height: 1.7;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  clip-path: inset(50%);
  overflow: hidden;
}
</style>
