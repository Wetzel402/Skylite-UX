<script setup lang="ts">
import { consola } from "consola";
import { addDays, format, startOfDay, startOfWeek } from "date-fns";

import type { MealType, MealWithDate } from "~/types/database";

import { useAlertToast } from "~/composables/useAlertToast";
import { useOfflineSync } from "~/composables/useOfflineSync";
import { useStableDate } from "~/composables/useStableDate";

import MealDayCard from "./mealDayCard.vue";
import MealDetailSheet from "./mealDetailSheet.vue";

const { showError, showSuccess } = useAlertToast();
const { getStableDate } = useStableDate();

const {
  getMealsForDateRange,
  getMealPlanByWeek,
  createMealPlan,
  addMealToPlan,
  updateMeal,
  deleteMeal,
} = useMealPlans();

const { isOnline } = useOfflineSync();

// State
const meals = ref<MealWithDate[]>([]);
const days = ref<Date[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const INITIAL_DAYS = 14;
const LOAD_MORE_DAYS = 7;
const SCROLL_THRESHOLD = 300; // px from bottom to trigger load

// Detail sheet state
const detailSheetOpen = ref(false);
const detailMeal = ref<MealWithDate | null>(null);

// Scroll container ref
const scrollContainer = ref<HTMLElement | null>(null);

// Initialize days array starting from today
function initDays() {
  const today = startOfDay(getStableDate());
  days.value = Array.from({ length: INITIAL_DAYS }, (_, i) => addDays(today, i));
}

// Get meals for a specific date
function getMealsForDate(date: Date): MealWithDate[] {
  const dateStr = format(date, "yyyy-MM-dd");
  return meals.value.filter((m) => {
    // Use UTC components since calculatedDate is UTC midnight from the server
    const utc = new Date(m.calculatedDate);
    const mealDateStr = format(new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()), "yyyy-MM-dd");
    return mealDateStr === dateStr;
  });
}

// Fetch meals for a date range and merge into local state
async function fetchMeals(startDate: Date, endDate: Date) {
  try {
    const fetched = await getMealsForDateRange(startDate, endDate);

    // Build a map of fetched meals by id for efficient lookup
    const fetchedById = new Map(fetched.map(m => [m.id, m]));

    // Update existing meals in place, track which fetched meals are new
    const updatedMeals = meals.value.map((existing) => {
      const updated = fetchedById.get(existing.id);
      if (updated) {
        fetchedById.delete(existing.id);
        return updated;
      }
      return existing;
    });

    // Append any genuinely new meals
    for (const newMeal of fetchedById.values()) {
      updatedMeals.push(newMeal);
    }

    meals.value = updatedMeals;
  }
  catch (fetchError) {
    if (!isOnline.value) {
      showError("Offline", "Cannot load meals while offline.");
    }
    else {
      showError("Load Failed", "Failed to load meals.");
    }
    consola.error("Failed to fetch meals:", fetchError);
  }
}

// Initial load
async function initialLoad() {
  loading.value = true;
  initDays();
  const startDate = days.value[0]!;
  const endDate = days.value[days.value.length - 1]!;
  await fetchMeals(startDate, endDate);
  loading.value = false;
}

// Load more days
async function loadMore() {
  if (loadingMore.value)
    return;
  loadingMore.value = true;

  const lastDay = days.value[days.value.length - 1]!;
  const newDays = Array.from(
    { length: LOAD_MORE_DAYS },
    (_, i) => addDays(lastDay, i + 1),
  );

  days.value = [...days.value, ...newDays];
  await fetchMeals(newDays[0]!, newDays[newDays.length - 1]!);
  loadingMore.value = false;
}

// Scroll handler for infinite loading
function handleScroll(event: Event) {
  const el = event.target as HTMLElement;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (distanceFromBottom < SCROLL_THRESHOLD) {
    loadMore();
  }
}

// Ensure a meal plan exists for the week containing a date, return its ID
async function ensureMealPlan(date: Date): Promise<string> {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  let plan = await getMealPlanByWeek(weekStart);
  if (!plan) {
    plan = await createMealPlan({ weekStart, order: 0 });
  }
  return plan.id;
}

// Get dayOfWeek (0=Monday, 6=Sunday) from a Date
function getDayOfWeek(date: Date): number {
  return (date.getDay() + 6) % 7;
}

