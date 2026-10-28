import { afterEach, describe, it, expect, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { ref } from "vue";

import type { ShoppingListWithIntegration } from "~/types/ui";
import type { ShoppingListItem } from "~/types/database";

import GlobalList from "../../../../../app/components/global/globalList.vue";

const layout = vi.hoisted(() => ({ portrait: false, phone: false, short: false }));

mockNuxtImport("useAppLayout", () => () => ({
  isPortrait: ref(layout.portrait),
  isPhone: ref(layout.phone),
  isShortScreen: ref(layout.short),
}));

function baseShoppingList(
  overrides: Partial<ShoppingListWithIntegration> & { id: string; name: string; order: number },
): ShoppingListWithIntegration {
  return {
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ShoppingListWithIntegration;
}

describe("GlobalList", () => {
  it("renders empty state when lists are empty", async () => {
    const wrapper = await mountSuspended(GlobalList, {
      props: {
        lists: [],
        loading: false,
      },
    });
    expect(wrapper.text()).toContain("No lists found");
  });

  it("shows loading state when loading", async () => {
    const wrapper = await mountSuspended(GlobalList, {
      props: {
        lists: [],
        loading: true,
      },
    });
    expect(wrapper.text()).toContain("Loading lists");
  });

  it("shows emptyStateDescription when provided and lists empty", async () => {
    const wrapper = await mountSuspended(GlobalList, {
      props: {
        lists: [],
        loading: false,
        emptyStateDescription: "Add your first list to get started.",
      },
    });
    expect(wrapper.text()).toContain("Add your first list to get started.");
  });

  it("renders with showEditItem as function and lists with items", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Groceries",
      order: 1,
      items: [
        {
          id: "item-1",
          name: "Milk",
          checked: false,
          order: 1,
          notes: null,
          quantity: 1,
          unit: null,
          label: null,
          food: null,
        },
      ] as ShoppingListItem[],
    });
    const showEditItemFn = () => true;
    const wrapper = await mountSuspended(GlobalList, {
      props: {
        lists: [list],
        loading: false,
        showEditItem: showEditItemFn,
      },
    });
    expect(wrapper.text()).toContain("Groceries");
    expect(wrapper.text()).toContain("Milk");
  });

  it("shows progress when showProgress and list has mixed completed and active items", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      items: [
        { id: "i1", name: "A", checked: true, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i2", name: "B", checked: false, order: 2, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: {
        lists: [list],
        loading: false,
        showProgress: true,
      },
    });
    expect(wrapper.text()).toContain("50%");
  });

  it("shows 0% progress when all items unchecked", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      items: [
        { id: "i1", name: "A", checked: false, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i2", name: "B", checked: false, order: 2, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: { lists: [list], loading: false, showProgress: true },
    });
    expect(wrapper.text()).toContain("0%");
  });

  it("shows 25% progress when one of four items checked", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      items: [
        { id: "i1", name: "A", checked: true, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i2", name: "B", checked: false, order: 2, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i3", name: "C", checked: false, order: 3, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i4", name: "D", checked: false, order: 4, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: { lists: [list], loading: false, showProgress: true },
    });
    expect(wrapper.text()).toContain("25%");
  });

  it("shows 75% progress when three of four items checked", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      items: [
        { id: "i1", name: "A", checked: true, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i2", name: "B", checked: true, order: 2, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i3", name: "C", checked: true, order: 3, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i4", name: "D", checked: false, order: 4, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: { lists: [list], loading: false, showProgress: true },
    });
    expect(wrapper.text()).toContain("75%");
  });

  it("shows 100% progress when all items checked", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      items: [
        { id: "i1", name: "A", checked: true, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i2", name: "B", checked: true, order: 2, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: { lists: [list], loading: false, showProgress: true },
    });
    expect(wrapper.text()).toContain("100%");
  });

  it("renders lists with source native and integration when showIntegrationIcons", async () => {
    const nativeList = baseShoppingList({
      id: "n1",
      name: "Native",
      order: 1,
      source: "native",
    });
    const integrationList = baseShoppingList({
      id: "i1",
      name: "Integration",
      order: 2,
      source: "integration",
      integrationName: "Mealie",
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: {
        lists: [nativeList, integrationList],
        loading: false,
        showIntegrationIcons: true,
      },
    });
    expect(wrapper.text()).toContain("Native");
    expect(wrapper.text()).toContain("Integration");
  });

  it("renders item name as a clickable button and emits viewItem when showDetail", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Groceries",
      order: 1,
      items: [
        { id: "item-1", name: "Milk", checked: false, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: {
        lists: [list],
        loading: false,
        showDetail: true,
      },
    });
    const button = wrapper.find("button.hover\\:underline");
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe("Milk");

    await button.trigger("click");
    expect(wrapper.emitted("viewItem")?.[0]?.[0]).toMatchObject({ id: "item-1" });
  });

  it("renders item name as plain text (no detail button) when showDetail is not set", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Groceries",
      order: 1,
      items: [
        { id: "item-1", name: "Milk", checked: false, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: {
        lists: [list],
        loading: false,
      },
    });
    expect(wrapper.find("button.hover\\:underline").exists()).toBe(false);
    expect(wrapper.text()).toContain("Milk");
  });

  it("shows hidden item count in the progress line when hiddenItemCount is set", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      hiddenItemCount: 9,
      items: [
        { id: "i1", name: "A", checked: true, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
        { id: "i2", name: "B", checked: false, order: 2, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: { lists: [list], loading: false, showProgress: true },
    });
    expect(wrapper.text()).toContain("9 hidden");
  });

  it("omits the hidden note when hiddenItemCount is unset", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      items: [
        { id: "i1", name: "A", checked: true, order: 1, notes: null, quantity: 1, unit: null, label: null, food: null },
      ] as ShoppingListItem[],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: { lists: [list], loading: false, showProgress: true },
    });
    expect(wrapper.text()).not.toContain("hidden");
  });

  it("shows a filter-aware empty state when items are empty and hiddenItemCount is set", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      items: [],
      hiddenItemCount: 4,
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: { lists: [list], loading: false },
    });
    expect(wrapper.text()).toContain("No items match the current filter");
    expect(wrapper.text()).toContain("4 hidden by the current filter");
    expect(wrapper.text()).not.toContain("No items yet");
  });

  it("shows the default empty state when items are empty and hiddenItemCount is unset", async () => {
    const list = baseShoppingList({
      id: "list-1",
      name: "Tasks",
      order: 1,
      items: [],
    });
    const wrapper = await mountSuspended(GlobalList, {
      props: { lists: [list], loading: false },
    });
    expect(wrapper.text()).toContain("No items yet");
    expect(wrapper.text()).toContain("Add your first item to get started");
  });

  describe("orientation layout", () => {
    const lists = [
      baseShoppingList({ id: "list-1", name: "Groceries", order: 1 }),
      baseShoppingList({ id: "list-2", name: "Hardware", order: 2 }),
    ];

    afterEach(() => {
      layout.portrait = false;
      layout.phone = false;
    });

    it("renders a wrapping grid in portrait", async () => {
      layout.portrait = true;
      const wrapper = await mountSuspended(GlobalList, {
        props: { lists, loading: false },
      });
      const html = wrapper.html();
      expect(html).toContain("grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))]");
      expect(html).toContain("auto-rows-[minmax(24rem,1fr)]");
      expect(html).not.toContain("min-w-80");
      expect(html).not.toContain("sticky top-0");
    });

    it("uses a single page scroll with sticky list headers on a portrait phone", async () => {
      layout.portrait = true;
      layout.phone = true;
      const wrapper = await mountSuspended(GlobalList, {
        props: { lists, loading: false },
      });
      const html = wrapper.html();
      expect(html).not.toContain("auto-rows-[minmax(24rem,1fr)]");
      expect(html.match(/sticky top-0 z-10/g)).toHaveLength(2);
      expect(html).not.toContain("overflow-y-auto p-4");
    });

    it("renders stretching columns in landscape", async () => {
      const wrapper = await mountSuspended(GlobalList, {
        props: { lists, loading: false },
      });
      const html = wrapper.html();
      expect(html).toContain("overflow-x-auto flex gap-6");
      expect(html.match(/flex-1 basis-0 min-w-80/g)).toHaveLength(2);
      expect(html).not.toContain("auto-fill");
    });
  });

  describe("compact short screens", () => {
    const lists = [baseShoppingList({ id: "list-1", name: "Groceries", order: 1 })];

    afterEach(() => {
      layout.short = false;
    });

    it("renders an add icon button in the list header", async () => {
      layout.short = true;
      const wrapper = await mountSuspended(GlobalList, {
        props: { lists, loading: false, showAdd: true },
      });
      expect(wrapper.find("[aria-label=\"Add item to Groceries\"]").exists()).toBe(true);
      expect(wrapper.text()).not.toContain("Add Item");
    });

    it("shows a filter hint when the list has hidden items", async () => {
      layout.short = true;
      const wrapper = await mountSuspended(GlobalList, {
        props: {
          lists: [baseShoppingList({ id: "list-1", name: "Groceries", order: 1, hiddenItemCount: 2 })],
          loading: false,
        },
      });
      expect(wrapper.text()).toContain("2 hidden by the current filter");
    });

    it("omits the filter hint when nothing is hidden", async () => {
      layout.short = true;
      const wrapper = await mountSuspended(GlobalList, {
        props: { lists, loading: false },
      });
      expect(wrapper.text()).not.toContain("hidden by the current filter");
    });

    it("renders the full-width Add Item button otherwise", async () => {
      const wrapper = await mountSuspended(GlobalList, {
        props: { lists, loading: false, showAdd: true },
      });
      expect(wrapper.find("[aria-label=\"Add item to Groceries\"]").exists()).toBe(false);
      expect(wrapper.text()).toContain("Add Item");
    });
  });
});
