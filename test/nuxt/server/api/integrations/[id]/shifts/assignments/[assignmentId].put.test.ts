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

import handler from "~~/server/api/integrations/[id]/shifts/assignments/[assignmentId].put";

describe("PUT /api/integrations/[id]/shifts/assignments/[assignmentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const params = { id: "int-1", assignmentId: "a-1" };

  it("updates start and end dates", async () => {
    prisma.shiftAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftAssignment.findUniqueOrThrow.mockResolvedValue({ id: "a-1" } as never);

    const event = createMockH3Event({
      method: "PUT",
      params,
      body: { startDate: "2025-06-01T00:00:00.000Z", endDate: "2025-12-31T00:00:00.000Z" },
    });
    const response = await handler(event);

    expect(prisma.shiftAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: "a-1", shiftRotation: { integrationId: "int-1" } },
      data: {
        startDate: new Date("2025-06-01T00:00:00.000Z"),
        endDate: new Date("2025-12-31T00:00:00.000Z"),
      },
    });
    expect(prisma.shiftAssignment.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "a-1" },
      include: {
        user: { select: { id: true, name: true, avatar: true, color: true } },
        shiftRotation: { select: { id: true, name: true, cycleDays: true } },
      },
    });
    expect(response).toEqual({ id: "a-1" });
  });

  it("clears the end date when null", async () => {
    prisma.shiftAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftAssignment.findUniqueOrThrow.mockResolvedValue({ id: "a-1" } as never);

    const event = createMockH3Event({ method: "PUT", params, body: { endDate: null } });
    await handler(event);

    expect(prisma.shiftAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: "a-1", shiftRotation: { integrationId: "int-1" } },
      data: { endDate: null },
    });
  });

  it("returns 404 when assignment is not found", async () => {
    prisma.shiftAssignment.updateMany.mockResolvedValue({ count: 0 });

    const event = createMockH3Event({ method: "PUT", params, body: { endDate: null } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 400 when params are missing", async () => {
    const event = createMockH3Event({ method: "PUT", params: { id: "int-1" }, body: {} });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
});
