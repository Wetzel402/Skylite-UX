import type { TodoDueRange, TodoSortMode } from "~/types/ui";

import {
  TODO_DUE_RANGE_OPTIONS,
  TODO_SORT_OPTIONS,
} from "~/types/ui";

const DUE_RANGE_COOKIE = "skylite-todo-due-range";
const SORT_BY_COOKIE = "skylite-todo-sort-by";

// Matches STORAGE_KEY in useClientPreferences.ts — todoDueRange/todoSortBy used to live there.
const LEGACY_STORAGE_KEY = "skylite-client-preferences";

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365,
};

const VALID_DUE_RANGES = new Set(TODO_DUE_RANGE_OPTIONS.map(o => o.value));
const VALID_SORT_MODES = new Set(TODO_SORT_OPTIONS.map(o => o.value));

function isValidDueRange(value: unknown): value is TodoDueRange {
  return typeof value === "string" && VALID_DUE_RANGES.has(value as TodoDueRange);
}

function isValidSortMode(value: unknown): value is TodoSortMode {
  return typeof value === "string" && VALID_SORT_MODES.has(value as TodoSortMode);
}

export function useTodoPreferences() {
  const dueRangeCookie = useCookie<TodoDueRange | undefined>(
    DUE_RANGE_COOKIE,
    cookieOptions,
  );
  const sortByCookie = useCookie<TodoSortMode | undefined>(
    SORT_BY_COOKIE,
    cookieOptions,
  );

  const todoDueRange = computed<TodoDueRange>(() =>
    isValidDueRange(dueRangeCookie.value) ? dueRangeCookie.value : "all",
  );
  const todoSortBy = computed<TodoSortMode>(() =>
    isValidSortMode(sortByCookie.value) ? sortByCookie.value : "date",
  );

  function setTodoDueRange(range: TodoDueRange) {
    dueRangeCookie.value = range;
  }

  function setTodoSortBy(mode: TodoSortMode) {
    sortByCookie.value = mode;
  }

  if (import.meta.client) {
    onMounted(() => {
      if (dueRangeCookie.value !== undefined && sortByCookie.value !== undefined) {
        return;
      }

      try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw)
          return;

        const saved = JSON.parse(raw) as {
          todoDueRange?: unknown;
          todoSortBy?: unknown;
        };

        if (dueRangeCookie.value === undefined && isValidDueRange(saved.todoDueRange)) {
          dueRangeCookie.value = saved.todoDueRange;
        }
        if (sortByCookie.value === undefined && isValidSortMode(saved.todoSortBy)) {
          sortByCookie.value = saved.todoSortBy;
        }
      }
      catch {
        // Ignore malformed/inaccessible localStorage — defaults already apply.
      }
    });
  }

  return {
    todoDueRange,
    todoSortBy,
    setTodoDueRange,
    setTodoSortBy,
  };
}
