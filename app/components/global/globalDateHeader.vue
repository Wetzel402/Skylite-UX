<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

import { addDays, endOfWeek, isSameMonth, startOfWeek } from "date-fns";

import type { CalendarView } from "~/types/calendar";
import type { TodoDueRange, TodoSortMode } from "~/types/ui";

import { useStableDate } from "~/composables/useStableDate";
import { TODO_DUE_RANGE_OPTIONS, TODO_SORT_OPTIONS } from "~/types/ui";

const props = defineProps<{
  showNavigation?: boolean;
  showViewSelector?: boolean;
  showTodoSortSelector?: boolean;
  showTodoFilterSelector?: boolean;
  currentDate?: Date;
  view?: CalendarView;
  todoSortBy?: TodoSortMode;
  todoDueRange?: TodoDueRange;
  className?: string;
}>();

const emit = defineEmits<{
  (e: "previous"): void;
  (e: "next"): void;
  (e: "today"): void;
  (e: "viewChange", view: CalendarView): void;
  (e: "dateChange", date: Date): void;
  (e: "todoSortChange", mode: TodoSortMode): void;
  (e: "todoDueRangeChange", range: TodoDueRange): void;
}>();

const { getStableDate } = useStableDate();
const { isShortScreen, isPhone } = useAppLayout();
const compact = computed(() => isShortScreen.value || isPhone.value);

const currentDate = computed(() => props.currentDate || getStableDate());
const view = computed(() => props.view || "week");

const now = ref(new Date());

onMounted(() => {
  const interval = setInterval(() => {
    now.value = new Date();
  }, 30000);

  onBeforeUnmount(() => {
    clearInterval(interval);
  });
});

const viewTitle = computed(() => {
  if (view.value === "month") {
    return "month";
  }
  else if (view.value === "week") {
    const start = startOfWeek(currentDate.value, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate.value, { weekStartsOn: 0 });
    if (isSameMonth(start, end)) {
      return "week-same-month";
    }
    else {
      return "week-different-months";
    }
  }
  else if (view.value === "day") {
    return "day";
  }
  else if (view.value === "agenda") {
    const start = currentDate.value;
    const end = addDays(currentDate.value, 30 - 1);
    if (isSameMonth(start, end)) {
      return "agenda-same-month";
    }
    else {
      return "agenda-different-months";
    }
  }
  return "month";
});

const items: DropdownMenuItem[][] = [
  [
    {
      label: "Month",
      icon: "i-lucide-calendar-days",
      onSelect: () => emit("viewChange", "month"),
    },
    {
      label: "Week",
      icon: "i-lucide-calendar-range",
      onSelect: () => {
        emit("viewChange", "week");
        emit("dateChange", getStableDate());
      },
    },
    {
      label: "Day",
      icon: "i-lucide-calendar-1",
      onSelect: () => emit("viewChange", "day"),
    },
    {
      label: "Agenda",
      icon: "i-lucide-list",
      onSelect: () => emit("viewChange", "agenda"),
    },
  ],
];

const todoSortItems: DropdownMenuItem[][] = [
  TODO_SORT_OPTIONS.map(opt => ({
    label: opt.label,
    onSelect: () => emit("todoSortChange", opt.value),
  })),
];

const todoSortLabel = computed(() =>
  TODO_SORT_OPTIONS.find(o => o.value === (props.todoSortBy ?? "date"))?.label ?? "Date",
);

const todoDueRangeItems: DropdownMenuItem[][] = [
  TODO_DUE_RANGE_OPTIONS.map(opt => ({
    label: opt.label,
    onSelect: () => emit("todoDueRangeChange", opt.value),
  })),
];

const todoDueRangeLabel = computed(() =>
  TODO_DUE_RANGE_OPTIONS.find(o => o.value === (props.todoDueRange ?? "all"))?.label ?? "All",
);

const isTodoDueFiltered = computed(() => (props.todoDueRange ?? "all") !== "all");

const controlSize = computed(() => compact.value ? "md" : "xl");

function handlePrevious() {
  emit("previous");
}

function handleNext() {
  emit("next");
}

function handleToday() {
  emit("today");
}
</script>

