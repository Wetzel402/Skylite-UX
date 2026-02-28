# Home Page: Polling to SSE Listeners

**Date:** 2026-02-27
**Status:** Approved

## Problem

The home page runs 5 independent `setInterval` polls (weather, events, tasks, meals, countdown) on configurable intervals (default 6 hours). The project already has SSE infrastructure (`/api/sync/events`, sync manager plugin, client plugin) but the home page doesn't use it. This means redundant client-side timers, no real-time updates when data changes, and every connected client independently hitting the same APIs.

## Decision

Extend the existing SSE sync manager (Approach A) rather than creating a separate SSE endpoint or adding a pub/sub event bus. This reuses all existing infrastructure — connection management, reconnection with exponential backoff, heartbeat, and client tracking.

## Architecture

### Data Flow

```text
HOME PAGE (home.vue)
  onMounted:
    1. Fetch all widget data (one-time)
    2. Subscribe to SSE event types

  SSE Listeners:
    weather_update    -> update weather ref
    events_update     -> update events ref
    todos_update      -> update tasks ref
    meals_update      -> update meals ref
    countdowns_update -> update countdown ref

  Client-side timers (unchanged):
    Clock: 1s interval
    Photos: slideshow rotation

SYNC MANAGER (02.syncManager.ts)
  Existing:
    integration_sync -> calendar/shopping/todo

  New scheduled jobs:
    Weather poll (6hr) -> weather_update

  New mutation listeners:
    Meal CRUD         -> meals_update
    Todo CRUD         -> todos_update
    Countdown CRUD    -> countdowns_update
    Calendar event CRUD -> events_update
```

### What Changes

- **Remove:** 5 polling `setInterval`s from home.vue (weather, events, tasks, meals, countdown)
- **Add:** SSE event handlers that update the same reactive refs
- **Add:** `broadcastHomeUpdate(eventType)` server utility called after CRUD operations
- **Add:** Weather scheduled job in sync manager
- **Add:** `useHomeSSE()` composable for event subscription

### What Stays the Same

- Clock 1s `setInterval`
- Photo slideshow rotation
- SSE connection/reconnection/heartbeat logic
- Initial data fetch on mount
- All existing API endpoints and response shapes

## Server-Side Changes

### New SSE Event Types

| Event Type | Trigger | Payload |
|---|---|---|
| `weather_update` | Server scheduled job (configurable, default 6hr) | Full weather response (current + 7-day forecast) |
| `meals_update` | Meal CRUD via `/api/meals/*` or `/api/meal-plans/*` | Today + tomorrow meals |
| `todos_update` | Todo CRUD via `/api/todos/*` | Today's todos |
| `events_update` | Calendar event CRUD or integration sync | Upcoming events list |
| `countdowns_update` | Countdown/todo countdown change | Active countdowns list |

### broadcastHomeUpdate Utility

API route handlers call `broadcastHomeUpdate(eventType)` after successful mutations. This utility:
1. Fetches fresh data for that widget (same query the home page would make)
2. Broadcasts to all connected SSE clients via the existing `broadcastToClients()` method

### Weather Scheduled Job

The sync manager gets a new interval that polls Open-Meteo on the configured schedule and broadcasts `weather_update`. Replaces every client independently polling `/api/weather`.

## Client-Side Changes

### home.vue

- Keep initial fetches on mount for instant display
- Remove 5 data-polling `setInterval`s
- Add SSE event listeners via `useHomeSSE()` that update existing refs
- `intervals` ref shrinks from ~6 entries to 2 (clock + photos)

### useHomeSse Composable

Watches shared `home-sse-updates` state (populated by the sync manager client plugin):
1. Dispatches callbacks for 5 event types with deduplication via timestamps
2. Accepts callback functions for home.vue to wire events to refs
3. Cleans up watchers on `onUnmounted`

### HomeCountdownWidget.vue

Remove its own polling interval. Use `useHomeSSE()` to listen for `countdowns_update` events and trigger a refetch.

### Data Shape Contract

SSE payloads for meals include computed `calculatedDate` fields (derived from `mealPlan.weekStart + meal.dayOfWeek`). Todos and events SSE updates act as signals — the handlers refetch via existing API calls to preserve data from external integrations (Google Tasks, Google Calendar).

## Error Handling

- **SSE disconnection:** Existing exponential backoff reconnection handles this. On reconnect, home page re-fetches all data once to cover missed events.
- **Failed broadcasts:** Logged and skipped. Clients keep last received data. Mutations still succeed regardless of broadcast outcome.
- **Weather API down:** Server logs error, skips broadcast. Clients show stale weather.
- **Capacitor/offline:** Existing offline sync continues as-is. SSE only active when online.

## Testing

### Unit Tests
- `broadcastHomeUpdate()` — verifies correct data shape and event type
- Weather scheduled job — verifies poll schedule and broadcast
- API mutation routes — verify they call `broadcastHomeUpdate()` after CRUD

### Integration Tests
- Meal/todo/event/countdown CRUD triggers correct SSE event with correct payload
- Reconnection triggers fresh data fetch

### Not Tested (unchanged)
- SSE connection/reconnection/heartbeat (existing)
- Initial data fetch on mount (existing)
- Clock and photo slideshow (unchanged)
