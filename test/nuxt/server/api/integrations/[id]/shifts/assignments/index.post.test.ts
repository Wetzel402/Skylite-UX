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

import handler from "~~/server/api/integrations/[id]/shifts/assignments/index.post";

describe("POST /api/integrations/[id]/shifts/assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const params = { id: "int-1" };

  it("creates an assignment for a rotation in the integration", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue({ id: "rot-1", integrationId: "int-1" } as never);
    prisma.shiftAssignment.create.mockResolvedValue({ id: "a-1" } as never);

    const event = createMockH3Event({
      method: "POST",
      params,
      body: {
        userId: "user-1",
        shiftRotationId: "rot-1",
        startDate: "2025-06-01T00:00:00.000Z",
        endDate: null,
      },
    });
    const response = await handler(event);

    expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        shiftRotationId: "rot-1",
        startDate: new Date("2025-06-01T00:00:00.000Z"),
        endDate: null,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, color: true } },
        shiftRotation: { select: { id: true, name: true, cycleDays: true } },
      },
    });
    expect(response).toEqual({ id: "a-1" });
  });

  it("stores no user when userId is null", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue({ id: "rot-1" } as never);
    prisma.shiftAssignment.create.mockResolvedValue({ id: "a-1" } as never);

    const event = createMockH3Event({
      method: "POST",
      params,
      body: { userId: null, shiftRotationId: "rot-1", startDate: "2025-06-01T00:00:00.000Z" },
    });
    await handler(event);

    expect(prisma.shiftAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: undefined }),
      }),
    );
  });

  it.each([
    { name: "missing shiftRotationId", body: { startDate: "2025-06-01" } },
    { name: "missing startDate", body: { shiftRotationId: "rot-1" } },
  ])("returns 400 for $name", async ({ body }) => {
    const event = createMockH3Event({ method: "POST", params, body });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
  });

  it("returns 404 when rotation belongs to another integration", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue(null);

    const event = createMockH3Event({
      method: "POST",
      params,
      body: { shiftRotationId: "rot-other", startDate: "2025-06-01" },
    });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.shiftRotation.findFirst).toHaveBeenCalledWith({
      where: { id: "rot-other", integrationId: "int-1" },
    });
  });
});
