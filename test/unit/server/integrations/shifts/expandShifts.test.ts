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
  dayIndex: number;
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
  cycleDays: number;
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
    cycleDays: 7,
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
    dayIndex: 0,
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

function segmentSlots(rotationId: string, pattern: boolean[]): SlotShape[] {
  return pattern.flatMap((on, dayIndex) =>
    on ? [createSlot({ id: `slot-${dayIndex}`, shiftRotationId: rotationId, dayIndex })] : [],
  );
}

function utcDays(events: { start: Date | string }[]): string[] {
  return events.map(ev => new Date(ev.start).toISOString().slice(0, 10));
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
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0 })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-30"));

    expect(result).toEqual([]);
  });

  it("produces one event per matching day for a single slot and 7-day cycle", async () => {
    const rotation = createRotation({
      id: "rot-1",
      integrationId,
      name: "Weekend",
      cycleDays: 7,
      slots: [createSlot({ id: "slot-1", shiftRotationId: "rot-1", dayIndex: 0, label: "Sunday" })],
      assignments: [
        createAssignment({ id: "assign-1", shiftRotationId: "rot-1", startDate: new Date("2025-06-01") }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-30"));

    expect(utcDays(result)).toEqual(["2025-06-01", "2025-06-08", "2025-06-15", "2025-06-22", "2025-06-29"]);
    result.forEach((ev) => {
      expect(ev.title).toBe("Sunday");
      expect(ev.description).toBe("Weekend");
      expect(ev.integrationId).toBe(integrationId);
      expect(ev.id).toContain("assign-1");
      expect(ev.id).toContain("slot-1");
      expect(ev.color).toBe("#06b6d4");
    });
  });

  it("uses slot label when set, else rotation name", async () => {
    const rotation = createRotation({
      integrationId,
      name: "Rotation Name",
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0, label: "Custom Slot" })],
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-06-01") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-07"));

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.title).toBe("Custom Slot");
    expect(result[0]!.description).toBe("Rotation Name");
  });

  it("produces events only within assignment startDate and endDate window", async () => {
    const rotation = createRotation({
      integrationId,
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0 })],
      assignments: [
        createAssignment({
          shiftRotationId: "rot-1",
          startDate: new Date("2025-06-05"),
          endDate: new Date("2025-06-12"),
        }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-30"));

    expect(utcDays(result)).toEqual(["2025-06-05", "2025-06-12"]);
  });

  it("14-day cycle: events only on the matching day index", async () => {
    const rotation = createRotation({
      integrationId,
      cycleDays: 14,
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 7 })],
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-06-01") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-30"));

    expect(utcDays(result)).toEqual(["2025-06-08", "2025-06-22"]);
  });

  it("8-day cycle (2-2-2 with 2 off) repeats every 8 days without gaps", async () => {
    const rotation = createRotation({
      integrationId,
      cycleDays: 8,
      slots: segmentSlots("rot-1", [true, true, true, true, true, true, false, false]),
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-06-01") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-17"));

    expect(utcDays(result)).toEqual([
      "2025-06-01",
      "2025-06-02",
      "2025-06-03",
      "2025-06-04",
      "2025-06-05",
      "2025-06-06",
      "2025-06-09",
      "2025-06-10",
      "2025-06-11",
      "2025-06-12",
      "2025-06-13",
      "2025-06-14",
      "2025-06-17",
    ]);
  });

  it("16-day cycle (4 days, 4 off, 4 nights, 4 off) maps each day index", async () => {
    const pattern = [
      ...Array.from({ length: 4 }, () => true),
      ...Array.from({ length: 4 }, () => false),
      ...Array.from({ length: 4 }, () => true),
      ...Array.from({ length: 4 }, () => false),
    ];
    const rotation = createRotation({
      integrationId,
      cycleDays: 16,
      slots: segmentSlots("rot-1", pattern),
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-06-01") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-20"));

    expect(utcDays(result)).toEqual([
      "2025-06-01",
      "2025-06-02",
      "2025-06-03",
      "2025-06-04",
      "2025-06-09",
      "2025-06-10",
      "2025-06-11",
      "2025-06-12",
      "2025-06-17",
      "2025-06-18",
      "2025-06-19",
      "2025-06-20",
    ]);
  });

  it("non-weekly cycle stays aligned across a month boundary", async () => {
    const rotation = createRotation({
      integrationId,
      cycleDays: 9,
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0 })],
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-01-25") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-02-01"), new Date("2025-03-10"));

    expect(utcDays(result)).toEqual(["2025-02-03", "2025-02-12", "2025-02-21", "2025-03-02"]);
  });

  it("aligns days when the window start is not at UTC midnight", async () => {
    const rotation = createRotation({
      integrationId,
      cycleDays: 2,
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0 })],
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-06-01") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(
      integrationId,
      null,
      new Date("2025-06-01T15:30:00Z"),
      new Date("2025-06-06T00:00:00Z"),
    );

    expect(utcDays(result)).toEqual(["2025-06-01", "2025-06-03", "2025-06-05"]);
  });

  it("multiple slots same day produce multiple events per day", async () => {
    const rotation = createRotation({
      integrationId,
      slots: [
        createSlot({ id: "slot-a", shiftRotationId: "rot-1", dayIndex: 0, label: "AM" }),
        createSlot({ id: "slot-b", shiftRotationId: "rot-1", dayIndex: 0, label: "PM" }),
      ],
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-06-01") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-07"));

    expect(result).toHaveLength(2);
    expect(result.map(ev => ev.title).sort()).toEqual(["AM", "PM"]);
  });

  it("multiple assignments produce events for each", async () => {
    const rotation = createRotation({
      integrationId,
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0 })],
      assignments: [
        createAssignment({ id: "assign-a", shiftRotationId: "rot-1", startDate: new Date("2025-06-01") }),
        createAssignment({ id: "assign-b", shiftRotationId: "rot-1", startDate: new Date("2025-06-01") }),
      ],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-07"));

    expect(result).toHaveLength(2);
    expect(result.map(ev => ev.id).join(",")).toContain("assign-a");
    expect(result.map(ev => ev.id).join(",")).toContain("assign-b");
  });

  it("color precedence: user > slot > rotation > settings default", async () => {
    const rotation = createRotation({
      integrationId,
      name: "R",
      color: "#0000ff",
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0, color: "#00ff00" })],
      assignments: [
        createAssignment({
          shiftRotationId: "rot-1",
          startDate: new Date("2025-06-01"),
          user: { id: "u1", name: "User", avatar: null, color: "#ff0000" },
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

    expect(result[0]!.color).toBe("#ff0000");
  });

  it("settings.userIds without useUserColors: events get users from findMany", async () => {
    const rotation = createRotation({
      integrationId,
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0 })],
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-06-01") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", name: "Alice", avatar: null, color: null },
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
    expect(result[0]!.users).toHaveLength(1);
    expect(result[0]!.users![0]!.id).toBe("u1");
    expect(result[0]!.users![0]!.name).toBe("Alice");
  });

  it("useUserColors true: event gets assignment user and user color", async () => {
    const rotation = createRotation({
      integrationId,
      slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0 })],
      assignments: [
        createAssignment({
          shiftRotationId: "rot-1",
          startDate: new Date("2025-06-01"),
          user: { id: "u1", name: "Bob", avatar: null, color: "#aabbcc" },
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

    expect(result[0]!.users).toHaveLength(1);
    expect(result[0]!.users![0]!.name).toBe("Bob");
    expect(result[0]!.color).toBe("#aabbcc");
  });

  describe("timed events", () => {
    function timedRotation(slot: Partial<SlotShape>, startDate: string) {
      return createRotation({
        integrationId,
        cycleDays: 1,
        slots: [createSlot({ shiftRotationId: "rot-1", dayIndex: 0, ...slot })],
        assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date(startDate) })],
      });
    }

    it("uses slot times in UTC when no time zone is given", async () => {
      mockPrisma.shiftRotation.findMany.mockResolvedValue([
        timedRotation({ startTime: "09:00", endTime: "17:00" }, "2025-06-01"),
      ]);

      const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-01"));

      expect(result).toHaveLength(1);
      expect(result[0]!.allDay).toBe(false);
      expect(new Date(result[0]!.start).toISOString()).toBe("2025-06-01T09:00:00.000Z");
      expect(new Date(result[0]!.end).toISOString()).toBe("2025-06-01T17:00:00.000Z");
    });

    it("converts slot wall-clock times from America/Chicago to UTC", async () => {
      mockPrisma.shiftRotation.findMany.mockResolvedValue([
        timedRotation({ startTime: "09:00", endTime: "17:00" }, "2025-06-01"),
      ]);

      const result = await expandShiftsToEvents(
        integrationId,
        null,
        new Date("2025-06-01"),
        new Date("2025-06-01"),
        "America/Chicago",
      );

      expect(new Date(result[0]!.start).toISOString()).toBe("2025-06-01T14:00:00.000Z");
      expect(new Date(result[0]!.end).toISOString()).toBe("2025-06-01T22:00:00.000Z");
    });

    it("overnight shift ends on the next calendar day", async () => {
      mockPrisma.shiftRotation.findMany.mockResolvedValue([
        timedRotation({ startTime: "19:00", endTime: "07:00" }, "2025-06-01"),
      ]);

      const result = await expandShiftsToEvents(
        integrationId,
        null,
        new Date("2025-06-01"),
        new Date("2025-06-01"),
        "America/Chicago",
      );

      expect(new Date(result[0]!.start).toISOString()).toBe("2025-06-02T00:00:00.000Z");
      expect(new Date(result[0]!.end).toISOString()).toBe("2025-06-02T12:00:00.000Z");
    });

    it("keeps local wall-clock times across a DST change", async () => {
      mockPrisma.shiftRotation.findMany.mockResolvedValue([
        timedRotation({ startTime: "09:00", endTime: "17:00" }, "2025-03-08"),
      ]);

      const result = await expandShiftsToEvents(
        integrationId,
        null,
        new Date("2025-03-08"),
        new Date("2025-03-09"),
        "America/Chicago",
      );

      expect(result.map(ev => new Date(ev.start).toISOString())).toEqual([
        "2025-03-08T15:00:00.000Z",
        "2025-03-09T14:00:00.000Z",
      ]);
    });

    it("overnight shift spanning the DST change is an hour shorter", async () => {
      mockPrisma.shiftRotation.findMany.mockResolvedValue([
        timedRotation({ startTime: "19:00", endTime: "07:00" }, "2025-03-08"),
      ]);

      const result = await expandShiftsToEvents(
        integrationId,
        null,
        new Date("2025-03-08"),
        new Date("2025-03-08"),
        "America/Chicago",
      );

      expect(new Date(result[0]!.start).toISOString()).toBe("2025-03-09T01:00:00.000Z");
      expect(new Date(result[0]!.end).toISOString()).toBe("2025-03-09T12:00:00.000Z");
    });

    it("skips slots with invalid times", async () => {
      mockPrisma.shiftRotation.findMany.mockResolvedValue([
        timedRotation({ startTime: "25:00", endTime: "07:00" }, "2025-06-01"),
      ]);

      const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-03"));

      expect(result).toEqual([]);
    });

    it("assignment start with a time component still includes its first day", async () => {
      mockPrisma.shiftRotation.findMany.mockResolvedValue([
        timedRotation({ startTime: "09:00", endTime: "17:00" }, "2025-06-01T05:00:00Z"),
      ]);

      const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-02"));

      expect(utcDays(result)).toEqual(["2025-06-01", "2025-06-02"]);
    });
  });

  it("returns events sorted by start time", async () => {
    const rotation = createRotation({
      integrationId,
      slots: [
        createSlot({ id: "s1", shiftRotationId: "rot-1", dayIndex: 0 }),
        createSlot({ id: "s2", shiftRotationId: "rot-1", dayIndex: 1 }),
      ],
      assignments: [createAssignment({ shiftRotationId: "rot-1", startDate: new Date("2025-06-01") })],
    });
    mockPrisma.shiftRotation.findMany.mockResolvedValue([rotation]);

    const result = await expandShiftsToEvents(integrationId, null, new Date("2025-06-01"), new Date("2025-06-14"));

    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1]!.start).getTime();
      const curr = new Date(result[i]!.start).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});
