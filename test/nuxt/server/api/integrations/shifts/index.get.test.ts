import type { H3Event } from "h3";

import { createMockH3Event } from "~~/test/nuxt/mocks/h3Event";
import { useH3TestUtils } from "~~/test/nuxt/setup";
import { beforeEach, describe, expect, it, vi } from "vitest";

import prisma from "~/lib/__mocks__/prisma";

const { defineEventHandler } = useH3TestUtils();

const mockExpandShiftsToEvents = vi.hoisted(() => vi.fn());

vi.mock("@prisma/client", async () => {
  const actual = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    ...actual,
    PrismaClient: vi.fn(() => prisma),
  };
});

vi.mock("h3", async () => {
  const actual = await vi.importActual("h3");
  return {
    ...actual,
    getQuery: vi.fn((event: H3Event) => {
      if (event?.context?.query) {
        return event.context.query;
      }
      return {};
    }),
  };
});

vi.mock("~~/server/integrations/shifts/expandShifts", () => ({
  expandShiftsToEvents: mockExpandShiftsToEvents,
}));

vi.mock("consola", () => ({
  consola: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("~/lib/prisma");

import handler from "~~/server/api/integrations/shifts/index.get";

describe("GET /api/integrations/shifts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createShiftsIntegration = () => ({
    id: "int-shifts-1",
    name: "Shifts",
    type: "calendar" as const,
    service: "shifts" as const,
    enabled: true,
    apiKey: null,
    baseUrl: null,
    icon: null,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe("success", () => {
    it("returns events when integration is found and enabled", async () => {
      const mockIntegration = createShiftsIntegration();
      const mockEvents = [
        {
          id: "shift-1",
          title: "Shift A",
          description: "Rotation",
          start: new Date("2025-06-01T00:00:00.000Z"),
          end: new Date("2025-06-02T00:00:00.000Z"),
          allDay: true,
          color: "#06b6d4",
          integrationId: "int-shifts-1",
        },
      ];

      prisma.integration.findFirst.mockResolvedValue(mockIntegration as Awaited<ReturnType<typeof prisma.integration.findFirst>>);
      mockExpandShiftsToEvents.mockResolvedValue(mockEvents);

      const event = createMockH3Event({
        method: "GET",
        query: { integrationId: "int-shifts-1" },
      });

      const response = await handler(event);

      expect(prisma.integration.findFirst).toHaveBeenCalledWith({
        where: {
          id: "int-shifts-1",
          type: "calendar",
          service: "shifts",
          enabled: true,
        },
      });
      expect(mockExpandShiftsToEvents).toHaveBeenCalled();
      expect(response).toEqual({ events: mockEvents });
    });
  });

  describe("error handling", () => {
    it("throws 400 when integrationId is missing", async () => {
      const event = createMockH3Event({
        method: "GET",
        query: {},
      });

      await expect(handler(event)).rejects.toThrow();
      expect(prisma.integration.findFirst).not.toHaveBeenCalled();
    });

    it("throws 400 when integrationId is not a string", async () => {
      const event = createMockH3Event({
        method: "GET",
        query: { integrationId: 123 },
      });

      await expect(handler(event)).rejects.toThrow();
    });

    it("throws 404 when integration not found", async () => {
      prisma.integration.findFirst.mockResolvedValue(null);

      const event = createMockH3Event({
        method: "GET",
        query: { integrationId: "nonexistent" },
      });

      await expect(handler(event)).rejects.toThrow();
    });

    it("throws 500 when expandShiftsToEvents fails", async () => {
      const mockIntegration = createShiftsIntegration();

      prisma.integration.findFirst.mockResolvedValue(mockIntegration as Awaited<ReturnType<typeof prisma.integration.findFirst>>);
      mockExpandShiftsToEvents.mockRejectedValue(new Error("DB error"));

      const event = createMockH3Event({
        method: "GET",
        query: { integrationId: "int-shifts-1" },
      });

      await expect(handler(event)).rejects.toThrow();
    });
  });
});
