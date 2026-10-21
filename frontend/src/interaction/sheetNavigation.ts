import {
  computed,
  inject,
  provide,
  shallowRef,
  ref,
  type ComputedRef,
  type InjectionKey,
} from "vue";
type Page = { id: symbol; title: ComputedRef<string>; close: () => void };
const key: InjectionKey<ReturnType<typeof createNavigation>> = Symbol(
  "settings-sheet-navigation",
);
function createNavigation() {
  const active = ref(false),
    target = shallowRef<HTMLElement>(),
    pages = shallowRef<Page[]>([]);
  const current = computed(() => pages.value.at(-1));
  return {
    active,
    target,
    pages,
    current,
    start() {
      active.value = true;
    },
    push(page: Page) {
      if (!pages.value.some((p) => p.id === page.id))
        pages.value = [...pages.value, page];
    },
    remove(id: symbol) {
      pages.value = pages.value.filter((p) => p.id !== id);
    },
    back() {
      current.value?.close();
    },
    end() {
      active.value = false;
      const previous = pages.value;
      pages.value = [];
      previous.reverse().forEach((p) => p.close());
    },
  };
}
// Only settings opts in. Task/calendar/entry sheets keep their presentation.
export function provideSheetNavigation() {
  const navigation = createNavigation();
  provide(key, navigation);
  return navigation;
}
export function useSheetNavigation() {
  return inject(key, undefined);
}
