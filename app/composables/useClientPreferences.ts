import {
  createSharedComposable,
  useMediaQuery,
  useMounted,
  useStorage,
} from "@vueuse/core";

import type { ClientPreferences, ResolvedNavigation } from "~/types/ui";

import { defaultClientPreferences, getFontStack, resolveNavigation } from "~/types/ui";

const STORAGE_KEY = "skylite-client-preferences";

function usePreferencesStorage() {
  return useStorage<ClientPreferences>(
    STORAGE_KEY,
    defaultClientPreferences,
    undefined,
    { mergeDefaults: true },
  );
}

export function useClientPreferences() {
  const preferences = usePreferencesStorage();

  function updatePreferences(partial: Partial<ClientPreferences>) {
    preferences.value = { ...preferences.value, ...partial };
  }

  if (import.meta.client) {
    const colorMode = useColorMode();
    const resolved = computed(() => {
      const mode = preferences.value?.colorMode ?? "system";
      if (mode === "system") {
        return typeof window !== "undefined"
          && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }
      return mode;
    });
    watch(
      resolved,
      (value) => {
        colorMode.preference = value;
      },
      { immediate: true },
    );
    const font = computed(
      () => preferences.value?.font ?? ("system" as const),
    );
    watch(
      font,
      (value) => {
        document.documentElement.style.setProperty(
          "--app-font-sans",
          getFontStack(value),
        );
      },
      { immediate: true },
    );
  }

  return {
    preferences,
    updatePreferences,
  };
}

function createAppLayout() {
  const preferences = usePreferencesStorage();
  const isMounted = useMounted();
  const portraitQuery = useMediaQuery("(orientation: portrait)");
  const phoneQuery = useMediaQuery("(max-width: 639px)");
  const shortQuery = useMediaQuery("(max-height: 499px)");
  const coarseQuery = useMediaQuery("(pointer: coarse)");
  const largeTabletQuery = useMediaQuery("(min-width: 700px) and (min-height: 700px)");
  const wideQuery = useMediaQuery("(min-width: 900px)");
  const isDockHidden = useState("dock-hidden", () => false);

  const isPortrait = computed(() => isMounted.value && portraitQuery.value);
  const isPhone = computed(() => isMounted.value && phoneQuery.value);
  const isShortScreen = computed(() => isMounted.value && shortQuery.value);
  const isWideScreen = computed(() => isMounted.value && wideQuery.value);
  const isPhoneDevice = computed(
    () => isMounted.value && coarseQuery.value && (phoneQuery.value || shortQuery.value),
  );
  const isLargeScreen = computed(
    () => isMounted.value && (!coarseQuery.value || largeTabletQuery.value),
  );
  const navigation = computed<ResolvedNavigation>(() =>
    isMounted.value
      ? resolveNavigation(preferences.value?.navigationLayout, isPortrait.value)
      : "sidebar",
  );
  const isDockAutoHide = computed(
    () => navigation.value === "dock" && isPhone.value,
  );
  const isWideLandscape = computed(() => !isPortrait.value && isWideScreen.value);
  const dialogBarClass = computed(() => isShortScreen.value ? "px-4 py-2" : "p-4");

  function dialogPanelClass(widthClass: string) {
    if (isPhoneDevice.value)
      return "w-full h-dvh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]";
    const width = isWideLandscape.value ? "w-[min(56rem,calc(100vw-2rem))]" : widthClass;
    return `${width} max-h-[90dvh] rounded-lg border border-default shadow-lg`;
  }

  watch(isDockAutoHide, (enabled) => {
    if (!enabled)
      isDockHidden.value = false;
  });

  return {
    isPortrait,
    isPhone,
    isShortScreen,
    isWideScreen,
    isPhoneDevice,
    isLargeScreen,
    isWideLandscape,
    navigation,
    isDockAutoHide,
    isDockHidden,
    dialogPanelClass,
    dialogBarClass,
  };
}

export const useAppLayout = import.meta.client
  ? createSharedComposable(createAppLayout)
  : createAppLayout;
