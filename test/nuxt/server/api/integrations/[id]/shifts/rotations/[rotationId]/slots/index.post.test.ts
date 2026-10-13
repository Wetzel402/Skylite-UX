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

import handler from "~~/server/api/integrations/[id]/shifts/rotations/[rotationId]/slots/index.post";

describe("POST /api/integrations/[id]/shifts/rotations/[rotationId]/slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.shiftRotation.findFirst.mockResolvedValue({ id: "rot-1", integrationId: "int-1", cycleDays: 8 } as never);
  });

  const params = { id: "int-1", rotationId: "rot-1" };

  it("creates a slot on a valid dayIndex", async () => {
    const created = { id: "slot-1", dayIndex: 7 };
    prisma.shiftSlot.create.mockResolvedValue(created as never);

    const event = createMockH3Event({
      method: "POST",
      params,
      body: { dayIndex: 7, startTime: "19:00", endTime: "07:00", label: " Night ", color: "#123456", order: 3 },
    });
    const response = await handler(event);

    expect(prisma.shiftSlot.create).toHaveBeenCalledWith({
      data: {
        shiftRotationId: "rot-1",
        dayIndex: 7,
        startTime: "19:00",
        endTime: "07:00",
        label: "Night",
        color: "#123456",
        order: 3,
      },
    });
    expect(response).toEqual(created);
  });

  it.each([
    { name: "negative dayIndex", body: { dayIndex: -1, startTime: "07:00", endTime: "19:00" } },
    { name: "dayIndex equal to cycleDays", body: { dayIndex: 8, startTime: "07:00", endTime: "19:00" } },
    { name: "fractional dayIndex", body: { dayIndex: 1.5, startTime: "07:00", endTime: "19:00" } },
    { name: "missing dayIndex", body: { startTime: "07:00", endTime: "19:00" } },
    { name: "missing times", body: { dayIndex: 0 } },
  ])("returns 400 for $name", async ({ body }) => {
    const event = createMockH3Event({ method: "POST", params, body });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.shiftSlot.create).not.toHaveBeenCalled();
  });

  it("returns 404 when rotation is not found", async () => {
    prisma.shiftRotation.findFirst.mockResolvedValue(null);

    const event = createMockH3Event({
      method: "POST",
      params,
      body: { dayIndex: 0, startTime: "07:00", endTime: "19:00" },
    });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
  });
});
