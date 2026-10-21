<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";

import { useElementSize } from "@vueuse/core";
import { format } from "date-fns";
import { computed } from "vue";

import type { CalendarEvent } from "~/types/calendar";

import { useCalendar } from "~/composables/useCalendar";
import { useStableDate } from "~/composables/useStableDate";

const props = defineProps<{
  weeks: Date[][];
  events: CalendarEvent[];
  isCurrentMonth: boolean;
  eventHeight?: number;
}>();

const emit = defineEmits<{
  (e: "eventCreate", date: Date): void;
  (e: "eventClick", event: CalendarEvent, mouseEvent: MouseEvent): void;
}>();

const MIN_VISIBLE_SLOTS = 3;
const CELL_CHROME_HEIGHT = 44;
const COMPACT_EVENT_HEIGHT = 20;
const EMPTY_STATE_HEIGHT = 56;
const COMPACT_EMPTY_STATE_HEIGHT = 32;
const EVENT_GAP = 4;

const {
  isToday,
  handleEventClick: _handleEventClick,
  scrollToDate,
  getAllEventsForDay,
  isPlaceholderEvent,
  sortEvents,
  computedEventHeight: getEventHeight,
} = useCalendar();

const { getStableDate } = useStableDate();
const { isPhone, isLargeScreen } = useAppLayout();

