<script setup lang="ts">
import type { CalendarEvent } from "~/types/calendar";

defineProps<{
  day: Date;
  events: CalendarEvent[];
  hiddenCount: number;
  view: string;
  buttonHeight: number;
}>();

const emit = defineEmits<{
  (e: "eventClick", event: CalendarEvent, mouseEvent: MouseEvent): void;
}>();

const isOpen = ref(false);

function handleEventClick(event: CalendarEvent, e: MouseEvent) {
  isOpen.value = false;
  emit("eventClick", event, e);
}
</script>

<template>
  <UPopover v-model:open="isOpen">
    <UButton
      variant="ghost"
      class="w-full shrink-0 justify-start px-1 text-[10px] sm:px-2 sm:text-xs text-muted hover:bg-accented rounded-md transition-colors"
      :style="{ height: `${buttonHeight}px` }"
      @click.stop
    >
      <span>
        +{{ hiddenCount }}
        <span class="max-sm:sr-only">more</span>
      </span>
    </UButton>
    <template #content>
      <div
        class="w-60 max-h-[60vh] overflow-y-auto p-3 bg-default rounded-lg shadow-lg border border-default"
      >
        <div class="space-y-2">
          <div class="text-sm font-medium">
            <NuxtTime
              :datetime="day"
              weekday="short"
              day="numeric"
            />
          </div>
          <div class="space-y-1">
            <div v-for="event in events" :key="event.id">
              <CalendarEventItem
                :event="event"
                :view="view"
                :current-day="day"
                @click="(e) => handleEventClick(event, e)"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>
