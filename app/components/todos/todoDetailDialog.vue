<script setup lang="ts">
import type { TodoListItem } from "~/types/database";

import { getPriorityColor } from "~/types/ui";

const props = defineProps<{
  todo: TodoListItem | null;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "edit", todo: TodoListItem): void;
}>();

const titleId = useId();
const panelRef = ref<HTMLElement | null>(null);
let lastFocusedElement: HTMLElement | null = null;

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      lastFocusedElement = document.activeElement as HTMLElement | null;
      nextTick(() => panelRef.value?.focus());
    }
    else {
      lastFocusedElement?.focus();
      lastFocusedElement = null;
    }
  },
  { flush: "post" },
);

function handleClose() {
  emit("close");
}

function getFocusableElements(): HTMLElement[] {
  if (!panelRef.value)
    return [];
  return Array.from(
    panelRef.value.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex=\"-1\"])",
    ),
  );
}

function handleTabKey(event: KeyboardEvent) {
  const focusable = getFocusableElements();
  if (focusable.length === 0)
    return;

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;

  // Treat the panel itself as equivalent to the first focusable element:
  // focus lands there first (before the initial nextTick moves it onward),
  // so Shift+Tab from there should also wrap to the last element.
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.value)) {
    event.preventDefault();
    last.focus();
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div
    v-if="isOpen && todo"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
    @click.self="handleClose"
    @keydown.esc="handleClose"
  >
    <div
      ref="panelRef"
      class="w-[425px] max-h-[90vh] overflow-y-auto bg-default rounded-lg border border-default shadow-lg"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      @click.stop
      @keydown.tab="handleTabKey"
    >
      <div
        class="flex items-center justify-between p-4 border-b border-default"
      >
        <h3
          :id="titleId"
          class="text-base font-semibold leading-6"
          :class="{ 'line-through': todo.checked }"
        >
          {{ todo.name }}
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          class="-my-1"
          aria-label="Close dialog"
          @click="handleClose"
        />
      </div>

      <div class="p-4 space-y-6">
        <div class="flex items-center gap-2">
          <span
            class="text-xs px-2 py-0.5 rounded-full"
            :class="getPriorityColor(todo.priority)"
          >
            {{ todo.priority }}
          </span>
          <span class="text-xs text-muted">
            <NuxtTime
              v-if="todo.dueDate"
              :datetime="todo.dueDate"
              year="numeric"
              month="short"
              day="numeric"
            />
            <template v-else>
              No due date
            </template>
          </span>
          <span
            v-if="todo.recurringGroupId"
            class="flex items-center gap-1 text-xs text-primary"
          >
            <UIcon name="i-lucide-repeat" class="h-3.5 w-3.5" />
            Recurring
          </span>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-highlighted">Description</label>
          <p class="text-sm text-toned whitespace-pre-wrap">
            {{ todo.description || "No description" }}
          </p>
        </div>
      </div>

      <div class="flex justify-between p-4 border-t border-default">
        <UButton
          color="neutral"
          variant="ghost"
          @click="handleClose"
        >
          Close
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-pencil"
          @click="emit('edit', todo)"
        >
          Edit
        </UButton>
      </div>
    </div>
  </div>
</template>
