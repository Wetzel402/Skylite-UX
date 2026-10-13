import { CalendarDateTime } from "@internationalized/date";

import type { CalendarEvent } from "~/types/calendar";

import prisma from "~/lib/prisma";

type ShiftsSettings = {
  eventColor?: string;
  user?: string[];
  useUserColors?: boolean;
};

type TimeOfDay = { hour: number; minute: number };

function parseTimeOfDay(value: string): TimeOfDay | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match)
    return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59)
    return null;
  return { hour, minute };
}

export async function expandShiftsToEvents(
  integrationId: string,
  settings: ShiftsSettings | null,
  startDate: Date,
  endDate: Date,
  timeZone = "UTC",
): Promise<CalendarEvent[]> {
  const rotations = await prisma.shiftRotation.findMany({
    where: { integrationId },
    include: {
      slots: { orderBy: { order: "asc" } },
      assignments: {
        include: {
          user: {
            select: { id: true, name: true, avatar: true, color: true },
          },
        },
      },
    },
    orderBy: { order: "asc" },
  });

  const eventColor = settings?.eventColor ?? "#06b6d4";
  const userIds = settings?.user;
  const useUserColors = settings?.useUserColors ?? false;

  const events: CalendarEvent[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;

  const windowStart = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );

  for (const rotation of rotations) {
    const { cycleDays } = rotation;
    if (cycleDays < 1)
      continue;
    for (const assignment of rotation.assignments) {
      const assignmentStartDate = new Date(assignment.startDate);
      const assignmentStart = Date.UTC(
        assignmentStartDate.getUTCFullYear(),
        assignmentStartDate.getUTCMonth(),
        assignmentStartDate.getUTCDate(),
      );
      const assignmentEnd = assignment.endDate
        ? new Date(assignment.endDate).getTime()
        : Number.POSITIVE_INFINITY;

      for (let t = windowStart; t <= endDate.getTime(); t += oneDayMs) {
        const d = new Date(t);
        if (t < assignmentStart || t > assignmentEnd)
          continue;

        const daysSince = Math.floor((t - assignmentStart) / oneDayMs);
        const dayIndex = daysSince % cycleDays;

        const slotsForDay = rotation.slots.filter(s => s.dayIndex === dayIndex);

        for (const slot of slotsForDay) {
          const startTime = parseTimeOfDay(slot.startTime);
          const endTime = parseTimeOfDay(slot.endTime);
          if (!startTime || !endTime)
            continue;
          const isOvernight = endTime.hour * 60 + endTime.minute <= startTime.hour * 60 + startTime.minute;
          const localStart = new CalendarDateTime(
            d.getUTCFullYear(),
            d.getUTCMonth() + 1,
            d.getUTCDate(),
            startTime.hour,
            startTime.minute,
          );
          const localEnd = localStart
            .set({ hour: endTime.hour, minute: endTime.minute })
            .add({ days: isOvernight ? 1 : 0 });
          const start = localStart.toDate(timeZone);
          const end = localEnd.toDate(timeZone);
          const title = slot.label?.trim() || rotation.name;
          const user = assignment.user ?? null;
          const users = useUserColors && user
            ? [{ id: user.id, name: user.name, avatar: user.avatar, color: user.color }]
            : undefined;
          const color = useUserColors && user?.color
            ? user.color
            : (slot.color ?? rotation.color ?? eventColor);

          events.push({
            id: `shift-${assignment.id}-${slot.id}-${d.getTime()}`,
            title,
            description: rotation.name,
            start,
            end,
            allDay: false,
            color: color ?? eventColor,
            integrationId,
            users,
          });
        }
      }
    }
  }

  if (userIds?.length && !useUserColors) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true, color: true },
    });
    for (const ev of events) {
      ev.users = users.map(u => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        color: u.color,
      }));
    }
  }

  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}
