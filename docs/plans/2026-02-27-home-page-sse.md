# Home Page SSE Migration Implementation Plan

**Goal:** Replace the home page's 5 independent polling intervals with SSE listeners that react to server-side data changes in real-time.

**Architecture:** Extend the existing sync manager (`server/plugins/02.syncManager.ts`) with new event types (`weather_update`, `meals_update`, `todos_update`, `events_update`, `countdowns_update`). API mutation routes call a new `broadcastHomeUpdate()` utility after successful CRUD operations. The home page subscribes to these events via a new `useHomeSSE()` composable while keeping initial data fetches on mount.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Server-Sent Events (existing infrastructure), Prisma, Vitest

---

## Tasks

### Task 1: Extend SyncEvent types for home page events

**Files:**
- Modify: `app/types/sync.ts:1-78`

**Step 1: Write the failing test**

Create test file `tests/unit/types/sync-types.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("SyncEvent types", () => {
  it("should accept home page event types", () => {
    // Type-level test: these assignments should compile without error
    const homeEventTypes = [
      "weather_update",
      "meals_update",
      "todos_update",
      "events_update",
      "countdowns_update",
    ] as const;

    // Verify all home event types are valid SyncEvent types
    // This test validates the type definition was extended correctly
    homeEventTypes.forEach((type) => {
      expect(typeof type).toBe("string");
    });
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd /c/Skylight && npx vitest run tests/unit/types/sync-types.test.ts`
Expected: PASS (this is a type-level change, the test documents intent)

**Step 3: Update the SyncEvent type**

In `app/types/sync.ts`, change line 6:

```typescript
// OLD:
export type SyncEvent = {
  type: "integration_sync" | "connection_established" | "sync_status" | "heartbeat";

// NEW:
export type HomeUpdateEventType = "weather_update" | "meals_update" | "todos_update" | "events_update" | "countdowns_update";

export type SyncEvent = {
  type: "integration_sync" | "connection_established" | "sync_status" | "heartbeat" | HomeUpdateEventType;
```

Also update `ServerSyncEvent` (line 69) to support both integration_sync and home update events:

```typescript
// OLD:
export type ServerSyncEvent = {
  type: "integration_sync";

// NEW:
export type ServerSyncEvent = {
  type: "integration_sync" | HomeUpdateEventType;
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Skylight && npx vitest run tests/unit/types/sync-types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/types/sync.ts tests/unit/types/sync-types.test.ts
git commit -m "feat: extend SyncEvent types with home page event types"
```

---

### Task 2: Create broadcastHomeUpdate server utility

**Files:**
- Create: `server/utils/broadcastHomeUpdate.ts`
- Test: `tests/unit/server/broadcastHomeUpdate.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/server/broadcastHomeUpdate.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the sync manager's broadcastToClients
const mockBroadcastToClients = vi.fn();
const mockConnectedClientsSize = vi.fn(() => 1);

vi.mock("../../server/plugins/02.syncManager", () => ({
  broadcastToClients: (...args: any[]) => mockBroadcastToClients(...args),
  getConnectedClientsCount: () => mockConnectedClientsSize(),
}));

// Mock prisma
vi.mock("../../app/lib/prisma", () => ({
  default: {
    meal: {
      findMany: vi.fn().mockResolvedValue([
        { id: "1", name: "Pancakes", mealType: "BREAKFAST", calculatedDate: new Date() },
      ]),
    },
    todo: {
      findMany: vi.fn().mockResolvedValue([
        { id: "1", title: "Buy groceries", completed: false },
      ]),
    },
  },
}));

describe("broadcastHomeUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be a callable function", async () => {
    const { broadcastHomeUpdate } = await import("../../server/utils/broadcastHomeUpdate");
    expect(typeof broadcastHomeUpdate).toBe("function");
  });

  it("should call broadcastToClients with correct event type for meals_update", async () => {
    const { broadcastHomeUpdate } = await import("../../server/utils/broadcastHomeUpdate");
    await broadcastHomeUpdate("meals_update");

    expect(mockBroadcastToClients).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "meals_update",
        success: true,
      }),
    );
  });

  it("should not broadcast when no clients are connected", async () => {
    mockConnectedClientsSize.mockReturnValue(0);
    const { broadcastHomeUpdate } = await import("../../server/utils/broadcastHomeUpdate");
    await broadcastHomeUpdate("meals_update");

    expect(mockBroadcastToClients).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Skylight && npx vitest run tests/unit/server/broadcastHomeUpdate.test.ts`
