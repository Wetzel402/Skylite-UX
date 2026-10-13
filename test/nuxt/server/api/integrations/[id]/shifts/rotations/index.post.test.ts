import { createMockH3Event } from "~~/test/nuxt/mocks/h3Event";
import { useH3TestUtils } from "~~/test/nuxt/setup";
import { beforeEach, describe, expect, it, vi } from "vitest";

import prisma from "~/lib/__mocks__/prisma";

useH3TestUtils();

vi.mock("@prisma/client", async () => {
  const actual = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    ...actual,
    PrismaClient: vi.fn(() => prisma),
  };
});

vi.mock("~/lib/prisma");
vi.mock("~~/server/utils/shiftsIntegration", async () => ({
  ...await vi.importActual<typeof import("~~/server/utils/shiftsIntegration")>("~~/server/utils/shiftsIntegration"),
  ensureShiftsIntegration: vi.fn().mockResolvedValue(undefined),
}));

import handler from "~~/server/api/integrations/[id]/shifts/rotations/index.post";

describe("POST /api/integrations/[id]/shifts/rotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a rotation with cycleDays", async () => {
    const created = {
      id: "rot-1",
      integrationId: "int-1",
      name: "2-2-2",
      cycleDays: 8,
      color: "#D4A017",
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.shiftRotation.create.mockResolvedValue(created);

    const event = createMockH3Event({
      method: "POST",
      params: { id: "int-1" },
      body: { name: " 2-2-2 ", cycleDays: 8, color: "#D4A017" },
    });

    const response = await handler(event);

    expect(prisma.shiftRotation.create).toHaveBeenCalledWith({
      data: {
        integrationId: "int-1",
        name: "2-2-2",
        cycleDays: 8,
        color: "#D4A017",
        order: 0,
      },
      include: { slots: { orderBy: { order: "asc" } }, assignments: true },
    });
    expect(response).toEqual(created);
  });

  it("creates slots and assignment in one nested create", async () => {
    prisma.shiftRotation.create.mockResolvedValue({ id: "rot-1" } as never);

    const event = createMockH3Event({
      method: "POST",
      params: { id: "int-1" },
      body: {
        name: "On/Off",
        cycleDays: 2,
        slots: [{ dayIndex: 0, startTime: "07:00", endTime: "19:00", label: " Day (7-7) ", color: "#A8A8A8", order: 0 }],
        assignment: { userId: "u-1", startDate: "2026-11-01T00:00:00.000Z", endDate: null },
      },
    });

    await handler(event);

    expect(prisma.shiftRotation.create).toHaveBeenCalledTimes(1);
    expect(prisma.shiftRotation.create).toHaveBeenCalledWith({
      data: {
        integrationId: "int-1",
        name: "On/Off",
        cycleDays: 2,
        color: null,
        order: 0,
        slots: {
          create: [{ dayIndex: 0, startTime: "07:00", endTime: "19:00", label: "Day (7-7)", color: "#A8A8A8", order: 0 }],
        },
        assignments: {
          create: [{ userId: "u-1", startDate: new Date("2026-11-01T00:00:00.000Z"), endDate: null }],
        },
      },
      include: { slots: { orderBy: { order: "asc" } }, assignments: true },
    });
  });

  it.each([
    { name: "invalid slot time", slots: [{ dayIndex: 0, startTime: "25:00", endTime: "07:00" }], assignment: undefined },
    { name: "slot dayIndex at cycleDays", slots: [{ dayIndex: 2, startTime: "07:00", endTime: "19:00" }], assignment: undefined },
    { name: "assignment end before start", slots: undefined, assignment: { startDate: "2026-11-05", endDate: "2026-11-01" } },
    { name: "invalid assignment date", slots: undefined, assignment: { startDate: "not-a-date" } },
  ])("returns 400 for $name without writing", async ({ slots, assignment }) => {
    const event = createMockH3Event({
      method: "POST",
      params: { id: "int-1" },
      body: { name: "R", cycleDays: 2, slots, assignment },
    });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.shiftRotation.create).not.toHaveBeenCalled();
  });

  it.each([
    { name: "missing name", body: { cycleDays: 7 } },
    { name: "missing cycleDays", body: { name: "R" } },
    { name: "zero cycleDays", body: { name: "R", cycleDays: 0 } },
    { name: "fractional cycleDays", body: { name: "R", cycleDays: 1.5 } },
    { name: "string cycleDays", body: { name: "R", cycleDays: "7" } },
  ])("returns 400 for $name", async ({ body }) => {
    const event = createMockH3Event({
      method: "POST",
      params: { id: "int-1" },
      body,
    });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.shiftRotation.create).not.toHaveBeenCalled();
  });

  it("returns 400 when integration id is missing", async () => {
    const event = createMockH3Event({ method: "POST", params: {}, body: { name: "R", cycleDays: 7 } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
});