// Handle new meal save
async function handleSaveMeal(data: { date: Date; mealType: MealType; name: string }) {
  try {
    const planId = await ensureMealPlan(data.date);
    const newMeal = await addMealToPlan(planId, {
      name: data.name,
      mealType: data.mealType,
      dayOfWeek: getDayOfWeek(data.date),
    });

    // Immediately show the meal in local state (covers offline temp meals)
    if (newMeal) {
      const mealWithDate: MealWithDate = {
        ...newMeal,
        calculatedDate: data.date,
        mealPlanWeekStart: startOfWeek(data.date, { weekStartsOn: 1 }),
      };
      // Upsert: replace if exists (by id), otherwise append
      const existingIdx = meals.value.findIndex(m => m.id === mealWithDate.id);
      if (existingIdx !== -1) {
        meals.value[existingIdx] = mealWithDate;
      }
      else {
        meals.value = [...meals.value, mealWithDate];
      }
    }

    // Refresh from server to ensure consistency
    const weekStart = startOfWeek(data.date, { weekStartsOn: 1 });
    await fetchMeals(weekStart, addDays(weekStart, 6));
  }
  catch (saveError) {
    consola.error("Failed to save meal:", saveError);
    showError("Save Failed", "Failed to save meal.");
  }
}

// Handle meal name update
async function handleUpdateMealName(data: { mealId: string; name: string }) {
  try {
    await updateMeal(data.mealId, { name: data.name });
    // Update local state
    const idx = meals.value.findIndex(m => m.id === data.mealId);
    if (idx !== -1) {
      meals.value[idx] = { ...meals.value[idx]!, name: data.name };
    }
  }
  catch (updateError) {
    consola.error("Failed to update meal:", updateError);
    showError("Update Failed", "Failed to update meal.");
  }
}

// Handle meal delete (from card — clears text)
// TODO: add undo toast for accidental deletions
async function handleDeleteMeal(mealId: string) {
  try {
    await deleteMeal(mealId);
    meals.value = meals.value.filter(m => m.id !== mealId);
    showSuccess("Deleted", "Meal removed.");
  }
  catch (deleteError) {
    consola.error("Failed to delete meal:", deleteError);
    showError("Delete Failed", "Failed to delete meal.");
  }
}

// Handle detail sheet open
function handleOpenDetail(meal: MealWithDate) {
  detailMeal.value = meal;
  detailSheetOpen.value = true;
}

// Handle detail sheet save
async function handleDetailSave(data: { mealId: string; description: string; daysInAdvance: number }) {
  try {
    await updateMeal(data.mealId, {
      description: data.description,
      daysInAdvance: data.daysInAdvance,
    });
    // Update local state
    const idx = meals.value.findIndex(m => m.id === data.mealId);
    if (idx !== -1) {
      meals.value[idx] = {
        ...meals.value[idx]!,
        description: data.description || null,
        daysInAdvance: data.daysInAdvance,
      };
    }
    showSuccess("Saved", "Meal details updated.");
    detailSheetOpen.value = false;
    detailMeal.value = null;
  }
  catch (detailError) {
    consola.error("Failed to update meal details:", detailError);
    showError("Update Failed", "Failed to update meal details.");
  }
}

// Handle detail sheet delete
async function handleDetailDelete(mealId: string) {
  detailSheetOpen.value = false;
  detailMeal.value = null;
  await handleDeleteMeal(mealId);
}

onMounted(() => {
  initialLoad();
});
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
    @scroll="handleScroll"
  >
    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <div class="text-center">
        <UIcon name="i-lucide-loader-2" class="h-8 w-8 animate-spin text-primary-500" />
        <p class="mt-2 text-sm text-muted">
          Loading meals...
        </p>
      </div>
    </div>

    <!-- Day cards -->
    <div v-else class="p-4 space-y-3">
      <MealDayCard
        v-for="day in days"
        :key="day.toISOString()"
        :date="day"
        :meals="getMealsForDate(day)"
        @save-meal="handleSaveMeal"
        @update-meal-name="handleUpdateMealName"
        @delete-meal="handleDeleteMeal"
        @open-detail="handleOpenDetail"
      />

      <!-- Loading more indicator -->
      <div v-if="loadingMore" class="flex items-center justify-center py-4">
        <UIcon name="i-lucide-loader-2" class="h-5 w-5 animate-spin text-muted" />
        <span class="ml-2 text-sm text-muted">Loading more days...</span>
      </div>
    </div>

    <!-- Detail bottom sheet -->
    <MealDetailSheet
      :meal="detailMeal"
      :open="detailSheetOpen"
      @update:open="(val: boolean) => { detailSheetOpen = val; if (!val) detailMeal = null; }"
      @save="handleDetailSave"
      @delete="handleDetailDelete"
    />
  </div>
</template>
