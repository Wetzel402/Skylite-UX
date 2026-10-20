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

import handler from "~~/server/api/integrations/[id]/shifts/rotations/[rotationId]/slots/[slotId].put";

describe("PUT /api/integrations/[id]/shifts/rotations/[rotationId]/slots/[slotId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.shiftRotation.findFirst.mockResolvedValue({ id: "rot-1", integrationId: "int-1", cycleDays: 8 } as never);
  });

  const params = { id: "int-1", rotationId: "rot-1", slotId: "slot-1" };

  it("updates color only", async () => {
    prisma.shiftSlot.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftSlot.findUniqueOrThrow.mockResolvedValue({ id: "slot-1", color: "#abcdef" } as never);

    const event = createMockH3Event({ method: "PUT", params, body: { color: "#abcdef" } });
    const response = await handler(event);

    expect(prisma.shiftSlot.updateMany).toHaveBeenCalledWith({
      where: { id: "slot-1", shiftRotationId: "rot-1" },
      data: { color: "#abcdef" },
    });
    expect(response).toEqual({ id: "slot-1", color: "#abcdef" });
  });

  it("updates dayIndex within the cycle", async () => {
    prisma.shiftSlot.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftSlot.findUniqueOrThrow.mockResolvedValue({ id: "slot-1" } as never);

    const event = createMockH3Event({ method: "PUT", params, body: { dayIndex: 7 } });
    await handler(event);

    expect(prisma.shiftSlot.updateMany).toHaveBeenCalledWith({
      where: { id: "slot-1", shiftRotationId: "rot-1" },
      data: { dayIndex: 7 },
    });
  });

  it.each([-1, 8, 2.5])("returns 400 for out-of-range dayIndex %s", async (dayIndex) => {
    const event = createMockH3Event({ method: "PUT", params, body: { dayIndex } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.shiftSlot.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when slot is not found", async () => {
    prisma.shiftSlot.updateMany.mockResolvedValue({ count: 0 });

    const event = createMockH3Event({ method: "PUT", params, body: { color: null } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 404 when rotation is not found", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue(null);

    const event = createMockH3Event({ method: "PUT", params, body: { color: null } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
  });
});
