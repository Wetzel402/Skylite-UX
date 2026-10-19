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

import handler from "~~/server/api/integrations/[id]/shifts/assignments/[assignmentId].delete";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function mockTransaction(assignment: { id: string; shiftRotationId: string } | null, remaining: number) {
  const tx = {
    shiftAssignment: {
      findFirst: vi.fn().mockResolvedValue(assignment),
      delete: vi.fn().mockResolvedValue(assignment),
      count: vi.fn().mockResolvedValue(remaining),
    },
    shiftRotation: {
      delete: vi.fn().mockResolvedValue({ id: assignment?.shiftRotationId }),
    },
  };
  prisma.$transaction.mockImplementation(async callback => callback(tx as unknown as TxClient));
  return tx;
}

describe("DELETE /api/integrations/[id]/shifts/assignments/[assignmentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const params = { id: "int-1", assignmentId: "a-1" };

  it("deletes the rotation when its last assignment is removed", async () => {
    const tx = mockTransaction({ id: "a-1", shiftRotationId: "rot-1" }, 0);

    const event = createMockH3Event({ method: "DELETE", params });
    const response = await handler(event);

    expect(tx.shiftAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: "a-1", shiftRotation: { integrationId: "int-1" } },
    });
    expect(tx.shiftAssignment.delete).toHaveBeenCalledWith({ where: { id: "a-1" } });
    expect(tx.shiftAssignment.count).toHaveBeenCalledWith({ where: { shiftRotationId: "rot-1" } });
    expect(tx.shiftRotation.delete).toHaveBeenCalledWith({ where: { id: "rot-1" } });
    expect(response).toEqual({ ok: true });
  });

  it("keeps the rotation when other assignments still use it", async () => {
    const tx = mockTransaction({ id: "a-1", shiftRotationId: "rot-1" }, 1);

    const event = createMockH3Event({ method: "DELETE", params });
    await handler(event);

    expect(tx.shiftAssignment.delete).toHaveBeenCalled();
    expect(tx.shiftRotation.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when assignment is not found", async () => {
    const tx = mockTransaction(null, 0);

    const event = createMockH3Event({ method: "DELETE", params });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.shiftAssignment.delete).not.toHaveBeenCalled();
  });

  it("returns 400 when params are missing", async () => {
    const event = createMockH3Event({ method: "DELETE", params: { id: "int-1" } });

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