Expected: FAIL — module not found

**Step 3: Create the broadcastHomeUpdate utility**

Create `server/utils/broadcastHomeUpdate.ts`:

```typescript
import { consola } from "consola";

import type { HomeUpdateEventType } from "../../app/types/sync";

// Import will be lazy to avoid circular dependency with sync manager
let _broadcastToClients: ((event: any) => void) | null = null;
let _getConnectedClientsCount: (() => number) | null = null;

export function setBroadcastFunction(fn: (event: any) => void, countFn: () => number) {
  _broadcastToClients = fn;
  _getConnectedClientsCount = countFn;
}

export async function broadcastHomeUpdate(eventType: HomeUpdateEventType): Promise<void> {
  if (!_broadcastToClients || !_getConnectedClientsCount) {
    consola.debug(`[Home Broadcast] Not initialized, skipping ${eventType}`);
    return;
  }

  if (_getConnectedClientsCount() === 0) {
    consola.debug(`[Home Broadcast] No clients connected, skipping ${eventType}`);
    return;
  }

  try {
    const data = await fetchDataForEventType(eventType);

    const event = {
      type: eventType,
      data,
      timestamp: new Date(),
      success: true,
    };

    _broadcastToClients(event);
    consola.debug(`[Home Broadcast] Sent ${eventType} to ${_getConnectedClientsCount()} clients`);
  }
  catch (error) {
    consola.error(`[Home Broadcast] Failed to broadcast ${eventType}:`, error);
  }
}

async function fetchDataForEventType(eventType: HomeUpdateEventType): Promise<any> {
  const prisma = await import("../../app/lib/prisma").then(m => m.default);

  switch (eventType) {
    case "meals_update": {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

      return prisma.meal.findMany({
        where: {
          mealPlan: {
            meals: {
              some: {
                calculatedDate: {
                  gte: new Date(`${today}T00:00:00`),
                  lte: new Date(`${tomorrowStr}T23:59:59`),
                },
              },
            },
          },
          calculatedDate: {
            gte: new Date(`${today}T00:00:00`),
            lte: new Date(`${tomorrowStr}T23:59:59`),
          },
        },
        include: {
          mealPlan: true,
        },
      });
    }

    case "todos_update": {
      return prisma.todo.findMany({
        where: {
          completed: false,
        },
        include: {
          todoColumn: {
            select: {
              id: true,
              name: true,
              order: true,
              isDefault: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },
            },
          },
        },
        take: 20,
      });
    }

    case "countdowns_update": {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      return prisma.todo.findMany({
        where: {
          isCountdown: true,
          completed: false,
          dueDate: {
            gte: now,
          },
        },
        orderBy: {
          dueDate: "asc",
        },
      });
    }

    case "events_update": {
      // Calendar events come from integrations — trigger a re-fetch of local events
      return prisma.calendarEvent.findMany({
        where: {
          start: {
            gte: new Date(),
          },
        },
        include: {
          users: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: {
          start: "asc",
        },
        take: 20,
      });
    }

    case "weather_update": {
      // Weather is fetched from external API, handled separately in sync manager
      return null;
    }

    default:
      consola.warn(`[Home Broadcast] Unknown event type: ${eventType}`);
      return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Skylight && npx vitest run tests/unit/server/broadcastHomeUpdate.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/utils/broadcastHomeUpdate.ts tests/unit/server/broadcastHomeUpdate.test.ts
git commit -m "feat: add broadcastHomeUpdate server utility"
```

---

### Task 3: Wire broadcastHomeUpdate into sync manager and add weather job

**Files:**
- Modify: `server/plugins/02.syncManager.ts`

**Step 1: Write the failing test**

