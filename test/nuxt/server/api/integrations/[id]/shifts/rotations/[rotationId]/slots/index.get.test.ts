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
vi.mock("~~/server/utils/shiftsIntegration", () => ({
  ensureShiftsIntegration: vi.fn().mockResolvedValue(undefined),
}));

import handler from "~~/server/api/integrations/[id]/shifts/rotations/[rotationId]/slots/index.get";

describe("GET /api/integrations/[id]/shifts/rotations/[rotationId]/slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns slots ordered by order", async () => {
    const slots = [{ id: "slot-1", dayIndex: 0 }, { id: "slot-2", dayIndex: 1 }];
    prisma.shiftRotation.findFirst.mockResolvedValue({ id: "rot-1", cycleDays: 8 } as never);
    prisma.shiftSlot.findMany.mockResolvedValue(slots as never);

    const event = createMockH3Event({ params: { id: "int-1", rotationId: "rot-1" } });
    const response = await handler(event);

    expect(prisma.shiftSlot.findMany).toHaveBeenCalledWith({
      where: { shiftRotationId: "rot-1" },
      orderBy: { order: "asc" },
    });
    expect(response).toEqual(slots);
  });

  it("returns 404 when rotation is not found", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue(null);

    const event = createMockH3Event({ params: { id: "int-1", rotationId: "missing" } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.shiftSlot.findMany).not.toHaveBeenCalled();
  });
});
