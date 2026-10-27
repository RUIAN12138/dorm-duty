<script setup lang="ts">
defineProps<{ panelKey: string }>();
function leaving(el: Element) {
  el.setAttribute("inert", "");
  el.setAttribute("aria-hidden", "true");
}
function entering(el: Element) {
  el.removeAttribute("inert");
  el.removeAttribute("aria-hidden");
}
</script>
<template>
  <div class="creation-panels">
    <Transition
      name="creation-panel"
      @before-leave="leaving"
      @before-enter="entering"
    >
      <div
        :key="panelKey"
        class="creation-panel"
        :data-creation-panel="panelKey"
      >
        <slot />
      </div>
    </Transition>
  </div>
</template>
<style scoped>
.creation-panels {
  display: grid;
  align-items: start;
  min-width: 0;
}
.creation-panel {
  grid-area: 1/1;
  min-width: 0;
}
.creation-panel-enter-active {
  transition:
    opacity 180ms ease-out,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.creation-panel-leave-active {
  transition:
    opacity 120ms ease-out,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.creation-panel-enter-from {
  opacity: 0;
  transform: translateY(7px) scale(0.992);
}
.creation-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.995);
}
@media (prefers-reduced-motion: reduce) {
  .creation-panel-enter-active,
  .creation-panel-leave-active {
    transition: none;
  }
  .creation-panel-enter-from,
  .creation-panel-leave-to {
    transform: none;
  }
}
</style>
