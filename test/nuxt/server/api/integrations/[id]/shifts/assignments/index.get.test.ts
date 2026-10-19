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

import handler from "~~/server/api/integrations/[id]/shifts/assignments/index.get";

describe("GET /api/integrations/[id]/shifts/assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns assignments with user and rotation including cycleDays", async () => {
    const assignments = [{ id: "a-1", shiftRotation: { id: "rot-1", cycleDays: 8 } }];
    prisma.shiftAssignment.findMany.mockResolvedValue(assignments as never);

    const event = createMockH3Event({ params: { id: "int-1" } });
    const response = await handler(event);

    expect(prisma.shiftAssignment.findMany).toHaveBeenCalledWith({
      where: { shiftRotation: { integrationId: "int-1" } },
      include: {
        user: { select: { id: true, name: true, avatar: true, color: true } },
        shiftRotation: { select: { id: true, name: true, cycleDays: true, color: true } },
      },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    expect(response).toEqual(assignments);
  });

  it("returns 400 when integration id is missing", async () => {
    const event = createMockH3Event({ params: {} });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
});
