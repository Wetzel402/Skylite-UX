import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  shiftRotation: {
    findMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
}));

vi.mock("~/lib/prisma", () => ({
  default: mockPrisma,
}));

import { expandShiftsToEvents } from "../../../../../server/integrations/shifts/expandShifts";

type SlotShape = {
  id: string;
  shiftRotationId: string;
  weekIndex: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
  color: string | null;
  order: number;
};

type AssignmentShape = {
  id: string;
  userId: string | null;
  shiftRotationId: string;
  startDate: Date;
  endDate: Date | null;
  user?: {
    id: string;
    name: string;
    avatar: string | null;
    color: string | null;
  } | null;
};

type RotationShape = {
  id: string;
  integrationId: string;
  name: string;
  cycleWeeks: number;
  color: string | null;
  order: number;
  slots: SlotShape[];
  assignments: AssignmentShape[];
};

function createRotation(overrides: Partial<RotationShape> & { integrationId: string }): RotationShape {
  return {
    id: "rot-1",
    integrationId: overrides.integrationId,
    name: "Rotation",
    cycleWeeks: 1,
    color: null,
    order: 0,
    slots: [],
    assignments: [],
    ...overrides,
  };
}

function createSlot(overrides: Partial<SlotShape> & { shiftRotationId: string }): SlotShape {
  return {
    id: "slot-1",
    shiftRotationId: overrides.shiftRotationId,
    weekIndex: 0,
    dayOfWeek: 0,
    startTime: "09:00",
    endTime: "17:00",
    label: null,
    color: null,
    order: 0,
    ...overrides,
  };
}

function createAssignment(
  overrides: Partial<AssignmentShape> & { shiftRotationId: string; startDate: Date },
): AssignmentShape {
  return {
    id: "assign-1",
    userId: null,
    shiftRotationId: overrides.shiftRotationId,
    startDate: overrides.startDate,
    endDate: null,
    ...overrides,
  };
}

