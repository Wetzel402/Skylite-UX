<script setup lang="ts">
import type { AnyListWithIntegration } from "~/types/ui";

import type { BaseListItem } from "../../types/database";

const props = defineProps<{
  lists: readonly AnyListWithIntegration[];
  loading?: boolean;
  emptyStateIcon?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  showProgress?: boolean;
  showQuantity?: boolean;
  showNotes?: boolean;
  showReorder?: boolean;
  showEdit?: boolean | ((list: AnyListWithIntegration) => boolean);
  showAdd?: boolean | ((list: AnyListWithIntegration) => boolean);
  showEditItem?: boolean | ((list: AnyListWithIntegration) => boolean);
  showCompleted?: boolean | ((list: AnyListWithIntegration) => boolean);
  showIntegrationIcons?: boolean;
  showDetail?: boolean;
  itemSortMode?: "manual" | "auto";
}>();

const _emit = defineEmits<{
  (e: "create"): void;
  (e: "edit", list: AnyListWithIntegration): void;
  (e: "addItem", listId: string): void;
  (e: "editItem", item: BaseListItem): void;
  (e: "viewItem", item: BaseListItem): void;
  (e: "toggleItem", itemId: string, checked: boolean): void;
  (e: "reorderItem", itemId: string, direction: "up" | "down"): void;
  (e: "reorderList", listId: string, direction: "up" | "down"): void;
  (e: "clearCompleted", listId: string): void;
}>();

const { isPortrait, isPhone, isShortScreen } = useAppLayout();
const isSingleColumn = computed(() => isPortrait.value && isPhone.value);

const sortedLists = computed(() => {
  return [...props.lists]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(list => ({
      ...list,
      sortedItems:
        list.items && props.itemSortMode === "auto"
          ? [...list.items]
          : list.items
            ? [...list.items].sort((a, b) => (a.order || 0) - (b.order || 0))
            : [],
      completedItems: list.items
        ? list.items.filter((item: BaseListItem) => item.checked)
        : [],
      activeItems: list.items
        ? list.items.filter((item: BaseListItem) => !item.checked)
        : [],
    }));
});

function getProgressPercentage(list: AnyListWithIntegration) {
  if (!list.items || list.items.length === 0)
    return 0;
  const checkedItems = list.items.filter(
    (item: BaseListItem) => item.checked,
  ).length;
  return Math.round((checkedItems / list.items.length) * 100);
}

function getProgressColor(percentage: number) {
  if (percentage === 100)
    return "bg-green-500";
  if (percentage >= 75)
    return "bg-blue-500";
  if (percentage >= 50)
    return "bg-yellow-500";
  if (percentage >= 25)
    return "bg-orange-500";
  return "bg-red-500";
}

const showItemEdit = computed(() => {
  if (typeof props.showEditItem === "function") {
    return (item: BaseListItem) => {
      const list = props.lists.find(l =>
        l.items?.some(i => i.id === item.id),
      );
      return list
        ? (props.showEditItem as (list: AnyListWithIntegration) => boolean)(
            list,
          )
        : false;
    };
  }
  return props.showEditItem;
});

function hasIntegrationProperties(
  list: AnyListWithIntegration,
): list is AnyListWithIntegration & { source: "integration" | "native" } {
  return (
    "source" in list
    && (list.source === "integration" || list.source === "native")
  );
}
</script>

