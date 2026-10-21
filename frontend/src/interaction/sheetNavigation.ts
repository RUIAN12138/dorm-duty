import {
  computed,
  inject,
  provide,
  shallowRef,
  ref,
  type ComputedRef,
  type InjectionKey,
} from "vue";
type Page = {
  id: symbol;
  title: ComputedRef<string>;
  close: () => void;
  footer: boolean;
  contained: boolean;
  fixedContent: boolean;
  height?: string;
};
const key: InjectionKey<ReturnType<typeof createNavigation>> = Symbol(
  "settings-sheet-navigation",
);
function createNavigation() {
  const active = ref(false),
    target = shallowRef<HTMLElement>(),
    footerTarget = shallowRef<HTMLElement>(),
    headerTarget = shallowRef<HTMLElement>(),
    pages = shallowRef<Page[]>([]);
  const current = computed(() => pages.value.at(-1));
  const direction = ref("forward");
  const scrollPositions = new Map<symbol | undefined, number>();
  return {
    active,
    target,
    footerTarget,
    headerTarget,
    pages,
    current,
    direction,
    scrollPositions,
    start() {
      scrollPositions.clear();
      direction.value = "forward";
      active.value = true;
    },
    push(page: Page) {
      if (!pages.value.some((p) => p.id === page.id)) {
        direction.value = "forward";
        pages.value = [...pages.value, page];
      }
    },
    remove(id: symbol) {
      if (current.value?.id === id) direction.value = "back";
      pages.value = pages.value.filter((p) => p.id !== id);
    },
    back() {
      current.value?.close();
    },
    end() {
      active.value = false;
      scrollPositions.clear();
      const previous = pages.value;
      pages.value = [];
      previous.reverse().forEach((p) => p.close());
    },
  };
}
// Only settings opts in. Task/calendar/entry sheets keep their presentation.
export function provideSheetNavigation() {
  const navigation = inject(key, undefined) || createNavigation();
  provide(key, navigation);
  return navigation;
}
export function useSheetNavigation() {
  return inject(key, undefined);
}