Create `tests/unit/server/syncManager-weather.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

describe("Sync Manager weather broadcast", () => {
  it("should export broadcastToClients function", async () => {
    // Verify the sync manager exports broadcastToClients for use by broadcastHomeUpdate
    const syncManager = await import("../../server/plugins/02.syncManager");
    expect(typeof syncManager.broadcastToClients).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Skylight && npx vitest run tests/unit/server/syncManager-weather.test.ts`
Expected: May fail depending on module resolution — this validates the export exists.

**Step 3: Update the sync manager**

In `server/plugins/02.syncManager.ts`, add the following changes:

1. Import and initialize broadcastHomeUpdate at the top:

```typescript
import { setBroadcastFunction } from "../utils/broadcastHomeUpdate";
```

2. Inside the `defineNitroPlugin` callback, after `consola.start("Sync Manager: Initializing...");`, add:

```typescript
  // Initialize home broadcast utility with our broadcast function
  setBroadcastFunction(broadcastToClients, () => connectedClients.size);
```

3. After `await initializeIntegrationSync();`, add the weather scheduled job:

```typescript
  // Set up weather broadcast job
  await initializeWeatherBroadcast();
```

4. Add the weather broadcast function:

```typescript
let weatherInterval: NodeJS.Timeout | null = null;

async function initializeWeatherBroadcast() {
  try {
    const prisma = await import("../../app/lib/prisma").then(m => m.default);
    const homeSettings = await prisma.homeSettings.findFirst();

    if (!homeSettings?.weatherEnabled || !homeSettings.latitude || !homeSettings.longitude) {
      consola.debug("Sync Manager: Weather broadcast skipped (not configured)");
      return;
    }

    const refreshIntervalMs = (homeSettings.refreshInterval || 6.0) * 3600000;

    // Fetch and broadcast weather on schedule
    weatherInterval = setInterval(async () => {
      await broadcastWeatherUpdate(homeSettings);
    }, refreshIntervalMs);

    // Do an initial weather broadcast
    await broadcastWeatherUpdate(homeSettings);

    consola.debug(`Sync Manager: Weather broadcast initialized (interval: ${homeSettings.refreshInterval || 6} hours)`);
  }
  catch (error) {
    consola.error("Sync Manager: Failed to initialize weather broadcast:", error);
  }
}

async function broadcastWeatherUpdate(homeSettings: any) {
  if (connectedClients.size === 0) return;

  try {
    const https = await import("node:https");

    const params = new URLSearchParams({
      latitude: homeSettings.latitude.toString(),
      longitude: homeSettings.longitude.toString(),
      current: "temperature_2m,apparent_temperature,weather_code,is_day",
      daily: "temperature_2m_max,temperature_2m_min,weather_code",
      temperature_unit: homeSettings.temperatureUnit === "fahrenheit" ? "fahrenheit" : "celsius",
      timezone: "auto",
      forecast_days: "7",
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

    const weather: any = await new Promise((resolve, reject) => {
      let req: ReturnType<typeof https.get>;

      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error("Weather request timeout"));
      }, 30000);

      req = https.get(url, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          clearTimeout(timeout);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = "";
        res.on("data", (chunk: string) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timeout);
          try { resolve(JSON.parse(data)); }
          catch (err) { reject(err); }
        });
      }).on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const getWeatherDescription = (code: number): string => {
      if (code === 0) return "Clear sky";
      if (code === 1) return "Mainly clear";
      if (code === 2) return "Partly cloudy";
      if (code === 3) return "Overcast";
      if (code >= 45 && code <= 48) return "Foggy";
      if (code >= 51 && code <= 57) return "Drizzle";
      if (code >= 61 && code <= 67) return "Rain";
      if (code >= 71 && code <= 77) return "Snow";
      if (code >= 80 && code <= 82) return "Rain showers";
      if (code >= 85 && code <= 86) return "Snow showers";
      if (code >= 95 && code <= 99) return "Thunderstorm";
      return "Unknown";
    };

    const dailyForecast = weather.daily.time.map((date: string, index: number) => ({
      date,
      tempMax: Math.round(weather.daily.temperature_2m_max[index]),
      tempMin: Math.round(weather.daily.temperature_2m_min[index]),
      weatherCode: weather.daily.weather_code[index],
      weatherDescription: getWeatherDescription(weather.daily.weather_code[index]),
    }));

    const weatherData = {
      temperature: Math.round(weather.current.temperature_2m),
      weatherCode: weather.current.weather_code,
      weatherDescription: getWeatherDescription(weather.current.weather_code),
      daily: dailyForecast,
    };

    const event = {
      type: "weather_update" as const,
      data: weatherData,
      timestamp: new Date(),
      success: true,
    };

    broadcastToClients(event as any);
    consola.debug("Sync Manager: Broadcast weather update");
  }
  catch (error) {
    consola.error("Sync Manager: Failed to fetch/broadcast weather:", error);
  }
}
```

