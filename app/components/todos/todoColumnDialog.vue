<script setup lang="ts">
import type { TodoColumnBasic } from "~/types/database";

const props = defineProps<{
  isOpen: boolean;
  column?: TodoColumnBasic;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", column: { name: string }): void;
  (e: "delete", columnId: string): void;
}>();

const { dialogPanelClass, dialogBarClass } = useAppLayout();
const panelClass = computed(() => dialogPanelClass("w-[min(425px,calc(100vw-1rem))]"));

const columnName = ref("");
const columnError = ref<string | null>(null);

const watchSource = computed(() => ({
  isOpen: props.isOpen,
  column: props.column,
}));
watch(
  watchSource,
  ({ isOpen, column }) => {
    if (isOpen) {
      resetForm();
      if (column) {
        columnName.value = column.name || "";
      }
    }
  },
  { immediate: true },
);

function resetForm() {
  columnName.value = "";
  columnError.value = null;
}

function handleSave() {
  if (!columnName.value.trim()) {
    columnError.value = "Column name is required";
    return;
  }

  emit("save", { name: columnName.value.trim() });
  resetForm();
  emit("close");
}

function handleDelete() {
  if (props.column?.id) {
    emit("delete", props.column.id);
    emit("close");
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
    @click="emit('close')"
  >
    <div
      class="flex flex-col overflow-hidden bg-default"
      :class="panelClass"
      @click.stop
    >
      <div
        class="shrink-0 flex items-center justify-between border-b border-default"
        :class="dialogBarClass"
      >
        <h3 class="text-base font-semibold leading-6">
          {{ column?.id ? "Edit Column" : "Create Column" }}
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          class="-my-1"
          aria-label="Close dialog"
          @click="emit('close')"
        />
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
        <div
          v-if="columnError"
          class="bg-error/10 text-error rounded-md px-3 py-2 text-sm"
        >
          {{ columnError }}
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-highlighted">Column Name</label>
          <UInput
            v-model="columnName"
            placeholder="Enter column name"
            class="w-full"
            :ui="{ base: 'w-full' }"
            @keyup.enter="handleSave"
          />
        </div>
      </div>

      <div
        class="shrink-0 flex justify-between border-t border-default"
        :class="dialogBarClass"
      >
        <UButton
          v-if="column?.id"
          color="error"
          variant="ghost"
          icon="i-lucide-trash"
          @click="handleDelete"
        >
          Delete
        </UButton>
        <div class="flex gap-2" :class="{ 'ml-auto': !column?.id }">
          <UButton
            color="neutral"
            variant="ghost"
            @click="emit('close')"
          >
            Cancel
          </UButton>
          <UButton color="primary" @click="handleSave">
            {{ column?.id ? "Update Column" : "Create Column" }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
