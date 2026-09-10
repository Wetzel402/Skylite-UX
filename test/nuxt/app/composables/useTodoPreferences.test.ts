import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockNuxtImport } from "@nuxt/test-utils/runtime";

const { mockUseCookie, cookieRefs, mockOnMounted } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref } = require("vue");
  const refs = new Map<string, ReturnType<typeof ref>>();
  return {
    cookieRefs: refs,
    mockUseCookie: vi.fn((key: string) => {
      if (!refs.has(key)) {
        refs.set(key, ref(undefined));
      }
      return refs.get(key)!;
    }),
    // Run the callback synchronously so mount-time migration logic is testable.
    mockOnMounted: vi.fn((cb: () => void) => cb()),
  };
});

mockNuxtImport("useCookie", () => mockUseCookie);
mockNuxtImport("onMounted", () => mockOnMounted);

import { useTodoPreferences } from "../../../../app/composables/useTodoPreferences";

describe("useTodoPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieRefs.clear();
    localStorage.clear();
  });

  it("defaults todoDueRange to 'all' and todoSortBy to 'date' when cookies are unset", () => {
    const { todoDueRange, todoSortBy } = useTodoPreferences();
    expect(todoDueRange.value).toBe("all");
    expect(todoSortBy.value).toBe("date");
  });

  it("reflects a valid cookie value", () => {
    cookieRefs.set("skylite-todo-due-range", { value: "week" });
    cookieRefs.set("skylite-todo-sort-by", { value: "priority" });
    const { todoDueRange, todoSortBy } = useTodoPreferences();
    expect(todoDueRange.value).toBe("week");
    expect(todoSortBy.value).toBe("priority");
  });

  it("falls back to defaults for an invalid/tampered cookie value", () => {
    cookieRefs.set("skylite-todo-due-range", { value: "not-a-real-range" });
    cookieRefs.set("skylite-todo-sort-by", { value: "not-a-real-mode" });
    const { todoDueRange, todoSortBy } = useTodoPreferences();
    expect(todoDueRange.value).toBe("all");
    expect(todoSortBy.value).toBe("date");
  });

  it("writes through setTodoDueRange/setTodoSortBy", () => {
    const { setTodoDueRange, setTodoSortBy, todoDueRange, todoSortBy } = useTodoPreferences();
    setTodoDueRange("month");
    setTodoSortBy("alpha");
    expect(todoDueRange.value).toBe("month");
    expect(todoSortBy.value).toBe("alpha");
  });

  it("migrates legacy localStorage prefs into cookies when cookies are unset", () => {
    localStorage.setItem(
      "skylite-client-preferences",
      JSON.stringify({ todoDueRange: "month", todoSortBy: "priority" }),
    );
    const { todoDueRange, todoSortBy } = useTodoPreferences();
    expect(todoDueRange.value).toBe("month");
    expect(todoSortBy.value).toBe("priority");
  });

  it("ignores invalid legacy localStorage values", () => {
    localStorage.setItem(
      "skylite-client-preferences",
      JSON.stringify({ todoDueRange: "bogus", todoSortBy: "bogus" }),
    );
    const { todoDueRange, todoSortBy } = useTodoPreferences();
    expect(todoDueRange.value).toBe("all");
    expect(todoSortBy.value).toBe("date");
  });

  it("ignores malformed legacy localStorage JSON without throwing", () => {
    localStorage.setItem("skylite-client-preferences", "{not json");
    expect(() => useTodoPreferences()).not.toThrow();
  });

  it("migrates only the missing preference when one cookie is already set", () => {
    cookieRefs.set("skylite-todo-due-range", { value: "day" });
    localStorage.setItem(
      "skylite-client-preferences",
      JSON.stringify({ todoDueRange: "month", todoSortBy: "priority" }),
    );
    const { todoDueRange, todoSortBy } = useTodoPreferences();
    expect(todoDueRange.value).toBe("day");
    expect(todoSortBy.value).toBe("priority");
  });

  it("does not run migration when both cookies are already set", () => {
    cookieRefs.set("skylite-todo-due-range", { value: "day" });
    cookieRefs.set("skylite-todo-sort-by", { value: "alpha" });
    localStorage.setItem(
      "skylite-client-preferences",
      JSON.stringify({ todoDueRange: "month", todoSortBy: "priority" }),
    );
    const { todoDueRange, todoSortBy } = useTodoPreferences();
    expect(todoDueRange.value).toBe("day");
    expect(todoSortBy.value).toBe("alpha");
  });
});