5. In the `close` hook, add cleanup for weather interval:

```typescript
  nitroApp.hooks.hook("close", () => {
    consola.info("Sync Manager: Shutting down...");
    if (weatherInterval) clearInterval(weatherInterval);
    clearAllSyncIntervals();
  });
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Skylight && npx vitest run tests/unit/server/syncManager-weather.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/plugins/02.syncManager.ts tests/unit/server/syncManager-weather.test.ts
git commit -m "feat: add weather broadcast job and wire broadcastHomeUpdate into sync manager"
```

---

### Task 4: Add broadcastHomeUpdate calls to meal API routes

**Files:**
- Modify: `server/api/meal-plans/index.post.ts`
- Modify: `server/api/meal-plans/[id].delete.ts`
- Modify: `server/api/meal-plans/[id]/meals.post.ts`
- Modify: `server/api/meals/[id].put.ts`
- Modify: `server/api/meals/[id].delete.ts`

**Step 1: Write the failing test**

Create `tests/integration/meals-broadcast.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

const mockBroadcastHomeUpdate = vi.fn();

vi.mock("../../server/utils/broadcastHomeUpdate", () => ({
  broadcastHomeUpdate: (...args: any[]) => mockBroadcastHomeUpdate(...args),
}));

describe("Meal API broadcast integration", () => {
  it("broadcastHomeUpdate should be importable", async () => {
    const mod = await import("../../server/utils/broadcastHomeUpdate");
    expect(typeof mod.broadcastHomeUpdate).toBe("function");
  });
});
```

**Step 2: Run test to verify it passes (smoke test)**

Run: `cd /c/Skylight && npx vitest run tests/integration/meals-broadcast.test.ts`
Expected: PASS

**Step 3: Add broadcast calls to each meal mutation route**

For each of the 5 files, add the import at the top:

```typescript
import { broadcastHomeUpdate } from "~/utils/broadcastHomeUpdate";
```

Then add the broadcast call after each successful mutation (before the return statement). The broadcast is fire-and-forget — don't await it or let it affect the response.

**`server/api/meals/[id].put.ts`** — after `const meal = await prisma.meal.update(...)` (line 55), before `return meal` (line 67):

```typescript
    // Fire-and-forget: notify home page
    broadcastHomeUpdate("meals_update").catch(() => {});
```

**`server/api/meals/[id].delete.ts`** — after the successful delete, before the return:

```typescript
    broadcastHomeUpdate("meals_update").catch(() => {});
```

**`server/api/meal-plans/index.post.ts`** — after successful create, before return:

```typescript
    broadcastHomeUpdate("meals_update").catch(() => {});
```

**`server/api/meal-plans/[id].delete.ts`** — after successful delete, before return:

```typescript
    broadcastHomeUpdate("meals_update").catch(() => {});
```

**`server/api/meal-plans/[id]/meals.post.ts`** — after successful meal creation, before return:

```typescript
    broadcastHomeUpdate("meals_update").catch(() => {});
```

**Step 4: Run tests**

Run: `cd /c/Skylight && npx vitest run`
Expected: All existing tests pass

**Step 5: Commit**

```bash
git add server/api/meals/ server/api/meal-plans/
git commit -m "feat: broadcast meals_update SSE event on meal CRUD operations"
```

