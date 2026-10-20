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

import handler from "~~/server/api/integrations/[id]/shifts/rotations/[rotationId].put";

describe("PUT /api/integrations/[id]/shifts/rotations/[rotationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: unknown) =>
      (fn as (tx: typeof prisma) => Promise<unknown>)(prisma) as never,
    );
  });

  const params = { id: "int-1", rotationId: "rot-1" };

  it("updates name and color", async () => {
    const updated = { id: "rot-1", name: "Renamed", cycleDays: 8, color: "#fff" };
    prisma.shiftRotation.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftRotation.findUniqueOrThrow.mockResolvedValue(updated as never);

    const event = createMockH3Event({ method: "PUT", params, body: { name: " Renamed ", color: "#fff" } });
    const response = await handler(event);

    expect(prisma.shiftRotation.updateMany).toHaveBeenCalledWith({
      where: { id: "rot-1", integrationId: "int-1" },
      data: { name: "Renamed", color: "#fff" },
    });
    expect(prisma.shiftRotation.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "rot-1" },
      include: { slots: { orderBy: { order: "asc" } }, assignments: true },
    });
    expect(response).toEqual(updated);
  });

  it("updates cycleDays when no slot falls outside the new cycle", async () => {
    prisma.shiftSlot.findFirst.mockResolvedValue(null);
    prisma.shiftRotation.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftRotation.findUniqueOrThrow.mockResolvedValue({ id: "rot-1" } as never);

    const event = createMockH3Event({ method: "PUT", params, body: { cycleDays: 10 } });
    await handler(event);

    expect(prisma.shiftSlot.findFirst).toHaveBeenCalledWith({
      where: { shiftRotationId: "rot-1", dayIndex: { gte: 10 } },
    });
    expect(prisma.shiftRotation.updateMany).toHaveBeenCalledWith({
      where: { id: "rot-1", integrationId: "int-1" },
      data: { cycleDays: 10 },
    });
  });

  it("returns 400 when cycleDays would cut off existing slots", async () => {
    prisma.shiftSlot.findFirst.mockResolvedValue({ id: "slot-9", dayIndex: 9 } as never);

    const event = createMockH3Event({ method: "PUT", params, body: { cycleDays: 7 } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.shiftRotation.updateMany).not.toHaveBeenCalled();
  });

  it.each([0, -1, 2.5, "8"])("returns 400 for invalid cycleDays %s", async (cycleDays) => {
    const event = createMockH3Event({ method: "PUT", params, body: { cycleDays } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.shiftRotation.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when rotation is not found", async () => {
    prisma.shiftRotation.updateMany.mockResolvedValue({ count: 0 });

    const event = createMockH3Event({ method: "PUT", params, body: { name: "X" } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("applies name, dates and slot colors in one transaction", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue({ id: "rot-1", cycleDays: 8 } as never);
    prisma.shiftRotation.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftSlot.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftRotation.findUniqueOrThrow.mockResolvedValue({ id: "rot-1" } as never);

    const event = createMockH3Event({
      method: "PUT",
      params,
      body: {
        name: "Renamed",
        assignment: { id: "a-1", startDate: "2026-11-01T00:00:00.000Z", endDate: null },
        slots: [{ id: "s-1", color: "#111111" }, { id: "s-2", color: null }],
      },
    });
    await handler(event);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.shiftAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: "a-1", shiftRotationId: "rot-1" },
      data: { startDate: new Date("2026-11-01T00:00:00.000Z"), endDate: null },
    });
    expect(prisma.shiftSlot.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "s-1", shiftRotationId: "rot-1" },
      data: { color: "#111111" },
    });
    expect(prisma.shiftSlot.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "s-2", shiftRotationId: "rot-1" },
      data: { color: null },
    });
  });

  it("returns 404 and rejects the transaction for an unknown slot", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue({ id: "rot-1", cycleDays: 8 } as never);
    prisma.shiftRotation.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftSlot.updateMany.mockResolvedValue({ count: 0 });

    const event = createMockH3Event({
      method: "PUT",
      params,
      body: { name: "Renamed", slots: [{ id: "missing", color: "#111111" }] },
    });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.shiftRotation.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("returns 404 for an assignment from another rotation", async () => {
    prisma.shiftRotation.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftAssignment.updateMany.mockResolvedValue({ count: 0 });

    const event = createMockH3Event({
      method: "PUT",
      params,
      body: { assignment: { id: "other", startDate: "2026-11-01" } },
    });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 400 before any write when endDate is before startDate", async () => {
    const event = createMockH3Event({
      method: "PUT",
      params,
      body: { assignment: { id: "a-1", startDate: "2026-11-05", endDate: "2026-11-01" } },
    });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.shiftRotation.updateMany).not.toHaveBeenCalled();
  });
});
