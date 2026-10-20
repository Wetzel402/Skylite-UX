import { createMockH3Event } from "~~/test/nuxt/mocks/h3Event";
import { useH3TestUtils } from "~~/test/nuxt/setup";
import { describe, expect, it, vi } from "vitest";

import prisma from "~/lib/__mocks__/prisma";
import handler from "~~/server/api/users/[id].delete";

const { defineEventHandler } = useH3TestUtils();

vi.mock("~/lib/prisma");

describe("dELETE /api/users/[id]", () => {
  it("is registered as an event handler", () =>
    expect(defineEventHandler).toHaveBeenCalled());

  const createBaseUser = (overrides = {}) => ({
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    avatar: null,
    color: null,
    todoOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    todoColumn: null,
    ...overrides,
  });

  describe("deletes user successfully", () => {
    it.each([
      {
        name: "user without todos",
        mockUser: createBaseUser({
          todoColumn: {
            id: "column-1",
            todos: [],
          },
        }),
      },
      {
        name: "user with todos",
        mockUser: createBaseUser({
          todoColumn: {
            id: "column-1",
            todos: [
              { id: "todo-1" },
              { id: "todo-2" },
            ],
          },
        }),
      },
      {
        name: "user without todo column",
        mockUser: createBaseUser({
          todoColumn: null,
        }),
      },
    ])("$name", async ({ mockUser }) => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const txMock = {
        todo: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        todoColumn: {
          delete: vi.fn().mockResolvedValue({ id: "column-1" }),
        },
        integration: {
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
        user: {
          delete: vi.fn().mockResolvedValue(mockUser),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(txMock as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
      });

      const event = createMockH3Event({
        params: { id: "user-1" },
      });

      const response = await handler(event);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        include: {
          todoColumn: {
            include: {
              todos: true,
            },
          },
        },
      });

      if (mockUser.todoColumn) {
        const todoColumn = mockUser.todoColumn as { id: string; todos?: Array<{ id: string }> };
        if (todoColumn.todos && todoColumn.todos.length > 0) {
          expect(txMock.todo.deleteMany).toHaveBeenCalledWith({
            where: { todoColumnId: todoColumn.id },
          });
        }
        expect(txMock.todoColumn.delete).toHaveBeenCalledWith({
          where: { id: todoColumn.id },
        });
      }

      expect(txMock.user.delete).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });

      expect(response).toEqual({ success: true });
    });
  });

  describe("integration settings cleanup", () => {
    async function deleteWithIntegrations(integrations: Array<{ id: string; settings: unknown }>) {
      prisma.user.findUnique.mockResolvedValue(createBaseUser());
      const txMock = {
        todo: { deleteMany: vi.fn() },
        todoColumn: { delete: vi.fn() },
        integration: {
          findMany: vi.fn().mockResolvedValue(integrations),
          update: vi.fn().mockResolvedValue({}),
        },
        user: { delete: vi.fn().mockResolvedValue(createBaseUser()) },
      };
      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(txMock as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
      });

      await handler(createMockH3Event({ params: { id: "user-1" } }));
      return txMock;
    }

    it("removes the user from integration-level settings", async () => {
      const txMock = await deleteWithIntegrations([
        { id: "ical-1", settings: { eventColor: "#aaa", user: ["user-1", "user-2"], useUserColors: true } },
      ]);

      expect(txMock.integration.update).toHaveBeenCalledWith({
        where: { id: "ical-1" },
        data: { settings: { eventColor: "#aaa", user: ["user-2"], useUserColors: true } },
      });
    });

    it("turns off user colors on a calendar whose only user is removed", async () => {
      const txMock = await deleteWithIntegrations([
        {
          id: "google-1",
          settings: {
            calendars: [
              { id: "cal-1", user: ["user-1"], useUserColors: true },
              { id: "cal-2", user: ["user-2"], useUserColors: true },
            ],
          },
        },
      ]);

      expect(txMock.integration.update).toHaveBeenCalledWith({
        where: { id: "google-1" },
        data: {
          settings: {
            calendars: [
              { id: "cal-1", user: [], useUserColors: false },
              { id: "cal-2", user: ["user-2"], useUserColors: true },
            ],
          },
        },
      });
    });

    it("does not update integrations that do not reference the user", async () => {
      const txMock = await deleteWithIntegrations([
        { id: "ical-2", settings: { user: ["user-2"], useUserColors: true } },
        { id: "mealie-1", settings: null },
      ]);

      expect(txMock.integration.update).not.toHaveBeenCalled();
      expect(txMock.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    });
  });

  describe("error handling", () => {
    it("throws 400 when id is missing", async () => {
      const event = createMockH3Event({
        params: {},
      });

      await expect(handler(event)).rejects.toThrow();
    });

    it("throws 404 when user not found", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const event = createMockH3Event({
        params: { id: "nonexistent" },
      });

      await expect(handler(event)).rejects.toThrow();
    });

    it("handles database errors", async () => {
      prisma.user.findUnique.mockResolvedValue(createBaseUser());
      prisma.$transaction.mockRejectedValue(new Error("Database error"));

      const event = createMockH3Event({
        params: { id: "user-1" },
      });

      await expect(handler(event)).rejects.toThrow();
    });
  });
});
