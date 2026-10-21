<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";

import { createReusableTemplate, useElementSize } from "@vueuse/core";
import { addDays } from "date-fns";

import type { CalendarEvent } from "~/types/calendar";

import { useCalendar } from "~/composables/useCalendar";
import { useStableDate } from "~/composables/useStableDate";

const props = defineProps<{
  events: CalendarEvent[];
  startDate?: Date;
  eventHeight?: number;
}>();

const emit = defineEmits<{
  (e: "eventCreate", date: Date): void;
  (e: "eventClick", event: CalendarEvent, mouseEvent: MouseEvent): void;
}>();

const { getStableDate } = useStableDate();
const { isPortrait, isPhone, isLargeScreen } = useAppLayout();
const [DefineDayContent, DayContent] = createReusableTemplate<{
  day: Date;
  isFirst: boolean;
}>();

const gridClass = computed(() => {
  if (isPhone.value)
    return "grid-cols-1";
  if (isPortrait.value)
    return "h-full grid-cols-2 grid-rows-[repeat(4,minmax(150px,1fr))]";
  if (isLargeScreen.value)
    return "h-full grid-cols-4 grid-rows-[repeat(2,minmax(150px,1fr))]";
  return "grid-cols-4 grid-rows-2";
});

const cellClass = computed(() => {
  if (isPhone.value)
    return "min-h-[140px]";
  if (isPortrait.value || isLargeScreen.value)
    return "min-h-0";
  return "h-[300px]";
});

const {
  isToday,
  getAllEventsForDay,
  handleEventClick: _handleEventClick,
  getLocalWeekDays,
  getEventsForDateRange,
  computedEventHeight: getEventHeight,
} = useCalendar();

const EVENT_GAP = 4;
const MORE_BUTTON_HEIGHT = 24;

const itemHeight = computed(() => getEventHeight("week", props.eventHeight));

const sampleList = ref<HTMLElement | null>(null);
const { height: listHeight } = useElementSize(sampleList);

function setSampleList(
  el: Element | ComponentPublicInstance | null,
  isFirst: boolean,
) {
  if (isFirst)
    sampleList.value = el instanceof HTMLElement ? el : null;
}

function getVisibleEvents(dayEvents: CalendarEvent[]) {
  if (isPhone.value || listHeight.value === 0)
    return dayEvents;
  const slotHeight = itemHeight.value + EVENT_GAP;
  if (dayEvents.length * slotHeight - EVENT_GAP <= listHeight.value)
    return dayEvents;
  const count = Math.floor((listHeight.value - MORE_BUTTON_HEIGHT) / slotHeight);
  return dayEvents.slice(0, Math.max(0, count));
}

const weekStart = computed(() => {
  const start = props.startDate || getStableDate();
  return addDays(start, -start.getDay());
});

const nextWeekStart = computed(() => addDays(weekStart.value, 7));

const weekDays = computed(() => getLocalWeekDays(weekStart.value));

const nextWeekDays = computed(() => getLocalWeekDays(nextWeekStart.value));

const nextWeekEvents = computed(() =>
  getEventsForDateRange(nextWeekStart.value, addDays(nextWeekStart.value, 6)),
);

const firstRow = computed(() => weekDays.value.slice(0, 4));
const secondRow = computed(() => {
  const currentWeekDays = weekDays.value.slice(4, 7);
  const nextWeekFirstDay = nextWeekDays.value[0];
  if (!nextWeekFirstDay) {
    return currentWeekDays;
  }
  return [...currentWeekDays, nextWeekFirstDay];
});

const eventsByDay = computed(
  () =>
    new Map(
      [...firstRow.value, ...secondRow.value].map(day => [
        day.toISOString(),
        getAllEventsForDay(props.events, day),
      ]),
    ),
);

function getDayEvents(day: Date): CalendarEvent[] {
  return eventsByDay.value.get(day.toISOString()) ?? [];
}

function handleEventClick(event: CalendarEvent, e: MouseEvent) {
  _handleEventClick(event, e, emit);
}

