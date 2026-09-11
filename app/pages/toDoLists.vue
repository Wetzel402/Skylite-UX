<script setup lang="ts">
import type { Prisma } from "@prisma/client";

import { consola } from "consola";

import type {
  BaseListItem,
  Todo,
  TodoColumn,
  TodoList,
  TodoListItem,
} from "~/types/database";
import type { TodoDueRange, TodoListWithIntegration, TodoSortMode } from "~/types/ui";

import GlobalFloatingActionButton from "~/components/global/globalFloatingActionButton.vue";
import GlobalList from "~/components/global/globalList.vue";
import TodoColumnDialog from "~/components/todos/todoColumnDialog.vue";
import TodoDetailDialog from "~/components/todos/todoDetailDialog.vue";
import TodoItemDialog from "~/components/todos/todoItemDialog.vue";
import { useClientPreferences } from "~/composables/useClientPreferences";
import { useStableDate } from "~/composables/useStableDate";
import { useTodoColumns } from "~/composables/useTodoColumns";
import { useTodos } from "~/composables/useTodos";
import { getDueRangeCutoff, isTodoWithinDueRange } from "~/types/ui";

import type { ICalEvent } from "../../server/integrations/iCal/types";

const { getStableDate, parseStableDate } = useStableDate();
const { preferences, updatePreferences } = useClientPreferences();

const todoSortBy = computed<TodoSortMode>(
  () => preferences.value?.todoSortBy ?? "date",
);
const todoDueRange = computed<TodoDueRange>(
  () => preferences.value?.todoDueRange ?? "all",
);

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function toTime(d: Date | string | null | undefined): number {
  return d ? (d instanceof Date ? d.getTime() : new Date(d).getTime()) : Number.MAX_SAFE_INTEGER;
}

