import type { H3Event } from "h3";

import { registerEndpoint } from "@nuxt/test-utils/runtime";
import { createError, getQuery } from "h3";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent } from "~/types/calendar";

import { createShiftsService, ShiftsService } from "../../../../../app/integrations/shifts/shifts";

const shiftEvent: CalendarEvent = {
  id: "shift-a-1",
  title: "Night",
  description: "Rotation",
  start: new Date("2025-06-02T00:00:00.000Z"),
  end: new Date("2025-06-02T12:00:00.000Z"),
  allDay: false,
  color: "#7F8FF7",
  integrationId: "int-1",
};

const cleanups: (() => void)[] = [];

function mockShiftsEndpoint(handler: (event: H3Event) => unknown) {
  cleanups.push(registerEndpoint("/api/integrations/shifts", handler));
}

function mockUsersEndpoint(handler: () => unknown) {
  cleanups.push(registerEndpoint("/api/users", handler));
}

describe("ShiftsService", () => {
  afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup());
  });

  it("createShiftsService returns a ShiftsService", () => {
    expect(createShiftsService("int-1", "", "")).toBeInstanceOf(ShiftsService);
  });

  it("reports get_events as its only capability", async () => {
    const service = createShiftsService("int-1", "", "");

    expect(await service.getCapabilities()).toEqual(["get_events"]);
  });

  it("initialize and testConnection mark the service connected", async () => {
    const service = createShiftsService("int-1", "", "");

    await service.initialize();
    expect((await service.getStatus()).isConnected).toBe(true);
    expect(await service.testConnection()).toBe(true);
  });

  it("validate succeeds when the shifts endpoint responds", async () => {
    const seenQueries: Record<string, unknown>[] = [];
    mockShiftsEndpoint((event) => {
      seenQueries.push(getQuery(event));
      return { events: [] };
    });
    const service = createShiftsService("int-1", "", "");

    expect(await service.validate()).toBe(true);
    expect(seenQueries).toEqual([{ integrationId: "int-1" }]);
    expect((await service.getStatus()).isConnected).toBe(true);
  });

  it("validate fails and records an error when the endpoint errors", async () => {
    mockShiftsEndpoint(() => {
      throw createError({ statusCode: 500, message: "boom" });
    });
    const service = createShiftsService("int-1", "", "");

    expect(await service.validate()).toBe(false);
    const status = await service.getStatus();
    expect(status.isConnected).toBe(false);
    expect(status.error).toBe("Failed to load shifts");
  });

  it("getEvents keeps event colors and falls back to the integration color", async () => {
    mockShiftsEndpoint(() => ({
      events: [shiftEvent, { ...shiftEvent, id: "shift-a-2", color: undefined }],
    }));
    const service = createShiftsService("int-1", "", "", { eventColor: "#123456" });

    const events = await service.getEvents();

    expect(events.map(ev => ev.color)).toEqual(["#7F8FF7", "#123456"]);
  });

  it("getEvents attaches selected users when useUserColors is enabled", async () => {
    mockShiftsEndpoint(() => ({ events: [shiftEvent] }));
    mockUsersEndpoint(() => [
      { id: "u1", name: "Alice", color: "#ff0000" },
      { id: "u2", name: "Bob", color: "#00ff00" },
    ]);
    const service = createShiftsService("int-1", "", "", { user: ["u1"], useUserColors: true });

    const events = await service.getEvents();

    expect(events[0]!.users).toEqual([{ id: "u1", name: "Alice", color: "#ff0000" }]);
  });

  it("getEvents keeps server users when the users request fails", async () => {
    const serverUsers = [{ id: "u9", name: "Server", avatar: null, color: null }];
    mockShiftsEndpoint(() => ({ events: [{ ...shiftEvent, users: serverUsers }] }));
    mockUsersEndpoint(() => {
      throw createError({ statusCode: 500, message: "users down" });
    });
    const service = createShiftsService("int-1", "", "", { user: ["u1"], useUserColors: true });

    const events = await service.getEvents();

    expect(events[0]!.users).toEqual(serverUsers);
  });

  it("getEvents does not request users when useUserColors is off", async () => {
    const usersHandler = vi.fn(() => []);
    mockShiftsEndpoint(() => ({ events: [shiftEvent] }));
    mockUsersEndpoint(usersHandler);
    const service = createShiftsService("int-1", "", "", { user: ["u1"] });

    await service.getEvents();

    expect(usersHandler).not.toHaveBeenCalled();
  });
});