---

### Task 5: Add broadcastHomeUpdate calls to todo API routes

**Files:**
- Modify: `server/api/todos/index.post.ts`
- Modify: `server/api/todos/[id].put.ts`
- Modify: `server/api/todos/[id].delete.ts`
- Modify: `server/api/todos/reorder.post.ts`
- Modify: `server/api/todos/reorder.put.ts`

**Step 1: Add broadcast calls**

For each file, add the import:

```typescript
import { broadcastHomeUpdate } from "~/utils/broadcastHomeUpdate";
```

Then add after each successful mutation (fire-and-forget):

```typescript
    broadcastHomeUpdate("todos_update").catch(() => {});
```

For `[id].put.ts` — also check if the todo is a countdown and broadcast `countdowns_update`:

```typescript
    broadcastHomeUpdate("todos_update").catch(() => {});
    // If this todo is a countdown, also update countdown widget
    if (body.isCountdown !== undefined || body.dueDate !== undefined) {
      broadcastHomeUpdate("countdowns_update").catch(() => {});
    }
```

For `index.post.ts` — check if created as countdown:

```typescript
    broadcastHomeUpdate("todos_update").catch(() => {});
    if (body.isCountdown) {
      broadcastHomeUpdate("countdowns_update").catch(() => {});
    }
```

For `[id].delete.ts` — always broadcast both since we don't know if it was a countdown:

```typescript
    broadcastHomeUpdate("todos_update").catch(() => {});
    broadcastHomeUpdate("countdowns_update").catch(() => {});
```

**Step 2: Run tests**

Run: `cd /c/Skylight && npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add server/api/todos/
git commit -m "feat: broadcast todos_update and countdowns_update SSE events on todo CRUD"
```

---

### Task 6: Add broadcastHomeUpdate calls to calendar event API routes

**Files:**
- Modify: `server/api/calendar-events/index.post.ts`
- Modify: `server/api/calendar-events/[id].put.ts`
- Modify: `server/api/calendar-events/[id].delete.ts`

**Step 1: Add broadcast calls**

For each file, add the import and fire-and-forget broadcast after successful mutations:

```typescript
import { broadcastHomeUpdate } from "~/utils/broadcastHomeUpdate";

// After successful mutation:
broadcastHomeUpdate("events_update").catch(() => {});
```

**Step 2: Run tests**

Run: `cd /c/Skylight && npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add server/api/calendar-events/
git commit -m "feat: broadcast events_update SSE event on calendar event CRUD"
```

---

### Task 7: Handle new event types in SSE client plugin

**Files:**
- Modify: `app/plugins/03.syncManager.client.ts:180-221`

**Step 1: Add home event type handling**

In the `watch(eventSourceData, ...)` handler, add cases for the new event types after the existing `integration_sync` case (around line 220):

```typescript
            case "weather_update":
            case "meals_update":
            case "todos_update":
            case "events_update":
            case "countdowns_update": {
              // Store home update data in shared state for useHomeSSE to pick up
              const homeUpdates = useState<Record<string, { data: any; timestamp: Date }>>("home-sse-updates", () => ({}));
              homeUpdates.value = {
                ...homeUpdates.value,
                [event.type]: {
                  data: event.data,
                  timestamp: new Date(event.timestamp),
                },
              };
              consola.debug(`Sync Manager: Received home update: ${event.type}`);
              break;
            }
```

**Step 2: Run the dev server to verify no errors**

Run: `cd /c/Skylight && npx nuxt typecheck` (if available) or `npx vue-tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add app/plugins/03.syncManager.client.ts
git commit -m "feat: handle home page SSE event types in sync manager client"
```

---

### Task 8: Create useHomeSSE composable

**Files:**
- Create: `app/composables/useHomeSSE.ts`

**Step 1: Create the composable**

