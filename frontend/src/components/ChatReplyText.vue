<script setup lang="ts">
import { computed } from "vue";
import { motionAllowed } from "../interaction/motion";
import { graphemes } from "../interaction/chatReplyText";
const props = defineProps<{
  text: string;
  animated?: boolean;
}>();
const chunkSize = 2;
// A bounded queue: long replies are grouped into at most 20 chunks, and the
// last chunk starts within ~240ms. Each chunk fades/blurs in over 200ms, so
// the whole reveal stays under ~440ms without replaying the bubble itself.
const chunks = computed(() => {
  const characters = graphemes(props.text);
  if (!characters.length) return [];
  const size = Math.max(chunkSize, Math.ceil(characters.length / 20));
  const groups: string[] = [];
  for (let index = 0; index < characters.length; index += size)
    groups.push(characters.slice(index, index + size).join(""));
  return groups;
});
const animated = computed(() => !!props.animated && motionAllowed());
const stagger = computed(() =>
  chunks.value.length > 1 ? Math.min(14, 240 / (chunks.value.length - 1)) : 0,
);
</script>
<template>
  <span v-if="!animated">{{ text }}</span>
  <span v-else class="chat-reply-text"
    ><span
      v-for="(chunk, index) in chunks"
      :key="index"
      class="chat-reply-chunk"
      :style="{ animationDelay: `${Math.round(index * stagger)}ms` }"
      >{{ chunk }}</span
    ></span
  >
</template>
<style scoped>
.chat-reply-text {
  /* Chunks are inline so wrapping, selection and bubble width stay intact. */
  display: inline;
}
.chat-reply-chunk {
  display: inline;
  opacity: 0;
  filter: blur(2px);
  animation: chat-reply-settle 200ms var(--ui-ease-out) both;
}
@keyframes chat-reply-settle {
  to {
    opacity: 1;
    filter: blur(0);
  }
}
:global(html[data-interaction="keyboard"]) .chat-reply-chunk {
  opacity: 1;
  filter: none;
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .chat-reply-chunk {
    opacity: 1;
    filter: none;
    animation: none;
  }
}
</style>
