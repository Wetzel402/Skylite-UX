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

import handler from "~~/server/api/integrations/[id]/shifts/rotations/[rotationId].delete";

describe("DELETE /api/integrations/[id]/shifts/rotations/[rotationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the rotation scoped to the integration", async () => {
    prisma.shiftRotation.deleteMany.mockResolvedValue({ count: 1 });

    const event = createMockH3Event({ method: "DELETE", params: { id: "int-1", rotationId: "rot-1" } });
    const response = await handler(event);

    expect(prisma.shiftRotation.deleteMany).toHaveBeenCalledWith({
      where: { id: "rot-1", integrationId: "int-1" },
    });
    expect(response).toEqual({ ok: true });
  });

  it("returns 404 when rotation is not found", async () => {
    prisma.shiftRotation.deleteMany.mockResolvedValue({ count: 0 });

    const event = createMockH3Event({ method: "DELETE", params: { id: "int-1", rotationId: "missing" } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 400 when params are missing", async () => {
    const event = createMockH3Event({ method: "DELETE", params: { id: "int-1" } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
});