const nextWeekEventCount = computed(() => {
  const uniqueEvents = new Set<string>();

  nextWeekDays.value.forEach((day) => {
    const dayEvents = getAllEventsForDay(nextWeekEvents.value, day);
    dayEvents.forEach((event) => {
      const baseId = event.id.split("-")[0] || event.id;
      uniqueEvents.add(baseId);
    });
  });

  return uniqueEvents.size;
});

function isLastDay(day: Date) {
  return day.toISOString() === nextWeekDays.value[0]?.toISOString();
}
</script>

<template>
  <DefineDayContent v-slot="{ day, isFirst }">
    <div
      class="flex items-center justify-between p-2 border-b border-default flex-shrink-0"
    >
      <div class="text-sm font-medium text-muted">
        <NuxtTime :datetime="day" weekday="short" />
      </div>
      <div
        class="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
        :class="{
          'bg-primary text-white': isToday(day),
          'text-muted': !isToday(day),
        }"
      >
        <NuxtTime :datetime="day" day="numeric" />
      </div>
    </div>
    <div
      :ref="(el) => setSampleList(el, isFirst)"
      class="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-1 relative z-10 flex flex-col"
    >
      <div
        v-for="event in getVisibleEvents(getDayEvents(day))"
        :key="event.id"
        class="rounded shrink-0"
        :style="{ height: `${itemHeight}px` }"
      >
        <CalendarEventItem
          :event="event"
          view="week"
          :current-day="day"
          class="rounded h-full justify-center"
          @click="(e) => handleEventClick(event, e)"
        />
      </div>
      <CalendarMoreEventsPopover
        v-if="getVisibleEvents(getDayEvents(day)).length < getDayEvents(day).length"
        :day="day"
        :events="getDayEvents(day)"
        :hidden-count="getDayEvents(day).length - getVisibleEvents(getDayEvents(day)).length"
        view="week"
        :button-height="MORE_BUTTON_HEIGHT"
        @event-click="handleEventClick"
      />
      <div
        v-show="getDayEvents(day).length === 0"
        class="flex flex-col items-center justify-center gap-1 text-muted flex-1"
      >
        <UIcon name="i-lucide-calendar-off" class="w-6 h-6" />
        <span class="text-md text-muted">
          {{ isToday(day) ? "No events today" : "No events" }}
        </span>
      </div>
    </div>
  </DefineDayContent>

  <div class="w-full h-full">
    <div class="grid border-t border-l border-default" :class="gridClass">
      <div
        v-for="(day, dayIndex) in firstRow"
        :key="day.toISOString()"
        class="relative border-r border-b border-default flex flex-col"
        :class="[
          cellClass,
          {
            'bg-muted/25': !isToday(day),
            'bg-info/10': isToday(day),
          },
        ]"
      >
        <DayContent :day="day" :is-first="dayIndex === 0" />
      </div>
      <div
        v-for="day in secondRow"
        :key="day.toISOString()"
        class="relative border-r border-b border-default flex flex-col"
        :class="[
          cellClass,
          {
            'bg-muted/25': !isToday(day) && !isLastDay(day),
            'bg-info/10': isToday(day),
            'bg-muted/50': isLastDay(day),
          },
        ]"
      >
        <DayContent
          v-if="!isLastDay(day)"
          :day="day"
          :is-first="false"
        />

        <template v-else>
          <div
            class="flex items-center justify-between p-2 border-b border-default flex-shrink-0"
          >
            <div class="text-sm font-medium text-primary">
              Next Week
            </div>
            <div
              class="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold bg-primary/20 text-white"
            >
              <UIcon name="i-lucide-calendar-days" class="w-4 h-4" />
            </div>
          </div>
          <div
            class="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-1 relative z-10 flex flex-col"
          >
            <div
              class="flex flex-col items-center justify-center gap-2 text-primary flex-1"
            >
              <div class="text-center">
                <div class="text-lg font-semibold">
                  {{ nextWeekEventCount }}
                </div>
                <div class="text-xs opacity-75">
                  {{ nextWeekEventCount === 1 ? "event" : "events" }}
                </div>
              </div>
              <div class="text-xs text-center opacity-75">
                <div class="text-xs opacity-50 mt-2">
                  Coming up next week
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