describe("expandShiftsToEvents", () => {
  const integrationId = "int-shifts-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no rotations", async () => {
    mockPrisma.shiftRotation.findMany.mockResolvedValue([]);

    const start = new Date("2025-06-01");
    const end = new Date("2025-06-30");
    const result = await expandShiftsToEvents(integrationId, null, start, end);

    expect(result).toEqual([]);
    expect(mockPrisma.shiftRotation.findMany).toHaveBeenCalledWith({
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
  });

  it("returns empty array when rotation has no assignments", async () => {
    const rotation = createRotation({
      integrationId,
      assignments: [],
      slots: [createSlot({ shiftRotationId: "rot-1", weekIndex: 0, dayOfWeek: 0 })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const start = new Date("2025-06-01");
    const end = new Date("2025-06-30");
    const result = await expandShiftsToEvents(integrationId, null, start, end);

    expect(result).toEqual([]);
  });

  it("produces one event per matching day for single slot and 1-week cycle", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      id: "rot-1",
      integrationId,
      name: "Weekend",
      cycleWeeks: 1,
      slots: [
        createSlot({
          id: "slot-1",
          shiftRotationId: "rot-1",
          weekIndex: 0,
          dayOfWeek: 0,
          label: "Sunday",
        }),
      ],
      assignments: [
        createAssignment({
          id: "assign-1",
          shiftRotationId: "rot-1",
          startDate: assignmentStart,
          endDate: null,
        }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const start = new Date("2025-06-01");
    const end = new Date("2025-06-30");
    const result = await expandShiftsToEvents(integrationId, null, start, end);

    const sundaysInJune2025 = [1, 8, 15, 22, 29];
    expect(result).toHaveLength(sundaysInJune2025.length);
    result.forEach((ev, i) => {
      expect(ev.title).toBe("Sunday");
      expect(ev.description).toBe("Weekend");
      expect(ev.allDay).toBe(true);
      expect(ev.integrationId).toBe(integrationId);
      expect(ev.id).toContain("assign-1");
      expect(ev.id).toContain("slot-1");
      const startDate = new Date(ev.start);
      expect(startDate.getUTCDate()).toBe(sundaysInJune2025[i]);
      expect(startDate.getUTCMonth()).toBe(5);
      expect(startDate.getUTCFullYear()).toBe(2025);
      expect(startDate.getUTCHours()).toBe(0);
      expect(startDate.getUTCMinutes()).toBe(0);
      const endDate = new Date(ev.end);
      expect(endDate.getUTCDate()).toBe(sundaysInJune2025[i] + 1);
      expect(ev.color).toBe("#06b6d4");
    });
  });

  it("uses slot label when set, else rotation name", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      id: "rot-1",
      integrationId,
      name: "Rotation Name",
      cycleWeeks: 1,
      slots: [
        createSlot({
          shiftRotationId: "rot-1",
          weekIndex: 0,
          dayOfWeek: 0,
          label: "Custom Slot",
        }),
      ],
      assignments: [
        createAssignment({ shiftRotationId: "rot-1", startDate: assignmentStart }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(
      integrationId,
      null,
      new Date("2025-06-01"),
      new Date("2025-06-07"),
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].title).toBe("Custom Slot");
    expect(result[0].description).toBe("Rotation Name");
  });

  it("produces events only within assignment startDate and endDate window", async () => {
    const assignmentStart = new Date("2025-06-05");
    const assignmentEnd = new Date("2025-06-12");
    const rotation = createRotation({
      integrationId,
      cycleWeeks: 1,
      slots: [
        createSlot({ shiftRotationId: "rot-1", weekIndex: 0, dayOfWeek: 0 }),
      ],
      assignments: [
        createAssignment({
          shiftRotationId: "rot-1",
          startDate: assignmentStart,
          endDate: assignmentEnd,
        }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const start = new Date("2025-06-01");
    const end = new Date("2025-06-30");
    const result = await expandShiftsToEvents(integrationId, null, start, end);

    expect(result).toHaveLength(2);
    expect(new Date(result[0].start).getUTCDate()).toBe(5);
    expect(new Date(result[1].start).getUTCDate()).toBe(12);
  });

  it("two-week cycle: events only on matching week and day", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      integrationId,
      cycleWeeks: 2,
      slots: [
        createSlot({
          shiftRotationId: "rot-1",
          weekIndex: 1,
          dayOfWeek: 0,
        }),
      ],
      assignments: [
        createAssignment({ shiftRotationId: "rot-1", startDate: assignmentStart }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const start = new Date("2025-06-01");
    const end = new Date("2025-06-30");
    const result = await expandShiftsToEvents(integrationId, null, start, end);

    expect(result).toHaveLength(2);
    expect(new Date(result[0].start).getUTCDate()).toBe(8);
    expect(new Date(result[1].start).getUTCDate()).toBe(22);
  });

  it("multiple slots same day produce multiple events per day", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      integrationId,
      cycleWeeks: 1,
      slots: [
        createSlot({
          id: "slot-a",
          shiftRotationId: "rot-1",
          weekIndex: 0,
          dayOfWeek: 0,
          label: "AM",
        }),
        createSlot({
          id: "slot-b",
          shiftRotationId: "rot-1",
          weekIndex: 0,
          dayOfWeek: 0,
          label: "PM",
        }),
      ],
      assignments: [
        createAssignment({ shiftRotationId: "rot-1", startDate: assignmentStart }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const start = new Date("2025-06-01");
    const end = new Date("2025-06-07");
    const result = await expandShiftsToEvents(integrationId, null, start, end);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("AM");
    expect(result[1].title).toBe("PM");
    expect(new Date(result[0].start).getTime()).toBe(new Date(result[1].start).getTime());
  });

  it("multiple assignments produce events for each", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      integrationId,
      cycleWeeks: 1,
      slots: [
        createSlot({ shiftRotationId: "rot-1", weekIndex: 0, dayOfWeek: 0 }),
      ],
      assignments: [
        createAssignment({
          id: "assign-a",
          shiftRotationId: "rot-1",
          startDate: assignmentStart,
        }),
        createAssignment({
          id: "assign-b",
          shiftRotationId: "rot-1",
          startDate: assignmentStart,
        }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const start = new Date("2025-06-01");
    const end = new Date("2025-06-07");
    const result = await expandShiftsToEvents(integrationId, null, start, end);

    expect(result).toHaveLength(2);
    expect(result[0].id).toContain("assign-a");
    expect(result[1].id).toContain("assign-b");
  });

  it("color precedence: user > slot > rotation > settings default", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      integrationId,
      name: "R",
      color: "#0000ff",
      cycleWeeks: 1,
      slots: [
        createSlot({
          shiftRotationId: "rot-1",
          weekIndex: 0,
          dayOfWeek: 0,
          color: "#00ff00",
        }),
      ],
      assignments: [
        createAssignment({
          shiftRotationId: "rot-1",
          startDate: assignmentStart,
          user: {
            id: "u1",
            name: "User",
            avatar: null,
            color: "#ff0000",
          },
        }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(
      integrationId,
      { useUserColors: true, eventColor: "#06b6d4" },
      new Date("2025-06-01"),
      new Date("2025-06-07"),
    );

    expect(result[0].color).toBe("#ff0000");
  });

  it("settings.userIds without useUserColors: events get users from findMany", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      integrationId,
      cycleWeeks: 1,
      slots: [
        createSlot({ shiftRotationId: "rot-1", weekIndex: 0, dayOfWeek: 0 }),
      ],
      assignments: [
        createAssignment({ shiftRotationId: "rot-1", startDate: assignmentStart }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "u1",
        name: "Alice",
        avatar: null,
        color: null,
      },
    ]);

    const result = await expandShiftsToEvents(
      integrationId,
      { user: ["u1"], useUserColors: false },
      new Date("2025-06-01"),
      new Date("2025-06-07"),
    );

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["u1"] } },
      select: { id: true, name: true, avatar: true, color: true },
    });
    expect(result[0].users).toHaveLength(1);
    expect(result[0].users![0].id).toBe("u1");
    expect(result[0].users![0].name).toBe("Alice");
  });

  it("useUserColors true: event gets assignment user and user color", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      integrationId,
      cycleWeeks: 1,
      slots: [
        createSlot({ shiftRotationId: "rot-1", weekIndex: 0, dayOfWeek: 0 }),
      ],
      assignments: [
        createAssignment({
          shiftRotationId: "rot-1",
          startDate: assignmentStart,
          user: {
            id: "u1",
            name: "Bob",
            avatar: null,
            color: "#aabbcc",
          },
        }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(
      integrationId,
      { useUserColors: true },
      new Date("2025-06-01"),
      new Date("2025-06-07"),
    );

    expect(result[0].users).toHaveLength(1);
    expect(result[0].users![0].name).toBe("Bob");
    expect(result[0].color).toBe("#aabbcc");
  });

  it("returns events sorted by start time", async () => {
    const assignmentStart = new Date("2025-06-01");
    const rotation = createRotation({
      integrationId,
      cycleWeeks: 1,
      slots: [
        createSlot({ id: "s1", shiftRotationId: "rot-1", weekIndex: 0, dayOfWeek: 0 }),
        createSlot({ id: "s2", shiftRotationId: "rot-1", weekIndex: 0, dayOfWeek: 1 }),
      ],
      assignments: [
        createAssignment({ shiftRotationId: "rot-1", startDate: assignmentStart }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const start = new Date("2025-06-01");
    const end = new Date("2025-06-14");
    const result = await expandShiftsToEvents(integrationId, null, start, end);

    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1].start).getTime();
      const curr = new Date(result[i].start).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});
