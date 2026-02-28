import { consola } from "consola";
import { addDays } from "date-fns";

import type { HomeUpdateEventType } from "../../app/types/sync";

// Lazy-initialized references to avoid circular dependency with sync manager
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

async function fetchDataForEventType(eventType: HomeUpdateEventType): Promise<Record<string, unknown> | Record<string, unknown>[] | null> {
  const prisma = await import("../../app/lib/prisma").then(m => m.default);

  switch (eventType) {
    case "meals_update": {
      // calculatedDate is computed from mealPlan.weekStart + meal.dayOfWeek,
      // not a DB column. Replicate the byDateRange query pattern with UTC dates.
      const now = new Date();
      const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
      const tomorrow = new Date(startDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 23, 59, 59, 999));

      // Look back up to 6 days for meal plans whose meals may fall in today/tomorrow
      const lookbackDate = addDays(startDate, -6);

      const mealPlans = await prisma.mealPlan.findMany({
        where: {
          weekStart: {
            gte: lookbackDate,
            lte: endDate,
          },
        },
        include: {
          meals: true,
        },
      });

      const mealsWithDates: Record<string, unknown>[] = [];

      for (const mealPlan of mealPlans) {
        for (const meal of mealPlan.meals) {
          const mealDate = addDays(mealPlan.weekStart, meal.dayOfWeek);

          // Normalize to UTC midnight for comparison (matches byDateRange.get.ts)
          const mealDateUTC = new Date(Date.UTC(
            mealDate.getUTCFullYear(),
            mealDate.getUTCMonth(),
            mealDate.getUTCDate(),
            0,
            0,
            0,
            0,
          ));

          if (mealDateUTC >= startDate && mealDateUTC <= endDate) {
            mealsWithDates.push({
              ...meal,
              calculatedDate: mealDate,
              mealPlanWeekStart: mealPlan.weekStart,
            });
          }
        }
      }

      return mealsWithDates;
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
        orderBy: [
          { priority: "desc" },
          { createdAt: "desc" },
        ],
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
