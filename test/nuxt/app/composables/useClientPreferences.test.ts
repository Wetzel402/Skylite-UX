import type { Ref } from "vue";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppLayout } from "~/composables/useClientPreferences";

const mediaQueries = vi.hoisted(() => new Map<string, Ref<boolean>>());

vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  const { ref } = await import("vue");
  return {
    ...actual,
    useMounted: () => ref(true),
    useMediaQuery: (query: string) => {
      if (!mediaQueries.has(query))
        mediaQueries.set(query, ref(false));
      return mediaQueries.get(query);
    },
  };
});

const QUERIES = {
  portrait: "(orientation: portrait)",
  phone: "(max-width: 639px)",
  short: "(max-height: 499px)",
  coarse: "(pointer: coarse)",
  wide: "(min-width: 900px)",
};

type ScreenFlags = Partial<Record<keyof typeof QUERIES, boolean>>;

function setScreen(flags: ScreenFlags) {
  for (const [key, query] of Object.entries(QUERIES)) {
    const media = mediaQueries.get(query);
    if (media)
      media.value = flags[key as keyof typeof QUERIES] ?? false;
  }
}

const WIDTH = "w-[min(425px,calc(100vw-1rem))]";
const WIDE_WIDTH = "w-[min(56rem,calc(100vw-2rem))]";

describe("useAppLayout", () => {
  beforeEach(() => {
    useAppLayout();
    setScreen({});
  });

  describe("dialogPanelClass", () => {
    it("fills the screen on a phone in portrait", () => {
      setScreen({ coarse: true, phone: true, portrait: true });
      const panel = useAppLayout().dialogPanelClass(WIDTH);
      expect(panel).toContain("w-full h-dvh");
      expect(panel).not.toContain("max-h-[90dvh]");
    });

    it("fills the screen on a phone in landscape", () => {
      setScreen({ coarse: true, short: true });
      expect(useAppLayout().dialogPanelClass(WIDTH)).toContain("w-full h-dvh");
    });

    it("uses the given width in a narrow desktop window", () => {
      setScreen({ phone: true });
      const panel = useAppLayout().dialogPanelClass(WIDTH);
      expect(panel).toContain(WIDTH);
      expect(panel).toContain("max-h-[90dvh]");
    });

    it("stretches to 56rem on wide landscape screens", () => {
      setScreen({ wide: true });
      const panel = useAppLayout().dialogPanelClass(WIDTH);
      expect(panel).toContain(WIDE_WIDTH);
      expect(panel).not.toContain(WIDTH);
    });

    it("keeps the given width on wide portrait screens", () => {
      setScreen({ wide: true, portrait: true });
      const { dialogPanelClass, isWideLandscape } = useAppLayout();
      expect(isWideLandscape.value).toBe(false);
      expect(dialogPanelClass(WIDTH)).toContain(WIDTH);
    });
  });

  describe("dialogBarClass", () => {
    it("uses compact padding on short screens", () => {
      setScreen({ short: true });
      expect(useAppLayout().dialogBarClass.value).toBe("px-4 py-2");
    });

    it("uses default padding otherwise", () => {
      expect(useAppLayout().dialogBarClass.value).toBe("p-4");
    });
  });
});
