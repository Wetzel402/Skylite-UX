import { CalendarDateTime, fromDate } from "@internationalized/date";
import { endOfDay, endOfMonth, endOfWeek } from "date-fns";

import type { CalendarView } from "~/types/calendar";
import type { Priority, ShoppingList, TodoList } from "~/types/database";

export type ConnectionTestResult = {
  success: boolean;
  message?: string;
  error?: string;
  isLoading?: boolean;
} | null;

export type ShoppingListWithIntegration = ShoppingList & {
  source: "native" | "integration";
  integrationId?: string;
  integrationName?: string;
  integrationIcon?: string | null;
  hiddenItemCount?: number;
};

export type TodoListWithIntegration = TodoList & {
  source: "native" | "integration";
  integrationId?: string;
  integrationName?: string;
  integrationIcon?: string | null;
  hiddenItemCount?: number;
};

export type AnyListWithIntegration
  = | ShoppingListWithIntegration
    | TodoListWithIntegration;

export type ToggleEvent = {
  itemId: string;
  checked: boolean;
};

export type ReorderEvent = {
  itemId: string;
  newOrder: number;
  direction?: "up" | "down";
};

export type ReorderDirectionEvent = {
  itemId: string;
  direction: "up" | "down";
};

export type DialogField = {
  key: string;
  label: string;
  type: "text" | "number" | "textarea";
  placeholder?: string;
  min?: number;
  required?: boolean;
  disabled?: boolean;
  canEdit: boolean;
};

export type IntegrationSettingsField = {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "color" | "boolean";
  placeholder?: string;
  required?: boolean;
  description?: string;
};

export type ToastType = "error" | "warning" | "success" | "info";

export type GlobalFloatingActionButtonProps = {
  icon?: string;
  label?: string;
  color?: "primary" | "secondary" | "success" | "warning" | "error";
  size?: "sm" | "md" | "lg";
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  disabled?: boolean;
};

const SYSTEM_FONT_STACK = "ui-sans-serif, system-ui, sans-serif";

const FONT_PREFERENCES = [
  { value: "system", label: "System", stack: SYSTEM_FONT_STACK },
  {
    value: "inclusiveSans",
    label: "Inclusive Sans",
    stack: `"Inclusive Sans", ${SYSTEM_FONT_STACK}`,
  },
  {
    value: "notoSans",
    label: "Noto Sans",
    stack: `"Noto Sans", ${SYSTEM_FONT_STACK}`,
  },
  {
    value: "ebGaramond",
    label: "EB Garamond",
    stack: `"EB Garamond", ${SYSTEM_FONT_STACK}`,
  },
  {
    value: "ibmPlexMono",
    label: "IBM Plex Mono",
    stack: `"IBM Plex Mono", ${SYSTEM_FONT_STACK}`,
  },
  {
    value: "ovo",
    label: "Ovo",
    stack: `"Ovo", ${SYSTEM_FONT_STACK}`,
  },
  {
    value: "handlee",
    label: "Handlee",
    stack: `"Handlee", ${SYSTEM_FONT_STACK}`,
  },
] as const;

export type FontPreference = (typeof FONT_PREFERENCES)[number]["value"];

export type TodoSortMode = "date" | "priority" | "alpha";

export type TodoDueRange = "all" | "day" | "week" | "month";

export type NavigationLayout = "auto" | "sidebar" | "dock";

export type ResolvedNavigation = "sidebar" | "dock";

export type NavigationItem = {
  path: string;
  label: string;
  icon: string;
};

export type ClientPreferences = {
  colorMode?: "light" | "dark" | "system";
  notifications?: boolean;
  font?: FontPreference;
  defaultView?: string;
  calendarView?: CalendarView;
  showWeekNumbers?: boolean;
  navigationLayout?: NavigationLayout;
};

export const MAIN_VIEW_OPTIONS: NavigationItem[] = [
  { path: "/calendar", label: "Calendar", icon: "i-lucide-calendar-days" },
  { path: "/toDoLists", label: "Todo Lists", icon: "i-lucide-list-todo" },
  { path: "/shoppingLists", label: "Shopping Lists", icon: "i-lucide-shopping-cart" },
  { path: "/mealplanner", label: "Meal Planner", icon: "i-lucide-utensils" },
];