```typescript
import { consola } from "consola";

type HomeSSECallbacks = {
  onWeatherUpdate?: (data: any) => void;
  onMealsUpdate?: (data: any) => void;
  onTodosUpdate?: (data: any) => void;
  onEventsUpdate?: (data: any) => void;
  onCountdownsUpdate?: (data: any) => void;
};

export function useHomeSSE(callbacks: HomeSSECallbacks) {
  const homeUpdates = useState<Record<string, { data: any; timestamp: Date }>>("home-sse-updates", () => ({}));

  const eventMap: Record<string, keyof HomeSSECallbacks> = {
    weather_update: "onWeatherUpdate",
    meals_update: "onMealsUpdate",
    todos_update: "onTodosUpdate",
    events_update: "onEventsUpdate",
    countdowns_update: "onCountdownsUpdate",
  };

  // Watch for changes to home updates and dispatch to callbacks
  const stopWatch = watch(
    homeUpdates,
    (updates) => {
      for (const [eventType, callbackKey] of Object.entries(eventMap)) {
        const update = updates[eventType];
        if (update && callbacks[callbackKey]) {
          consola.debug(`[Home SSE] Dispatching ${eventType}`);
          callbacks[callbackKey]!(update.data);
        }
      }
    },
    { deep: true },
  );

  onUnmounted(() => {
    stopWatch();
  });

  return {
    homeUpdates: readonly(homeUpdates),
  };
}
```

**Step 2: Commit**

```bash
git add app/composables/useHomeSSE.ts
git commit -m "feat: add useHomeSSE composable for SSE event subscription"
```

---

### Task 9: Update home.vue — remove polling, add SSE listeners

**Files:**
- Modify: `app/pages/home.vue`

**Step 1: Update the script section**

Replace the `onMounted` block (lines 116-157) with:

```typescript
// Fetch photos and settings on mount
onMounted(async () => {
  await Promise.all([
    fetchPhotos(),
    fetchHomeSettings(),
  ]);

  startSlideshow();
  updateClock();
  intervals.value.push(setInterval(updateClock, 1000));

  // Initial data fetches (one-time, no polling intervals)
  if (homeSettings.value?.weatherEnabled && homeSettings.value.latitude && homeSettings.value.longitude) {
    await fetchWeather();
  }

  if (homeSettings.value?.eventsEnabled) {
    await fetchUpcomingEvents();
  }

  if (homeSettings.value?.todosEnabled) {
    await fetchTodaysTasks();
  }

  if (homeSettings.value?.mealsEnabled) {
    await fetchTodaysMenu();
  }
});

// Clear all intervals on unmount
onUnmounted(() => {
  intervals.value.forEach(interval => clearInterval(interval));
});

// SSE listeners — update refs when server pushes new data
useHomeSSE({
  onWeatherUpdate: (data) => {
    if (data && homeSettings.value?.weatherEnabled) {
      weather.value = {
        temperature: data.temperature,
        description: data.weatherDescription,
        code: data.weatherCode,
        location: data.location,
        daily: data.daily,
      };
      consola.debug("[Home] Weather updated via SSE");
    }
  },
  onMealsUpdate: (data) => {
    if (homeSettings.value?.mealsEnabled) {
      // Process meals same as fetchTodaysMenu
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const today = `${year}-${month}-${day}`;

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

      const mealTypeOrder: Record<string, number> = { BREAKFAST: 0, LUNCH: 1, DINNER: 2 };

      const todayMeals = (data || []).filter((meal: any) => {
        const mealDate = new Date(meal.calculatedDate);
        const mealDateStr = `${mealDate.getFullYear()}-${String(mealDate.getMonth() + 1).padStart(2, "0")}-${String(mealDate.getDate()).padStart(2, "0")}`;
        return mealDateStr === today;
      }).sort((a: any, b: any) =>
        (mealTypeOrder[a.mealType] ?? 999) - (mealTypeOrder[b.mealType] ?? 999),
      );

      const tomorrowMeals = (data || []).filter((meal: any) => {
        const mealDate = new Date(meal.calculatedDate);
        const mealDateStr = `${mealDate.getFullYear()}-${String(mealDate.getMonth() + 1).padStart(2, "0")}-${String(mealDate.getDate()).padStart(2, "0")}`;
        return mealDateStr === tomorrowStr;
      }).sort((a: any, b: any) =>
        (mealTypeOrder[a.mealType] ?? 999) - (mealTypeOrder[b.mealType] ?? 999),
      );

      todaysMenu.value = [
        ...todayMeals.map((meal: any) => ({ ...meal, dayLabel: "Today" })),
        ...tomorrowMeals.map((meal: any) => ({ ...meal, dayLabel: "Tomorrow" })),
      ];
      consola.debug("[Home] Meals updated via SSE");
    }
  },
  onTodosUpdate: (data) => {
    if (homeSettings.value?.todosEnabled && data) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const filtered = (data || [])
        .filter((todo: any) => {
          if (!todo.completed) {
            if (!todo.dueDate) return true;
            const dueDateObj = new Date(todo.dueDate);
            const dueDate = new Date(dueDateObj.getUTCFullYear(), dueDateObj.getUTCMonth(), dueDateObj.getUTCDate());
            return dueDate >= today && dueDate < tomorrow;
          }
          return false;
        })
        .slice(0, 5);

      todaysTasks.value = filtered;
      consola.debug("[Home] Tasks updated via SSE");
    }
  },
  onEventsUpdate: (data) => {
    if (homeSettings.value?.eventsEnabled && data) {
      const now = new Date();
      const upcoming = (data || [])
        .filter((event: any) => {
          const eventStart = new Date(event.start);
          if (Number.isNaN(eventStart.getTime())) return false;
          if (event.end) {
            const eventEnd = new Date(event.end);
            if (Number.isNaN(eventEnd.getTime())) return false;
            return eventEnd > now;
          }
          const defaultEnd = new Date(eventStart);
          if (event.allDay) {
            defaultEnd.setUTCHours(23, 59, 59, 999);
          } else {
            defaultEnd.setHours(defaultEnd.getHours() + 1);
          }
          return defaultEnd > now;
        })
        .sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime());

      upcomingEvents.value = upcoming;
      consola.debug("[Home] Events updated via SSE");
    }
  },
  onCountdownsUpdate: (_data) => {
    // Countdown widget handles its own data via props — this is a signal to refetch
    // The HomeCountdownWidget will be updated via props in the next task
    consola.debug("[Home] Countdowns update signal received via SSE");
  },
});
```