const weekdayLabels = computed(() =>
  isPhone.value
    ? ["S", "M", "T", "W", "T", "F", "S"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
);

const sampleList = ref<HTMLElement | null>(null);
const { height: listHeight } = useElementSize(sampleList);

const normalEventHeight = computed(() =>
  getEventHeight("month", props.eventHeight),
);

const isCompact = computed(
  () =>
    isPhone.value
    || (listHeight.value > 0
      && listHeight.value
      < (normalEventHeight.value + EVENT_GAP) * MIN_VISIBLE_SLOTS - EVENT_GAP),
);

const emptyStateSize = computed(() => {
  const isMeasured = listHeight.value > 0;
  if (isMeasured && listHeight.value < COMPACT_EMPTY_STATE_HEIGHT)
    return "icon";
  if (isPhone.value || (isMeasured && listHeight.value < EMPTY_STATE_HEIGHT))
    return "compact";
  return "full";
});

const itemHeight = computed(() =>
  isCompact.value ? COMPACT_EVENT_HEIGHT : normalEventHeight.value,
);

const minRowHeight = computed(() =>
  isLargeScreen.value
    ? CELL_CHROME_HEIGHT + COMPACT_EVENT_HEIGHT
    : CELL_CHROME_HEIGHT
      + MIN_VISIBLE_SLOTS * itemHeight.value
      + (MIN_VISIBLE_SLOTS - 1) * EVENT_GAP,
);

const slots = computed(() => {
  if (listHeight.value === 0)
    return MIN_VISIBLE_SLOTS;
  return Math.max(
    1,
    Math.floor((listHeight.value + EVENT_GAP) / (itemHeight.value + EVENT_GAP)),
  );
});

const monthRoot = ref<HTMLElement | null>(null);
const weekdayHeader = ref<HTMLElement | null>(null);
const { height: containerHeight } = useElementSize(
  computed(() => monthRoot.value?.parentElement ?? null),
);
const { height: weekdayHeaderHeight } = useElementSize(weekdayHeader, undefined, {
  box: "border-box",
});

const gridRowsStyle = computed(() => {
  const weekCount = props.weeks.length;
  if (containerHeight.value === 0 || weekCount === 0) {
    return {
      gridTemplateRows: `repeat(${weekCount}, minmax(${minRowHeight.value}px, 1fr))`,
    };
  }
  const rowHeight = Math.max(
    minRowHeight.value,
    Math.floor((containerHeight.value - weekdayHeaderHeight.value) / weekCount),
  );
  return { gridTemplateRows: `repeat(${weekCount}, ${rowHeight}px)` };
});

const eventsByDay = computed(
  () =>
    new Map(
      props.weeks.flat().map(day => [
        format(day, "yyyy-MM-dd"),
        sortEvents(getAllEventsForDay(props.events, day)).filter(
          event => !isPlaceholderEvent(event),
        ),
      ]),
    ),
);

function getDayEvents(day: Date): CalendarEvent[] {
  return eventsByDay.value.get(format(day, "yyyy-MM-dd")) ?? [];
}

function getVisibleEvents(dayEvents: CalendarEvent[]) {
  return dayEvents.length <= slots.value
    ? dayEvents
    : dayEvents.slice(0, slots.value - 1);
}

function setSampleList(
  el: Element | ComponentPublicInstance | null,
  isFirst: boolean,
) {
  if (isFirst)
    sampleList.value = el instanceof HTMLElement ? el : null;
}

onMounted(() => {
  scrollToDate(getStableDate(), "month");
});

watch(
  () => props.weeks,
  () => {
    nextTick(() => {
      scrollToDate(getStableDate(), "month");
    });
  },
);

function handleEventClick(event: CalendarEvent, e: MouseEvent) {
  _handleEventClick(event, e, emit);
}
</script>

<template>
  <div ref="monthRoot" class="flex min-h-full w-full shrink-0 flex-col">
    <div
      ref="weekdayHeader"
      class="sticky top-0 z-30 grid grid-cols-7 border-b border-default bg-muted/80 backdrop-blur-md"
    >
      <div
        v-for="(day, index) in weekdayLabels"
        :key="index"
        class="py-2 text-center text-sm font-medium text-muted"
      >
        {{ day }}
      </div>
    </div>
    <div class="grid w-full flex-1 grid-cols-7" :style="gridRowsStyle">
      <div
        v-for="(week, weekIndex) in weeks"
        :key="weekIndex"
        class="contents"
      >
        <div
          v-for="(day, dayIndex) in week"
          :key="day.toString()"
          :data-date="format(day, 'yyyy-MM-dd')"
          class="group flex min-h-0 flex-col border border-default last:border-r-0"
          :class="{
            'bg-muted/25 text-muted': !isCurrentMonth,
            'bg-info/10': isToday(day),
          }"
        >
          <div class="flex justify-end items-center p-0.5">
            <div
              class="inline-flex h-6 w-6 items-center justify-center rounded-full text-sm"
              :class="{
                'bg-primary text-white': isToday(day),
                'text-muted': !isToday(day),
              }"
            >
              <NuxtTime :datetime="day" day="numeric" />
            </div>
          </div>
          <div class="border-b border-default mb-1" />
          <div
            :ref="(el) => setSampleList(el, weekIndex === 0 && dayIndex === 0)"
            class="flex-1 min-h-0 overflow-hidden px-0.5 sm:px-2 py-1 relative z-10 flex flex-col"
            :style="{ gap: `${EVENT_GAP}px` }"
          >
            <div
              v-for="event in getVisibleEvents(getDayEvents(day))"
              :key="`${event.id}-${day.toISOString().slice(0, 10)}`"
              class="rounded overflow-hidden shrink-0"
              :style="{ height: `${itemHeight}px` }"
            >
              <CalendarEventItem
                :event="event"
                view="month"
                :current-day="day"
                :compact="isCompact"
                class="rounded h-full justify-center"
                @click="(e) => handleEventClick(event, e)"
              />
            </div>
            <CalendarMoreEventsPopover
              v-if="getDayEvents(day).length > slots"
              :day="day"
              :events="getDayEvents(day)"
              :hidden-count="getDayEvents(day).length - getVisibleEvents(getDayEvents(day)).length"
              view="month"
              :button-height="itemHeight"
              @event-click="handleEventClick"
            />
            <div
              v-show="getDayEvents(day).length === 0"
              class="flex flex-col items-center justify-center text-center text-muted flex-1 min-h-0"
              :class="emptyStateSize === 'full' ? 'gap-1' : 'gap-0.5'"
            >
              <UIcon
                name="i-lucide-calendar-off"
                class="shrink-0"
                :class="emptyStateSize === 'full' ? 'w-6 h-6' : 'w-4 h-4'"
              />
              <span v-if="emptyStateSize === 'full'" class="text-md">
                {{ isToday(day) ? "No events today" : "No events" }}
              </span>
              <span
                v-else-if="emptyStateSize === 'compact'"
                class="text-[10px] leading-tight"
              >
                No events
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
