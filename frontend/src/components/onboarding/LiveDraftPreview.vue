<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { createDraftPreviewModel } from "./draftPreviewBoard";
import type { DormDraft } from "../../interaction/dormDraft";
import { reorderPage } from "../../interaction/dormDraft";
import ScreenStage from "../ScreenStage.vue";
import ChoreBoard from "../ChoreBoard.vue";
import ChoreBottomNav from "../ChoreBottomNav.vue";

const props = defineProps<{ draft: DormDraft; open: boolean }>();
const scrollRoot = ref<HTMLElement>();
const emit = defineEmits<{ close: [] }>();
const section = ref<"duty" | "water" | "calendar">(props.draft.pages[0]?.id || "duty");
const buildPreview = createDraftPreviewModel();
const previewTime = ref(new Date());
watch(() => props.open, open => { if (open) previewTime.value = new Date(); });
const previewData = computed(() => buildPreview(props.draft, previewTime.value));
function selectPage(value: "duty" | "water" | "calendar") { section.value = value; }
// Match the production router's scroll-to-top on page navigation, locally.
watch(section, () => scrollRoot.value?.scrollTo({ top: 0, left: 0, behavior: "instant" }), { flush: "post" });
function reorderPageItem(id: "duty" | "water" | "calendar", toIndex: number) {
  const from = props.draft.pages.findIndex((page) => page.id === id);
  if (from >= 0) reorderPage(props.draft, from, toIndex);
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="scrollRoot"
      class="live-preview"
      :class="{ 'is-open': open }"
      :aria-hidden="!open"
      :inert="!open"
      data-testid="live-draft-preview"
    >
      <ScreenStage signed-in preserve-content-layout :scroll-root="scrollRoot">
        <main class="guest-page has-chore-nav">
          <section class="guest-personal">
        <ChoreBoard
          :invite="`draft-${draft.name || 'new-room'}`"
          :dorm-name="draft.name || '新宿舍'"
          :member-id="-1"
          token=""
          :demo="false"
          preview
          :preview-data="previewData"
          :pages="draft.pages"
          :section="section"
          @section-change="selectPage"
          @page-reorder="reorderPageItem"
          @exit-preview="emit('close')"
        />
          </section>
        </main>
        <ChoreBottomNav
          preview
          :section="section"
          :pages="draft.pages"
          @select="selectPage"
          @reorder="reorderPageItem"
        />
      </ScreenStage>
    </div>
  </Teleport>
</template>

<style scoped>
.live-preview { position: fixed; inset: 0; z-index: 210; overflow-y: auto; overscroll-behavior: contain; background: var(--canvas); opacity: 0; transform: scale(.995); pointer-events: none; transition: opacity 180ms cubic-bezier(.22,1,.36,1), transform 220ms cubic-bezier(.22,1,.36,1); }
.guest-page.has-chore-nav { padding-bottom: calc(104px + env(safe-area-inset-bottom)); }
.guest-page.has-chore-nav:has(.focus-pane.calendar-page) { padding-bottom: 0; }
.live-preview.is-open { opacity: 1; transform: none; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { .live-preview { transition: none; } }
</style>
