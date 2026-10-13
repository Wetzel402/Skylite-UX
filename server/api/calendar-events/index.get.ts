import type { CalendarEvent } from "~/types/calendar";

import prisma from "~/lib/prisma";

import type { ICalEvent } from "../../integrations/iCal/types";

import { expandRecurringEvents } from "../../utils/rrule";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const now = new Date();
    const startDate = query.start ? new Date(query.start as string) : new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const endDate = query.end ? new Date(query.end as string) : new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());

    const events = await prisma.calendarEvent.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        start: true,
        end: true,
        allDay: true,
        color: true,
        location: true,
        ical_event: true,
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: {
        start: "asc",
      },
    });

    const mappedEvents: CalendarEvent[] = events.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description || undefined,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      color: event.color as string | string[] | undefined,
      location: event.location || undefined,
      ical_event: event.ical_event as ICalEvent | undefined,
      users: event.users.map(ce => ce.user),
    }));

    const expandedEvents = expandRecurringEvents(
      mappedEvents,
      startDate,
      endDate,
      useRuntimeConfig().public.tz,
    );

    return expandedEvents.sort((a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to fetch calendar events: ${error}`,
    });
  }
});