<template>
  <div class="flex flex-1 min-h-0 w-full flex-col rounded-lg">
    <div
      class="flex flex-1 min-h-0 flex-col"
      :class="isShortScreen ? 'p-2' : 'p-3 sm:p-4'"
    >
      <div v-if="loading" class="flex items-center justify-center h-full">
        <div class="text-center">
          <UIcon
            name="i-lucide-loader-2"
            class="h-8 w-8 animate-spin text-primary-500"
          />
          <p class="mt-2 text-sm text-muted">
            Loading lists...
          </p>
        </div>
      </div>
      <div
        v-else-if="lists.length === 0"
        class="flex items-center justify-center h-full"
      >
        <div class="text-center">
          <UIcon
            :name="emptyStateIcon || 'i-lucide-list'"
            class="h-8 w-8 text-muted"
          />
          <p class="mt-2 text-sm text-muted">
            {{ emptyStateTitle || "No lists found" }}
          </p>
          <p v-if="emptyStateDescription" class="mt-1 text-sm text-muted">
            {{ emptyStateDescription }}
          </p>
          <UButton
            class="mt-4"
            color="primary"
            @click="_emit('create')"
          >
            Create List
          </UButton>
        </div>
      </div>
      <div
        v-else
        class="flex-1 min-h-0"
        :class="[
          isPortrait
            ? 'overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-4 sm:gap-6'
            : 'overflow-x-auto flex gap-6',
          {
            'auto-rows-[minmax(24rem,1fr)]': isPortrait && !isSingleColumn,
            'pb-2': !isPortrait && isShortScreen,
            'pb-4': !isPortrait && !isShortScreen,
          },
        ]"
      >
        <div
          v-for="(list, listIndex) in sortedLists"
          :key="list.id"
          class="flex flex-col bg-default rounded-lg border border-default shadow-sm"
          :class="isPortrait
            ? ['min-w-0', { 'min-h-0': !isSingleColumn }]
            : 'flex-1 basis-0 min-w-80 h-full'"
        >
          <div
            class="shrink-0 bg-default rounded-t-lg"
            :class="{ 'sticky top-0 z-10 pb-2': isSingleColumn }"
          >
            <div
              class="border-b border-default bg-default rounded-t-lg"
              :class="isShortScreen ? 'px-3 py-2' : 'p-4'"
            >
              <div
                class="flex items-center justify-between gap-2"
                :class="{ 'mb-3': !isShortScreen }"
              >
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    v-if="
                      showIntegrationIcons
                        && hasIntegrationProperties(list)
                        && list.source === 'integration'
                        && list.integrationIcon
                    "
                    class="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
                  >
                    <img
                      :src="list.integrationIcon"
                      :alt="list.integrationName || 'Integration'"
                      class="h-4 w-4"
                      style="object-fit: contain"
                      @error="
                        (event) => {
                          const target = event.target as HTMLImageElement;
                          if (target) target.style.display = 'none';
                        }
                      "
                    >
                  </div>
                  <div
                    v-else-if="
                      showIntegrationIcons
                        && hasIntegrationProperties(list)
                        && list.source === 'native'
                    "
                    class="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
                  >
                    <img
                      src="/favicon.ico"
                      alt="SkyLite"
                      class="h-5 w-5"
                      style="object-fit: contain"
                      @error="
                        (event) => {
                          const target = event.target as HTMLImageElement;
                          if (target) target.style.display = 'none';
                        }
                      "
                    >
                  </div>
                  <h2
                    class="font-semibold text-highlighted truncate"
                    :class="isShortScreen ? 'text-base' : 'text-lg'"
                  >
                    {{ list.name }}
                  </h2>
                  <span
                    v-if="isShortScreen && showProgress && list.items && list.items.length > 0"
                    class="shrink-0 text-xs text-muted"
                  >
                    {{ list.completedItems.length }}/{{ list.items.length }}
                  </span>
                  <span
                    v-if="isShortScreen && list.hiddenItemCount"
                    class="shrink-0 flex items-center gap-0.5 text-xs text-primary"
                    :title="`${list.hiddenItemCount} hidden by the current filter`"
                  >
                    <UIcon
                      name="i-lucide-filter"
                      class="h-3 w-3"
                      aria-hidden="true"
                    />
                    <span aria-hidden="true">{{ list.hiddenItemCount }}</span>
                    <span class="sr-only">{{ list.hiddenItemCount }} hidden by the current filter</span>
                  </span>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <div
                    v-if="showReorder"
                    class="flex items-center justify-center gap-1"
                    :class="isShortScreen ? 'flex-row' : 'flex-col h-16'"
                  >
                    <UButton
                      v-if="listIndex > 0"
                      icon="i-lucide-chevron-left"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      aria-label="Move list left"
                      @click="_emit('reorderList', list.id, 'up')"
                    />
                    <UButton
                      v-if="listIndex < sortedLists.length - 1"
                      icon="i-lucide-chevron-right"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      aria-label="Move list right"
                      @click="_emit('reorderList', list.id, 'down')"
                    />
                  </div>
                  <UButton
                    v-if="
                      typeof showEdit === 'function'
                        ? showEdit(list)
                        : showEdit
                    "
                    icon="i-lucide-pencil"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :aria-label="`Edit ${list.name}`"
                    @click="_emit('edit', list)"
                  />
                  <UButton
                    v-if="
                      isShortScreen
                        && (typeof showAdd === 'function' ? showAdd(list) : showAdd)
                    "
                    icon="i-lucide-plus"
                    size="sm"
                    color="primary"
                    :aria-label="`Add item to ${list.name}`"
                    @click="_emit('addItem', list.id)"
                  />
                </div>
              </div>

              <div
                v-if="isShortScreen && showProgress && list.items && list.items.length > 0"
                class="mt-1.5 w-full bg-muted rounded-full h-1"
              >
                <div
                  class="h-1 rounded-full transition-all duration-300"
                  :class="getProgressColor(getProgressPercentage(list))"
                  :style="{ width: `${getProgressPercentage(list)}%` }"
                />
              </div>
              <div
                v-else-if="!isShortScreen && showProgress && list.items && list.items.length > 0"
                class="space-y-2"
              >
                <div class="flex justify-between text-sm">
                  <span class="text-muted">
                    {{
                      list.items.filter(
                        (item: BaseListItem) => item.checked,
                      ).length
                    }}
                    of {{ list.items.length }} items
                    <template v-if="list.hiddenItemCount">
                      &middot; {{ list.hiddenItemCount }} hidden
                    </template>
                  </span>
                  <span class="text-muted font-medium">
                    {{ getProgressPercentage(list) }}%
                  </span>
                </div>
                <div class="w-full bg-muted rounded-full h-2">
                  <div
                    class="h-2 rounded-full transition-all duration-300"
                    :class="getProgressColor(getProgressPercentage(list))"
                    :style="{ width: `${getProgressPercentage(list)}%` }"
                  />
                </div>
              </div>
              <div
                v-else-if="
                  !isShortScreen
                    && (!list.items || (list.items.length === 0 && showProgress))
                "
                class="text-sm text-muted py-4.5"
              />
            </div>

            <div
              v-if="
                !isShortScreen
                  && (typeof showAdd === 'function' ? showAdd(list) : showAdd)
              "
              class="shrink-0 flex justify-center px-4 pt-4"
            >
              <UButton
                size="xl"
                color="primary"
                class="w-full"
                @click="_emit('addItem', list.id)"
              >
                <UIcon name="i-lucide-plus" class="h-4 w-4 mr-1" />
                Add Item
              </UButton>
            </div>
          </div>

          <div
            :class="isSingleColumn
              ? 'px-4 pb-4 pt-2'
              : ['flex-1 min-h-0 overflow-y-auto', isShortScreen ? 'p-3' : 'p-4']"
          >
            <div
              v-if="!list.items || list.items.length === 0"
              class="flex flex-col items-center justify-center py-12 text-muted"
            >
              <UIcon
                :name="list.hiddenItemCount ? 'i-lucide-filter' : 'i-lucide-list'"
                class="h-12 w-12 mb-3 opacity-30"
              />
              <template v-if="list.hiddenItemCount">
                <p class="text-sm font-medium mb-1">
                  No items match the current filter
                </p>
                <p class="text-xs mb-4">
                  {{ list.hiddenItemCount }} hidden by the current filter
                </p>
              </template>
              <template v-else>
                <p class="text-sm font-medium mb-1">
                  No items yet
                </p>
                <p class="text-xs mb-4">
                  Add your first item to get started
                </p>
              </template>
            </div>
            <div v-else class="space-y-4">
              <div v-if="list.activeItems.length > 0" class="space-y-2">
                <GlobalListItem
                  v-for="(item, index) in list.activeItems"
                  :key="item.id"
                  :item="item"
                  :index="index"
                  :total-items="list.activeItems.length"
                  :show-quantity="showQuantity"
                  :show-notes="showNotes"
                  :show-reorder="
                    (list as AnyListWithIntegration).source
                      === 'integration'
                      ? false
                      : showReorder
                  "
                  :show-edit="showItemEdit"
                  :show-detail="showDetail"
                  @edit="_emit('editItem', $event)"
                  @view="_emit('viewItem', $event)"
                  @toggle="
                    (payload) =>
                      _emit('toggleItem', payload.itemId, payload.checked)
                  "
                  @reorder="
                    (payload) =>
                      _emit(
                        'reorderItem',
                        payload.itemId,
                        payload.direction,
                      )
                  "
                />
              </div>

              <div
                v-if="
                  (typeof showCompleted === 'function'
                    ? showCompleted(list)
                    : showCompleted) && list.completedItems.length > 0
                "
                class="space-y-2"
              >
                <div class="flex items-center justify-between px-1">
                  <h3 class="text-sm font-medium text-muted">
                    Completed ({{ list.completedItems.length }})
                  </h3>
                  <UButton
                    v-if="list.completedItems.length > 0"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="_emit('clearCompleted', list.id)"
                  >
                    Clear
                  </UButton>
                </div>
                <GlobalListItem
                  v-for="(item, index) in list.completedItems"
                  :key="item.id"
                  :item="item"
                  :index="index"
                  :total-items="list.completedItems.length"
                  :show-quantity="showQuantity"
                  :show-notes="showNotes"
                  :show-reorder="
                    (list as AnyListWithIntegration).source
                      === 'integration'
                      ? false
                      : showReorder
                  "
                  :show-edit="showItemEdit"
                  :show-detail="showDetail"
                  @edit="_emit('editItem', $event)"
                  @view="_emit('viewItem', $event)"
                  @toggle="
                    (payload) =>
                      _emit('toggleItem', payload.itemId, payload.checked)
                  "
                  @reorder="
                    (payload) =>
                      _emit(
                        'reorderItem',
                        payload.itemId,
                        payload.direction,
                      )
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