export const NAVIGATION_ITEMS: NavigationItem[] = [
  ...MAIN_VIEW_OPTIONS,
  { path: "/settings", label: "Settings", icon: "i-lucide-settings" },
];

export const NAVIGATION_LAYOUT_OPTIONS: { value: NavigationLayout; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "sidebar", label: "Sidebar" },
  { value: "dock", label: "Dock" },
];

export function resolveNavigation(
  preference: NavigationLayout | undefined,
  isPortrait: boolean,
): ResolvedNavigation {
  if (preference === "sidebar" || preference === "dock")
    return preference;
  return isPortrait ? "dock" : "sidebar";
}

export function isActivePath(currentPath: string, path: string) {
  return currentPath.toLowerCase() === path.toLowerCase();
}

export const defaultClientPreferences: ClientPreferences = {
  colorMode: "system",
  notifications: false,
  font: "system",
  defaultView: "/calendar",
  calendarView: "week",
  showWeekNumbers: false,
  navigationLayout: "auto",
};

export const TODO_SORT_OPTIONS: { value: TodoSortMode; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "priority", label: "Priority" },
  { value: "alpha", label: "A-Z" },
];

export const TODO_DUE_RANGE_OPTIONS: { value: TodoDueRange; label: string }[] = [
  { value: "all", label: "All" },
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export function getDueRangeCutoff(
  range: TodoDueRange,
  now: Date,
  timezone: string,
): Date | null {
  if (range === "all")
    return null;

  const zone = isValidTimezone(timezone) ? timezone : "UTC";

  const nowInZone = fromDate(now, zone);
  const wallClockNow = new Date(
    nowInZone.year,
    nowInZone.month - 1,
    nowInZone.day,
    nowInZone.hour,
    nowInZone.minute,
    nowInZone.second,
  );

  let wallClockCutoff: Date;
  if (range === "day")
    wallClockCutoff = endOfDay(wallClockNow);
  else if (range === "week")
    wallClockCutoff = endOfWeek(wallClockNow, { weekStartsOn: 0 });
  else
    wallClockCutoff = endOfMonth(wallClockNow);

  return new CalendarDateTime(
    wallClockCutoff.getFullYear(),
    wallClockCutoff.getMonth() + 1,
    wallClockCutoff.getDate(),
    wallClockCutoff.getHours(),
    wallClockCutoff.getMinutes(),
    wallClockCutoff.getSeconds(),
    wallClockCutoff.getMilliseconds(),
  ).toDate(zone);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    return Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions().timeZone.length > 0;
  }
  catch {
    return false;
  }
}

export function isTodoWithinDueRange(
  dueDate: Date | null,
  completed: boolean,
  cutoff: Date | null,
): boolean {
  if (!cutoff)
    return true;
  if (completed)
    return true;
  if (!dueDate)
    return true;
  return dueDate <= cutoff;
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: "text-green-600 bg-green-50 dark:bg-green-950",
  MEDIUM: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950",
  HIGH: "text-orange-600 bg-orange-50 dark:bg-orange-950",
  URGENT: "text-red-600 bg-red-50 dark:bg-red-950",
};

export function getPriorityColor(priority: Priority): string {
  return PRIORITY_COLORS[priority] ?? "text-muted bg-muted";
}

export const FONT_STACKS: Record<FontPreference, string> = Object.fromEntries(
  FONT_PREFERENCES.map(f => [f.value, f.stack]),
) as Record<FontPreference, string>;

export const FONT_OPTIONS: { label: string; value: FontPreference }[]
  = FONT_PREFERENCES.map(({ value, label }) => ({ value, label }));

export function getFontStack(font: FontPreference | undefined): string {
  if (!font || font === "system")
    return SYSTEM_FONT_STACK;
  return FONT_STACKS[font] ?? SYSTEM_FONT_STACK;
}
