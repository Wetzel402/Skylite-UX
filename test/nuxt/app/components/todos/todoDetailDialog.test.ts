import { describe, it, expect } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";

import type { TodoListItem } from "~/types/database";

import TodoDetailDialog from "../../../../../app/components/todos/todoDetailDialog.vue";

function baseTodo(overrides: Partial<TodoListItem> = {}): TodoListItem {
  return {
    id: "todo-1",
    name: "Water the plants",
    notes: null,
    description: "",
    priority: "MEDIUM",
    dueDate: null,
    todoColumnId: "column-1",
    checked: false,
    order: 1,
    shoppingListId: "column-1",
    ...overrides,
  };
}

describe("TodoDetailDialog", () => {
  it("renders nothing when isOpen is false", async () => {
    const wrapper = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: false, todo: baseTodo() },
    });
    expect(wrapper.find(".fixed").exists()).toBe(false);
  });

  it("renders nothing when todo is null", async () => {
    const wrapper = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo: null },
    });
    expect(wrapper.find(".fixed").exists()).toBe(false);
  });

  it("renders the todo name, priority, and description when open", async () => {
    const todo = baseTodo({ name: "Water the plants", priority: "HIGH", description: "Every Tuesday" });
    const wrapper = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo },
    });
    expect(wrapper.text()).toContain("Water the plants");
    expect(wrapper.text()).toContain("HIGH");
    expect(wrapper.text()).toContain("Every Tuesday");
  });

  it("shows the 'No description' fallback when description is empty", async () => {
    const todo = baseTodo({ description: "" });
    const wrapper = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo },
    });
    expect(wrapper.text()).toContain("No description");
  });

  it("shows the 'No due date' fallback when dueDate is null", async () => {
    const todo = baseTodo({ dueDate: null });
    const wrapper = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo },
    });
    expect(wrapper.text()).toContain("No due date");
  });

  it("shows the recurring badge only when recurringGroupId is set", async () => {
    const withRecurring = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo: baseTodo({ recurringGroupId: "group-1" }) },
    });
    expect(withRecurring.text()).toContain("Recurring");

    const withoutRecurring = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo: baseTodo({ recurringGroupId: null }) },
    });
    expect(withoutRecurring.text()).not.toContain("Recurring");
  });

  it("emits close when the header close button is clicked", async () => {
    const wrapper = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo: baseTodo() },
    });
    await wrapper.find("button[aria-label='Close dialog']").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("emits close when the footer Close button is clicked", async () => {
    const wrapper = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo: baseTodo() },
    });
    const closeButton = wrapper.findAll("button").find(b => b.text() === "Close");
    await closeButton?.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("emits edit with the todo when the Edit button is clicked", async () => {
    const todo = baseTodo();
    const wrapper = await mountSuspended(TodoDetailDialog, {
      props: { isOpen: true, todo },
    });
    const editButton = wrapper.findAll("button").find(b => b.text() === "Edit");
    await editButton?.trigger("click");
    expect(wrapper.emitted("edit")?.[0]?.[0]).toMatchObject({ id: todo.id });
  });
});
