import type { CalendarEvent } from "~/types/calendar";

import prisma from "~/lib/prisma";

type ShiftsSettings = {
  eventColor?: string;
  user?: string[];
  useUserColors?: boolean;
};

export async function expandShiftsToEvents(
  integrationId: string,
  settings: ShiftsSettings | null,
  startDate: Date,
  endDate: Date,
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

  for (const rotation of rotations) {
    const { cycleWeeks } = rotation;
    for (const assignment of rotation.assignments) {
      const assignmentStart = new Date(assignment.startDate).getTime();
      const assignmentEnd = assignment.endDate
        ? new Date(assignment.endDate).getTime()
        : Number.POSITIVE_INFINITY;

      for (let t = startDate.getTime(); t <= endDate.getTime(); t += oneDayMs) {
        const d = new Date(t);
        if (t < assignmentStart || t > assignmentEnd)
          continue;

        const daysSince = Math.floor((t - assignmentStart) / oneDayMs);
        const cycleDays = cycleWeeks * 7;
        const dayInCycle = ((daysSince % cycleDays) + cycleDays) % cycleDays;
        const weekIndex = Math.floor(dayInCycle / 7);
        const dayOfWeek = dayInCycle % 7;

        const slotsForDay = rotation.slots.filter(
          s => s.weekIndex === weekIndex && s.dayOfWeek === dayOfWeek,
        );

        for (const slot of slotsForDay) {
          const y = d.getUTCFullYear();
          const m = d.getUTCMonth();
          const day = d.getUTCDate();
          const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
          const end = new Date(Date.UTC(y, m, day + 1, 0, 0, 0, 0));
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
            allDay: true,
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