<template>
  <div
    :class="[
      className,
      isPhone
        ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1'
        : 'flex flex-col sm:flex-row sm:items-center justify-between gap-2',
    ]"
  >
    <div
      class="flex"
      :class="[
        compact
          ? 'flex-row items-baseline gap-2'
          : 'sm:flex-col max-sm:items-center justify-between gap-1.5',
        { 'col-start-1 row-start-1': isPhone },
      ]"
    >
      <div class="flex items-center gap-1.5">
        <h1
          class="font-semibold text-highlighted whitespace-nowrap"
          :class="compact ? 'text-lg' : 'text-xl'"
        >
          <NuxtTime
            :datetime="now"
            hour="numeric"
            minute="2-digit"
            :hour12="true"
          />
        </h1>
      </div>
      <div class="text-sm text-muted whitespace-nowrap">
        <NuxtTime
          :datetime="now"
          :weekday="compact ? 'short' : 'long'"
          :month="compact ? 'short' : 'long'"
          day="numeric"
        />
      </div>
    </div>

    <div
      v-if="showNavigation"
      class="flex items-center"
      :class="isPhone ? 'col-start-1 row-start-2 justify-start' : 'flex-1 justify-center'"
    >
      <h2
        class="font-semibold text-highlighted whitespace-nowrap"
        :class="compact ? 'text-base' : 'text-lg'"
      >
        <NuxtTime
          v-if="viewTitle === 'month'"
          :datetime="currentDate"
          month="long"
          year="numeric"
        />
        <NuxtTime
          v-else-if="viewTitle === 'week-same-month'"
          :datetime="startOfWeek(currentDate, { weekStartsOn: 0 })"
          month="long"
          year="numeric"
        />
        <span v-else-if="viewTitle === 'week-different-months'">
          <NuxtTime
            :datetime="startOfWeek(currentDate, { weekStartsOn: 0 })"
            month="short"
          />
          -
          <NuxtTime
            :datetime="endOfWeek(currentDate, { weekStartsOn: 0 })"
            month="short"
            year="numeric"
          />
        </span>
        <NuxtTime
          v-else-if="viewTitle === 'day'"
          :datetime="currentDate"
          month="long"
          day="numeric"
          year="numeric"
        />
        <NuxtTime
          v-else-if="viewTitle === 'agenda-same-month'"
          :datetime="currentDate"
          month="long"
          year="numeric"
        />
        <span v-else-if="viewTitle === 'agenda-different-months'">
          <NuxtTime :datetime="currentDate" month="short" /> -
          <NuxtTime
            :datetime="addDays(currentDate, 30 - 1)"
            month="short"
            year="numeric"
          />
        </span>
        <NuxtTime
          v-else
          :datetime="currentDate"
          month="long"
          year="numeric"
        />
      </h2>
    </div>

    <div
      v-if="showNavigation || showTodoSortSelector || showTodoFilterSelector"
      :class="isPhone ? 'contents' : 'flex items-center justify-between gap-2'"
    >
      <div
        v-if="showNavigation"
        class="flex items-center justify-between gap-2"
        :class="{ 'col-start-2 row-start-1 justify-self-end': isPhone }"
      >
        <div class="flex items-center sm:gap-2">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="ghost"
            :size="controlSize"
            aria-label="Previous"
            @click="handlePrevious"
          />
          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="ghost"
            :size="controlSize"
            aria-label="Next"
            @click="handleNext"
          />
        </div>
        <UButton
          color="primary"
          :size="controlSize"
          @click="handleToday"
        >
          Today
        </UButton>
      </div>
      <div
        v-if="showViewSelector"
        class="flex items-center justify-between gap-2"
        :class="{ 'col-start-2 row-start-2 justify-self-end': isPhone }"
      >
        <UDropdownMenu :items="items">
          <UButton
            color="neutral"
            variant="outline"
            :size="controlSize"
            trailing-icon="i-lucide-chevron-down"
          >
            <span class="capitalize">{{ view }}</span>
          </UButton>
        </UDropdownMenu>
      </div>
      <div
        v-if="showTodoSortSelector"
        class="flex items-center justify-between gap-2"
        :class="{ 'col-start-1 row-start-2 justify-self-start': isPhone }"
      >
        <UDropdownMenu :items="todoSortItems">
          <UButton
            color="neutral"
            variant="outline"
            :size="controlSize"
            icon="i-lucide-arrow-down-wide-narrow"
            trailing-icon="i-lucide-chevron-down"
            :aria-label="`Sort todos by ${todoSortLabel}`"
          >
            <span class="whitespace-nowrap">Sort: {{ todoSortLabel }}</span>
          </UButton>
        </UDropdownMenu>
      </div>
      <div
        v-if="showTodoFilterSelector"
        class="flex items-center justify-between gap-2"
        :class="{ 'col-start-2 row-start-2 justify-self-end': isPhone }"
      >
        <UFieldGroup>
          <UDropdownMenu :items="todoDueRangeItems">
            <UButton
              :color="isTodoDueFiltered ? 'primary' : 'neutral'"
              :variant="isTodoDueFiltered ? 'soft' : 'outline'"
              :size="controlSize"
              icon="i-lucide-filter"
              trailing-icon="i-lucide-chevron-down"
              :aria-label="`Filter todos by due date: ${todoDueRangeLabel}`"
            >
              <span class="whitespace-nowrap">Due: {{ todoDueRangeLabel }}</span>
            </UButton>
          </UDropdownMenu>
          <UButton
            v-if="isTodoDueFiltered"
            color="primary"
            variant="soft"
            :size="controlSize"
            icon="i-lucide-x"
            aria-label="Clear due date filter"
            @click="emit('todoDueRangeChange', 'all')"
          />
        </UFieldGroup>
      </div>
    </div>
  </div>
</template>
