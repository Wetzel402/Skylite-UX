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

import handler from "~~/server/api/integrations/[id]/shifts/rotations/[rotationId].get";

describe("GET /api/integrations/[id]/shifts/rotations/[rotationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the rotation with ordered slots", async () => {
    const rotation = { id: "rot-1", integrationId: "int-1", name: "R", cycleDays: 8, slots: [] };
    prisma.shiftRotation.findFirst.mockResolvedValue(rotation as never);

    const event = createMockH3Event({ params: { id: "int-1", rotationId: "rot-1" } });
    const response = await handler(event);

    expect(prisma.shiftRotation.findFirst).toHaveBeenCalledWith({
      where: { id: "rot-1", integrationId: "int-1" },
      include: { slots: { orderBy: { order: "asc" } } },
    });
    expect(response).toEqual(rotation);
  });

  it("returns 404 when rotation is not found", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue(null);

    const event = createMockH3Event({ params: { id: "int-1", rotationId: "missing" } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 400 when params are missing", async () => {
    const event = createMockH3Event({ params: { id: "int-1" } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
});