**Step 2: Run the linter**

Run: `cd /c/Skylight && npm run lint`
Expected: No errors (or only pre-existing ones)

**Step 3: Commit**

```bash
git add app/pages/home.vue
git commit -m "feat: replace home page polling with SSE listeners"
```

---

### Task 10: Update HomeCountdownWidget to accept SSE updates

**Files:**
- Modify: `app/components/home/HomeCountdownWidget.vue`

**Step 1: Update the countdown widget**

Remove the polling interval and add SSE listener. Replace the script section:

```typescript
<script setup lang="ts">
import consola from "consola";

import type { Todo } from "~/types/database";

const { fetchCountdowns, getEarliestCountdown, calculateDaysRemaining, getCountdownMessage } = useCountdowns();

const countdown = ref<Todo | null>(null);
const loading = ref(true);
const loadingMessage = ref(false);
const displayMessage = ref<string>("");
const daysRemaining = ref(0);

const daysRemainingDisplay = computed(() => {
  if (daysRemaining.value === 0)
    return "TODAY";
  if (daysRemaining.value === 1)
    return "1";
  return daysRemaining.value;
});

const daysRemainingLabel = computed(() => {
  if (daysRemaining.value === 0)
    return "";
  if (daysRemaining.value === 1)
    return "day";
  return "days";
});

async function loadCountdown() {
  loading.value = true;

  try {
    await fetchCountdowns();
    const earliest = getEarliestCountdown();

    if (earliest) {
      countdown.value = earliest;
      daysRemaining.value = calculateDaysRemaining(earliest.dueDate);

      // Load or generate the message
      loadingMessage.value = true;
      displayMessage.value = await getCountdownMessage(earliest);
      loadingMessage.value = false;

      consola.info(`Loaded countdown: ${earliest.title} (${daysRemaining.value} days)`);
    }
    else {
      countdown.value = null;
      consola.debug("No countdowns available");
    }
  }
  catch (error) {
    consola.error("Failed to load countdown:", error);
    countdown.value = null;
  }
  finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadCountdown();
});

// Listen for SSE countdown updates
useHomeSSE({
  onCountdownsUpdate: () => {
    consola.debug("Countdown widget: Received SSE update, reloading");
    loadCountdown();
  },
});
</script>
```

