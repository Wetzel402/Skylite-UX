import { createMockH3Event } from "~~/test/nuxt/mocks/h3Event";
import { useH3TestUtils } from "~~/test/nuxt/setup";
import { beforeEach, describe, expect, it, vi } from "vitest";

import prisma from "~/lib/__mocks__/prisma";

const { defineEventHandler } = useH3TestUtils();

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

import handler from "~~/server/api/integrations/[id]/shifts/rotations/index.get";

describe("GET /api/integrations/[id]/shifts/rotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("success", () => {
    it("returns rotations for integration", async () => {
      const mockRotations = [
        {
          id: "rot-1",
          integrationId: "int-1",
          name: "Weekend",
          cycleWeeks: 1,
          color: null,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { slots: 2, assignments: 1 },
        },
      ];
      prisma.shiftRotation.findMany.mockResolvedValue(mockRotations as Awaited<ReturnType<typeof prisma.shiftRotation.findMany>>);

      const event = createMockH3Event({
        method: "GET",
        params: { id: "int-1" },
      });

      const response = await handler(event);

      expect(prisma.shiftRotation.findMany).toHaveBeenCalledWith({
        where: { integrationId: "int-1" },
        include: { _count: { select: { slots: true, assignments: true } } },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
      expect(response).toEqual(mockRotations);
    });
  });

  describe("error handling", () => {
    it("throws 400 when id is missing", async () => {
      const event = createMockH3Event({
        method: "GET",
        params: {},
      });

      await expect(handler(event)).rejects.toThrow();
    });

    it("throws when ensureShiftsIntegration fails", async () => {
      const { ensureShiftsIntegration } = await import("~~/server/utils/shiftsIntegration");
      vi.mocked(ensureShiftsIntegration).mockRejectedValueOnce(new Error("Not found"));

      const event = createMockH3Event({
        method: "GET",
        params: { id: "int-1" },
      });

      await expect(handler(event)).rejects.toThrow();
    });
  });
});