function compareByDate(a: Todo, b: Todo): number {
  const aTime = toTime(a.dueDate);
  const bTime = toTime(b.dueDate);
  if (aTime !== bTime)
    return aTime - bTime;
  return (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
}

function compareByPriority(a: Todo, b: Todo): number {
  const aP = PRIORITY_ORDER[a.priority] ?? 2;
  const bP = PRIORITY_ORDER[b.priority] ?? 2;
  if (aP !== bP)
    return aP - bP;
  const aTime = toTime(a.dueDate);
  const bTime = toTime(b.dueDate);
  if (aTime !== bTime)
    return aTime - bTime;
  return (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
}

function compareByAlpha(a: Todo, b: Todo): number {
  const cmp = (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
  if (cmp !== 0)
    return cmp;
  return toTime(a.dueDate) - toTime(b.dueDate);
}

function getTodoComparator(mode: TodoSortMode): (a: Todo, b: Todo) => number {
  if (mode === "priority")
    return compareByPriority;
  if (mode === "alpha")
    return compareByAlpha;
  return compareByDate;
}

const { data: todoColumns } = useNuxtData<TodoColumn[]>("todo-columns");
const { data: todos } = useNuxtData<Todo[]>("todos");
const {
  updateTodo,
  createTodo,
  deleteTodo,
  toggleTodo,
  clearCompleted,
  loading: todosLoading,
} = useTodos();
const {
  updateTodoColumn,
  createTodoColumn,
  deleteTodoColumn,
  reorderTodoColumns,
  loading: columnsLoading,
} = useTodoColumns();

const mutableTodoColumns = computed(
  () =>
    todoColumns.value?.map(col => ({
      ...col,
      user:
        col.user === null
          ? undefined
          : {
              id: col.user.id,
              name: col.user.name,
              avatar: col.user.avatar,
            },
    })) || [],
);

const todoItemDialog = ref(false);
const todoColumnDialog = ref(false);
const todoDetailDialog = ref(false);
const editingTodo = ref<TodoListItem | null>(null);
const editingColumn = ref<TodoList | null>(null);
const viewingTodo = ref<TodoListItem | null>(null);
const reorderingColumns = ref(new Set<string>());

const editingTodoTyped = computed<TodoListItem | undefined>(
  () => editingTodo.value as TodoListItem | undefined,
);

function toTodoListItem(item: BaseListItem): TodoListItem | null {
  if (!todos.value)
    return null;
  const todo = todos.value.find(t => t.id === item.id);
  if (!todo)
    return null;

  return {
    id: todo.id,
    name: todo.title,
    description: todo.description ?? "",
    priority: todo.priority,
    dueDate: todo.dueDate ? parseStableDate(todo.dueDate) : null,
    todoColumnId: todo.todoColumnId ?? "",
    checked: todo.completed,
    order: todo.order,
    shoppingListId: todo.todoColumnId || "",
    notes: todo.description,
    recurringGroupId: todo.recurringGroupId,
    rrule: (todo.rrule as ICalEvent["rrule"] | null) ?? undefined,
  };
}

const todoLists = computed<TodoListWithIntegration[]>(() => {
  if (!todoColumns.value || !todos.value)
    return [];

  const sortMode = todoSortBy.value;
  const compare = getTodoComparator(sortMode);
  const cutoff = getDueRangeCutoff(todoDueRange.value, getStableDate());

  return todoColumns.value.map((column) => {
    const allColumnTodos = todos.value!.filter(
      todo => todo.todoColumnId === column.id,
    );
    const columnTodos = allColumnTodos.filter(todo =>
      isTodoWithinDueRange(
        todo.dueDate ? parseStableDate(todo.dueDate) : null,
        todo.completed,
        cutoff,
      ),
    );
    const sorted = [...columnTodos].sort(compare);
    return {
      id: column.id,
      name: column.name,
      order: column.order,
      createdAt: parseStableDate(column.createdAt),
      updatedAt: parseStableDate(column.updatedAt),
      isDefault: column.isDefault,
      source: "native" as const,
      hiddenItemCount: allColumnTodos.length - columnTodos.length,
      items: sorted.map(todo => ({
        id: todo.id,
        name: todo.title,
        checked: todo.completed,
        order: todo.order,
        notes: todo.description,
        shoppingListId: todo.todoColumnId || "",
        priority: todo.priority,
        dueDate: todo.dueDate,
        description: todo.description ?? "",
        todoColumnId: todo.todoColumnId || "",
        recurringGroupId: todo.recurringGroupId,
        rrule: (todo.rrule as ICalEvent["rrule"] | null) ?? undefined,
      })),
      _count: column._count ? { items: column._count.todos } : undefined,
    };
  });
});

const todoFilterSummary = computed(() => {
  const hidden = todoLists.value.reduce(
    (n, list) => n + (list.hiddenItemCount ?? 0),
    0,
  );
  const visible = todoLists.value.reduce((n, list) => n + list.items.length, 0);
  return { hidden, visible, total: visible + hidden };
});

function openCreateTodo(todoColumnId?: string) {
  editingTodo.value = { todoColumnId: todoColumnId ?? "" } as TodoListItem;
  todoItemDialog.value = true;
}

function openEditTodo(item: BaseListItem) {
  const todo = toTodoListItem(item);
  if (!todo)
    return;
  editingTodo.value = todo;
  todoItemDialog.value = true;
}

function openTodoDetail(item: BaseListItem) {
  const todo = toTodoListItem(item);
  if (!todo)
    return;
  viewingTodo.value = todo;
  todoDetailDialog.value = true;
}

function handleTodoDetailEdit(todo: TodoListItem) {
  todoDetailDialog.value = false;
  viewingTodo.value = null;
  editingTodo.value = todo;
  todoItemDialog.value = true;
}

async function handleTodoSave(todoData: TodoListItem) {
  try {
    if (editingTodo.value?.id) {
      const { data: cachedTodos } = useNuxtData("todos");
      const previousTodos = cachedTodos.value ? [...cachedTodos.value] : [];

      if (cachedTodos.value && Array.isArray(cachedTodos.value)) {
        const todoIndex = cachedTodos.value.findIndex(
          (t: Todo) => t.id === editingTodo.value!.id,
        );
        if (todoIndex !== -1) {
          const currentTodo = cachedTodos.value[todoIndex];
          const updatedTodo = {
            ...currentTodo,
            title: todoData.name,
            description: todoData.description,
            priority: todoData.priority,
            dueDate: todoData.dueDate,
            completed: todoData.checked,
            order: todoData.order,
            todoColumnId: todoData.todoColumnId,
            rrule: todoData.rrule,
          };
          const updatedTodos = [...cachedTodos.value];
          updatedTodos[todoIndex] = updatedTodo;
          cachedTodos.value = updatedTodos;
        }
      }

      try {
        await updateTodo(editingTodo.value.id, {
          title: todoData.name,
          description: todoData.description,
          priority: todoData.priority,
          dueDate: todoData.dueDate,
          completed: todoData.checked,
          order: todoData.order,
          todoColumnId: todoData.todoColumnId,
          rrule: todoData.rrule,
        });
        consola.debug("Todo Lists: Todo updated successfully");
      }
      catch (error) {
        if (cachedTodos.value && previousTodos.length > 0) {
          cachedTodos.value.splice(
            0,
            cachedTodos.value.length,
            ...previousTodos,
          );
        }
        throw error;
      }
    }
    else {
      const { data: cachedTodos } = useNuxtData("todos");
      const previousTodos = cachedTodos.value ? [...cachedTodos.value] : [];
      const newTodo: Todo = {
        id: `temp-${Date.now()}`,
        title: todoData.name,
        description: todoData.description,
        priority: todoData.priority,
        dueDate: todoData.dueDate,
        completed: todoData.checked,
        order: todoData.order,
        todoColumnId: todoData.todoColumnId,
        recurringGroupId: todoData.recurringGroupId ?? null,
        rrule: (todoData.rrule ?? null) as Prisma.JsonValue,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (cachedTodos.value && Array.isArray(cachedTodos.value)) {
        const updatedTodos = [...cachedTodos.value, newTodo];
        cachedTodos.value = updatedTodos;
      }

      try {
        const createdTodo = await createTodo({
          title: todoData.name,
          description: todoData.description,
          priority: todoData.priority,
          dueDate: todoData.dueDate,
          completed: todoData.checked,
          order: todoData.order,
          todoColumnId: todoData.todoColumnId,
          recurringGroupId: todoData.recurringGroupId ?? null,
          rrule: (todoData.rrule ?? null) as Prisma.JsonValue,
        });
        consola.debug("Todo Lists: Todo created successfully");

        if (cachedTodos.value && Array.isArray(cachedTodos.value)) {
          const tempIndex = cachedTodos.value.findIndex(
            (t: Todo) => t.id === newTodo.id,
          );
          if (tempIndex !== -1) {
            const updatedTodos = [...cachedTodos.value];
            updatedTodos[tempIndex] = createdTodo;
            cachedTodos.value = updatedTodos;
          }
        }
      }
      catch (error) {
        if (cachedTodos.value && previousTodos.length > 0) {
          cachedTodos.value.splice(
            0,
            cachedTodos.value.length,
            ...previousTodos,
          );
        }
        throw error;
      }
    }

    todoItemDialog.value = false;
    editingTodo.value = null;
  }
  catch (error) {
    consola.error("Todo Lists: Failed to save todo:", error);
  }
}

async function handleTodoDelete(todoId: string, stopRecurrence = false) {
  try {
    const { data: cachedTodos } = useNuxtData("todos");
    const previousTodos = cachedTodos.value ? [...cachedTodos.value] : [];

    if (cachedTodos.value && Array.isArray(cachedTodos.value)) {
      const updatedTodos = cachedTodos.value.filter(
        (t: Todo) => t.id !== todoId,
      );
      cachedTodos.value = updatedTodos;
    }

    try {
      await deleteTodo(todoId, stopRecurrence);
      consola.debug("Todo Lists: Todo deleted successfully");
    }
    catch (error) {
      if (cachedTodos.value && previousTodos.length > 0) {
        cachedTodos.value.splice(0, cachedTodos.value.length, ...previousTodos);
      }
      throw error;
    }
  }
  catch (error) {
    consola.error("Todo Lists: Failed to delete todo:", error);
  }
}

async function handleColumnSave(columnData: { name: string }) {
  try {
    if (editingColumn.value?.id) {
      const { data: cachedColumns } = useNuxtData("todo-columns");
      const previousColumns = cachedColumns.value
        ? [...cachedColumns.value]
        : [];

      if (cachedColumns.value && Array.isArray(cachedColumns.value)) {
        const columnIndex = cachedColumns.value.findIndex(
          (c: TodoColumn) => c.id === editingColumn.value!.id,
        );
        if (columnIndex !== -1) {
          cachedColumns.value[columnIndex] = {
            ...cachedColumns.value[columnIndex],
            ...columnData,
          };
        }
      }

      try {
        await updateTodoColumn(editingColumn.value.id, columnData);
        consola.debug("Todo Lists: Todo column updated successfully");
      }
      catch (error) {
        if (cachedColumns.value && previousColumns.length > 0) {
          cachedColumns.value.splice(
            0,
            cachedColumns.value.length,
            ...previousColumns,
          );
        }
        throw error;
      }
    }
    else {
      const { data: cachedColumns } = useNuxtData("todo-columns");
      const previousColumns = cachedColumns.value
        ? [...cachedColumns.value]
        : [];
      const newColumn = {
        ...columnData,
        id: `temp-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDefault: false,
        order: (cachedColumns.value?.length || 0) + 1,
        user: null,
        _count: { todos: 0 },
      };

      if (cachedColumns.value && Array.isArray(cachedColumns.value)) {
        cachedColumns.value.push(newColumn);
      }

      try {
        const createdColumn = await createTodoColumn(columnData);
        consola.debug("Todo Lists: Todo column created successfully");

        if (cachedColumns.value && Array.isArray(cachedColumns.value)) {
          const tempIndex = cachedColumns.value.findIndex(
            (c: TodoColumn) => c.id === newColumn.id,
          );
          if (tempIndex !== -1) {
            cachedColumns.value[tempIndex] = createdColumn;
          }
        }
      }
      catch (error) {
        if (cachedColumns.value && previousColumns.length > 0) {
          cachedColumns.value.splice(
            0,
            cachedColumns.value.length,
            ...previousColumns,
          );
        }
        throw error;
      }
    }

    todoColumnDialog.value = false;
    editingColumn.value = null;
  }
  catch (error) {
    consola.error("Todo Lists: Failed to save todo column:", error);
  }
}

async function handleColumnDelete(columnId: string) {
  try {
    const { data: cachedColumns } = useNuxtData("todo-columns");
    const previousColumns = cachedColumns.value ? [...cachedColumns.value] : [];

    if (cachedColumns.value && Array.isArray(cachedColumns.value)) {
      cachedColumns.value.splice(
        0,
        cachedColumns.value.length,
        ...cachedColumns.value.filter((c: TodoColumn) => c.id !== columnId),
      );
    }

    try {
      await deleteTodoColumn(columnId);
      consola.debug("Todo Lists: Todo column deleted successfully");
    }
    catch (error) {
      if (cachedColumns.value && previousColumns.length > 0) {
        cachedColumns.value.splice(
          0,
          cachedColumns.value.length,
          ...previousColumns,
        );
      }
      throw error;
    }
  }
  catch (error) {
    consola.error("Todo Lists: Failed to delete todo column:", error);
  }
}

async function handleReorderColumn(
  columnIndex: number,
  direction: "left" | "right",
) {
  if (!todoColumns.value)
    return;

  const column = todoColumns.value[columnIndex];
  if (!column)
    return;

  if (reorderingColumns.value.has(column.id))
    return;

  const targetIndex = direction === "left" ? columnIndex - 1 : columnIndex + 1;

  if (targetIndex < 0 || targetIndex >= todoColumns.value.length)
    return;

  reorderingColumns.value.add(column.id);

  try {
    const { data: cachedColumns } = useNuxtData("todo-columns");
    const previousColumns = cachedColumns.value ? [...cachedColumns.value] : [];

    try {
      await reorderTodoColumns(columnIndex, targetIndex);
      consola.debug("Todo Lists: Column reordered successfully");

      if (cachedColumns.value && Array.isArray(cachedColumns.value)) {
        const columns = [...cachedColumns.value].sort(
          (a, b) => (a.order || 0) - (b.order || 0),
        );
        const currentIndex = columns.findIndex(
          (c: TodoColumn) => c.id === column.id,
        );

        if (currentIndex !== -1) {
          if (direction === "left" && currentIndex > 0) {
            [columns[currentIndex], columns[currentIndex - 1]] = [
              columns[currentIndex - 1],
              columns[currentIndex],
            ];
            columns[currentIndex].order = currentIndex;
            columns[currentIndex - 1].order = currentIndex - 1;
          }
          else if (
            direction === "right"
            && currentIndex < columns.length - 1
          ) {
            [columns[currentIndex], columns[currentIndex + 1]] = [
              columns[currentIndex + 1],
              columns[currentIndex],
            ];
            columns[currentIndex].order = currentIndex;
            columns[currentIndex + 1].order = currentIndex + 1;
          }

          cachedColumns.value.splice(0, cachedColumns.value.length, ...columns);
        }
      }
    }
    catch (error) {
      if (cachedColumns.value && previousColumns.length > 0) {
        cachedColumns.value.splice(
          0,
          cachedColumns.value.length,
          ...previousColumns,
        );
      }
      throw error;
    }
  }
  catch (error) {
    consola.error("Todo Lists: Failed to reorder column:", error);
    useAlertToast().showError("Failed to reorder column. Please try again.");
  }
  finally {
    reorderingColumns.value.delete(column.id);
  }
}

async function handleClearCompleted(columnId: string) {
  try {
    const { data: cachedTodos } = useNuxtData("todos");
    const previousTodos = cachedTodos.value ? [...cachedTodos.value] : [];
    const completedTodos
      = cachedTodos.value?.filter(
        (t: Todo) => t.todoColumnId === columnId && t.completed,
      ) || [];

    if (cachedTodos.value && Array.isArray(cachedTodos.value)) {
      const updatedTodos = cachedTodos.value.filter(
        (t: Todo) => !(t.todoColumnId === columnId && t.completed),
      );
      cachedTodos.value = updatedTodos;
    }

    try {
      await clearCompleted(columnId, completedTodos);
      consola.debug("Todo Lists: Completed todos cleared successfully");
    }
    catch (error) {
      if (cachedTodos.value && previousTodos.length > 0) {
        cachedTodos.value.splice(0, cachedTodos.value.length, ...previousTodos);
      }
      throw error;
    }
  }
  catch (error) {
    consola.error("Todo Lists: Failed to clear completed todos:", error);
  }
}

function openEditColumn(column: TodoListWithIntegration) {
  editingColumn.value = { ...column };
  todoColumnDialog.value = true;
}

async function handleToggleTodo(itemId: string, completed: boolean) {
  try {
    const { data: cachedTodos } = useNuxtData("todos");
    const previousTodos = cachedTodos.value ? [...cachedTodos.value] : [];

    if (cachedTodos.value && Array.isArray(cachedTodos.value)) {
      const todoIndex = cachedTodos.value.findIndex(
        (t: Todo) => t.id === itemId,
      );
      if (todoIndex !== -1) {
        const currentTodo = cachedTodos.value[todoIndex];
        const updatedTodo = { ...currentTodo, completed };
        const updatedTodos = [...cachedTodos.value];
        updatedTodos[todoIndex] = updatedTodo;
        cachedTodos.value = updatedTodos;
      }
    }

    try {
      await toggleTodo(itemId, completed);
      consola.debug("Todo Lists: Todo toggled successfully");
    }
    catch (error) {
      if (cachedTodos.value && previousTodos.length > 0) {
        cachedTodos.value.splice(0, cachedTodos.value.length, ...previousTodos);
      }
      throw error;
    }
  }
  catch (error) {
    consola.error("Todo Lists: Failed to toggle todo:", error);
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-2rem)] w-full flex-col rounded-lg">
    <div
      class="py-5 sm:px-4 sticky top-0 z-40 bg-default border-b border-default"
    >
      <GlobalDateHeader
        show-todo-sort-selector
        show-todo-filter-selector
        :todo-sort-by="todoSortBy"
        :todo-due-range="todoDueRange"
        @todo-sort-change="(mode) => updatePreferences({ todoSortBy: mode })"
        @todo-due-range-change="(range) => updatePreferences({ todoDueRange: range })"
      />
      <div
        v-if="todoFilterSummary.hidden > 0"
        role="status"
        class="flex items-center gap-2 mt-2 text-sm text-muted"
      >
        <UIcon name="i-lucide-filter" class="h-4 w-4" />
        <span>
          Showing {{ todoFilterSummary.visible }} of {{ todoFilterSummary.total }} todos
        </span>
        <UButton
          variant="link"
          color="primary"
          size="xs"
          class="p-0"
          @click="updatePreferences({ todoDueRange: 'all' })"
        >
          Clear filter
        </UButton>
      </div>
    </div>

    <div class="flex flex-1 flex-col min-h-0 p-4">
      <GlobalList
        :lists="todoLists"
        :loading="columnsLoading || todosLoading"
        empty-state-icon="i-lucide-list-todo"
        empty-state-title="No todo lists found"
        empty-state-description="Create your first todo column to get started"
        :show-reorder="false"
        item-sort-mode="auto"
        :show-edit="(list) => ('isDefault' in list ? !list.isDefault : true)"
        show-add
        show-edit-item
        show-completed
        show-progress
        show-integration-icons
        show-detail
        @create="
          todoColumnDialog = true;
          editingColumn = null;
        "
        @edit="openEditColumn($event as TodoListWithIntegration)"
        @add-item="openCreateTodo($event)"
        @edit-item="openEditTodo($event)"
        @view-item="openTodoDetail($event)"
        @toggle-item="handleToggleTodo"
        @reorder-list="
          (listId, direction) =>
            handleReorderColumn(
              todoLists.findIndex((l) => l.id === listId),
              direction === 'up' ? 'left' : 'right',
            )
        "
        @clear-completed="handleClearCompleted"
      />
    </div>

    <GlobalFloatingActionButton
      icon="i-lucide-plus"
      label="Add new todo column"
      color="primary"
      size="lg"
      position="bottom-right"
      @click="
        todoColumnDialog = true;
        editingColumn = null;
      "
    />

    <TodoItemDialog
      :is-open="todoItemDialog"
      :todo-columns="mutableTodoColumns"
      :todo="editingTodoTyped || null"
      @close="
        todoItemDialog = false;
        editingTodo = null;
      "
      @save="handleTodoSave"
      @delete="handleTodoDelete"
    />

    <TodoDetailDialog
      :is-open="todoDetailDialog"
      :todo="viewingTodo"
      @close="
        todoDetailDialog = false;
        viewingTodo = null;
      "
      @edit="handleTodoDetailEdit"
    />

    <TodoColumnDialog
      :is-open="todoColumnDialog"
      :column="editingColumn ?? undefined"
      @close="
        todoColumnDialog = false;
        editingColumn = null;
      "
      @save="handleColumnSave"
      @delete="handleColumnDelete"
    />
  </div>
</template>