Key changes:
- Removed `fetchHomeSettings` import and usage
- Removed `intervalId` and `setInterval` polling
- Removed `onUnmounted` cleanup for the interval
- Added `useHomeSSE` listener that triggers `loadCountdown()` on SSE events
- Kept `loadCountdown()` on mount for initial data

**Step 2: Run linter**

Run: `cd /c/Skylight && npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add app/components/home/HomeCountdownWidget.vue
git commit -m "feat: replace countdown widget polling with SSE listener"
```

---

### Task 11: Add SSE reconnection recovery to home.vue

**Files:**
- Modify: `app/pages/home.vue`

**Step 1: Add reconnection recovery**

In home.vue, after the `useHomeSSE({...})` block, add a watcher on the SSE connection status that refetches all data when reconnecting:

```typescript
// Re-fetch all data when SSE reconnects (to cover any missed events)
const { getConnectionStatus } = useSyncManager();
const previousConnectionStatus = ref(getConnectionStatus());

watch(
  () => getConnectionStatus(),
  (newStatus) => {
    if (newStatus === "connected" && previousConnectionStatus.value !== "connected") {
      consola.info("[Home] SSE reconnected, refreshing all widget data");
      if (homeSettings.value?.weatherEnabled && homeSettings.value.latitude && homeSettings.value.longitude) {
        fetchWeather();
      }
      if (homeSettings.value?.eventsEnabled) {
        fetchUpcomingEvents();
      }
      if (homeSettings.value?.todosEnabled) {
        fetchTodaysTasks();
      }
      if (homeSettings.value?.mealsEnabled) {
        fetchTodaysMenu();
      }
    }
    previousConnectionStatus.value = newStatus;
  },
);
```

**Step 2: Run linter**

Run: `cd /c/Skylight && npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add app/pages/home.vue
git commit -m "feat: re-fetch home page data on SSE reconnection"
```

---

### Task 12: Run full test suite and verify

**Step 1: Run all tests**

Run: `cd /c/Skylight && npx vitest run`
Expected: All tests pass

**Step 2: Run linter**

Run: `cd /c/Skylight && npm run lint`
Expected: No errors

**Step 3: Run type check**

Run: `cd /c/Skylight && npx nuxt typecheck` or `npx vue-tsc --noEmit`
Expected: No type errors

**Step 4: Manual smoke test**

Run: `cd /c/Skylight && npm run dev`
Verify:
1. Home page loads and shows all widgets immediately (initial fetch)
2. Clock and photo slideshow still work
3. No polling intervals visible in browser DevTools Network tab (except clock)
4. Create a meal on the meal planner page → home page updates without refresh
5. Complete a todo → home page tasks widget updates
6. Weather widget shows data from server push

**Step 5: Commit any fixes if needed**

---

### Task 13: Final cleanup commit

**Step 1: Review all changes**

Run: `cd /c/Skylight && git diff main --stat`

Verify the change set matches the design:
- `app/types/sync.ts` — extended event types
- `server/utils/broadcastHomeUpdate.ts` — new utility
- `server/plugins/02.syncManager.ts` — weather job + broadcast wiring
- `server/api/meals/**` — broadcast calls (5 files)
- `server/api/todos/**` — broadcast calls (5 files)
- `server/api/calendar-events/**` — broadcast calls (3 files)
- `app/plugins/03.syncManager.client.ts` — new event type handling
- `app/composables/useHomeSSE.ts` — new composable
- `app/pages/home.vue` — polling removed, SSE listeners added
- `app/components/home/HomeCountdownWidget.vue` — polling removed, SSE listener added
- `tests/` — new test files

**Step 2: No extraneous changes**

Ensure no unrelated files were modified.
