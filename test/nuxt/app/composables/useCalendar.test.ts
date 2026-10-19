import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { CalendarEvent } from "~/types/calendar";
import {
  getBaseCalendarEventId,
  useCalendar,
} from "../../../../app/composables/useCalendar";
import {
  getBrowserTimezone,
  isTimezoneRegistered,
  setBrowserTimezone,
  setTimezoneRegistered,
} from "../../../../app/types/global";

describe("getBaseCalendarEventId", () => {
  it("returns the id unchanged when there is no occurrence suffix", () => {
    expect(getBaseCalendarEventId("clxyzabc123")).toBe("clxyzabc123");
  });

  it("returns hyphenated master ids unchanged", () => {
    expect(getBaseCalendarEventId("event-1")).toBe("event-1");
  });

  it("strips the ICAL occurrence suffix from a cuid expanded id", () => {
    expect(getBaseCalendarEventId("clxyzabc123-20250115T100000Z")).toBe(
      "clxyzabc123",
    );
  });

  it("strips the ICAL occurrence suffix from a hyphenated master expanded id", () => {
    expect(getBaseCalendarEventId("event-1-20250115T100000Z")).toBe("event-1");
  });
});

describe("useCalendar", () => {
  describe("timezone", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should test timezone conversion functions exist", () => {
      const calendar = useCalendar();

      expect(calendar.getLocalTimeFromUTC).toBeDefined();
      expect(typeof calendar.getLocalTimeFromUTC).toBe("function");
    });

    it("should convert UTC time to local time with various timezones", () => {
      const calendar = useCalendar();
      const utcDate = new Date("2025-01-15T12:00:00Z");
      const localTime = calendar.getLocalTimeFromUTC(utcDate);

      expect(localTime).toBeInstanceOf(Date);
      expect(localTime.getTime()).toBeDefined();
    });

    it("should check if two dates are the same local day for all-day events", () => {
      const calendar = useCalendar();
      const date1 = new Date("2025-01-15T00:00:00Z");
      const date2 = new Date("2025-01-15T23:59:59Z");

      const result = calendar.isSameLocalDay(date1, date2, true);
      expect(result).toBe(true);
    });

    it("should check if two dates are the same local day for timed events", () => {
      const calendar = useCalendar();
      const date1 = new Date("2025-01-15T10:00:00Z");
      const date2 = new Date("2025-01-15T14:00:00Z");

      const result = calendar.isSameLocalDay(date1, date2, false);
      expect(typeof result).toBe("boolean");
    });

    it("should check if a day is in local range for all-day events", () => {
      const calendar = useCalendar();
      const day = new Date("2025-01-15T00:00:00Z");
      const start = new Date("2025-01-10T00:00:00Z");
      const end = new Date("2025-01-20T00:00:00Z");

      const result = calendar.isLocalDayInRange(day, start, end, true);
      expect(result).toBe(true);
    });

    it("should check if a day is in local range for timed events", () => {
      const calendar = useCalendar();
      const day = new Date("2025-01-15T12:00:00Z");
      const start = new Date("2025-01-10T00:00:00Z");
      const end = new Date("2025-01-20T00:00:00Z");

      const result = calendar.isLocalDayInRange(day, start, end, false);
      expect(typeof result).toBe("boolean");
    });

    it("should handle timezone conversion failures gracefully", () => {
      const calendar = useCalendar();
      const utcDate = new Date("2025-01-15T12:00:00Z");

      vi.spyOn(console, "warn").mockImplementation(() => {});

      const localTime = calendar.getLocalTimeFromUTC(utcDate);
      expect(localTime).toBeInstanceOf(Date);
    });

    it("should handle DST transition edge cases for same local day check", () => {
      const calendar = useCalendar();
      const date1 = new Date("2025-03-09T06:00:00Z");
      const date2 = new Date("2025-03-09T07:00:00Z");

      const result = calendar.isSameLocalDay(date1, date2, false);
      expect(typeof result).toBe("boolean");
    });

    describe("DST boundaries in America/Chicago", () => {
      let prevRegistered: boolean;
      let prevTimezone: string | undefined;

      beforeEach(() => {
        prevRegistered = isTimezoneRegistered();
        prevTimezone = getBrowserTimezone();
        setTimezoneRegistered(true);
        setBrowserTimezone("America/Chicago");
      });

      afterEach(() => {
        setTimezoneRegistered(prevRegistered);
        setBrowserTimezone(prevTimezone ?? "");
      });

      it("treats local midnight on the fall-back day as Nov 1", () => {
        const calendar = useCalendar();
        expect(calendar.isSameLocalDay(new Date("2026-11-01T05:00:00Z"), new Date("2026-11-01T22:00:00Z"))).toBe(true);
        expect(calendar.isSameLocalDay(new Date("2026-11-01T04:00:00Z"), new Date("2026-11-01T05:00:00Z"))).toBe(false);
        expect(calendar.getLocalTimeFromUTC(new Date("2026-11-01T05:00:00Z")).getDate()).toBe(1);
        expect(calendar.getLocalTimeFromUTC(new Date("2026-11-01T04:00:00Z")).getHours()).toBe(23);
      });

      it("keeps standard time until the spring-forward instant", () => {
        const calendar = useCalendar();
        const local = calendar.getLocalTimeFromUTC(new Date("2026-03-08T05:00:00Z"));
        expect(local.getDate()).toBe(7);
        expect(local.getHours()).toBe(23);
        expect(calendar.getLocalTimeFromUTC(new Date("2026-03-08T08:00:00Z")).getHours()).toBe(3);
      });

      it("matches local day range across the fall-back day", () => {
        const calendar = useCalendar();
        expect(calendar.isLocalDayInRange(
          new Date("2026-11-01T05:00:00Z"),
          new Date("2026-10-31T05:00:00Z"),
          new Date("2026-11-01T06:00:00Z"),
        )).toBe(true);
        expect(calendar.isLocalDayInRange(
          new Date("2026-11-01T05:00:00Z"),
          new Date("2026-10-30T05:00:00Z"),
          new Date("2026-11-01T04:00:00Z"),
        )).toBe(false);
      });

      it("builds a 5-week grid for November 2026", () => {
        const weeks = useCalendar().getLocalMonthWeeks(new Date(2026, 10, 15, 12));
        expect(weeks).toHaveLength(5);
        expect(weeks.every(week => week.length === 7)).toBe(true);
        expect(weeks[4]![6]!.getDate()).toBe(5);
      });

      it("keeps a 6-week grid for August 2026", () => {
        const weeks = useCalendar().getLocalMonthWeeks(new Date(2026, 7, 15, 12));
        expect(weeks).toHaveLength(6);
        expect(weeks[0]![0]!.getDate()).toBe(26);
        expect(weeks[5]![6]!.getDate()).toBe(5);
      });
    });

    it("should get local time string with timezone conversion", () => {
      const calendar = useCalendar();
      const utcDate = new Date("2025-01-15T12:00:00Z");
      const timeString = calendar.getLocalTimeString(utcDate);

      expect(typeof timeString).toBe("string");
      expect(timeString.length).toBeGreaterThan(0);
    });

    it("should get local date string with timezone conversion", () => {
      const calendar = useCalendar();
      const utcDate = new Date("2025-01-15T12:00:00Z");
      const dateString = calendar.getLocalDateString(utcDate);

      expect(typeof dateString).toBe("string");
      expect(dateString.length).toBeGreaterThan(0);
    });
  });

  describe("date helpers", () => {
    it("should create local date with correct UTC midnight", () => {
      const { createLocalDate } = useCalendar();
      const d = createLocalDate(2025, 0, 15);

      expect(d).toBeInstanceOf(Date);
      expect(d.getUTCFullYear()).toBe(2025);
      expect(d.getUTCMonth()).toBe(0);
      expect(d.getUTCDate()).toBe(15);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
    });

    it("should convert local date to UTC", () => {
      const { convertLocalToUTC } = useCalendar();
      const local = new Date(2025, 0, 15, 14, 30, 0);

      const utc = convertLocalToUTC(local);

      expect(utc).toBeInstanceOf(Date);
      expect(utc.getUTCFullYear()).toBe(local.getFullYear());
      expect(utc.getUTCMonth()).toBe(local.getMonth());
      expect(utc.getUTCDate()).toBe(local.getDate());
      expect(utc.getUTCHours()).toBe(local.getHours());
      expect(utc.getUTCMinutes()).toBe(local.getMinutes());
    });
  });

  describe("color helpers", () => {
    it("should lighten hex color with default amount", () => {
      const { lightenColor } = useCalendar();

      const result = lightenColor("#000000");

      expect(result).toMatch(/^#[0-9a-f]{6}$/i);
      expect(result).not.toBe("#000000");
    });

    it("should lighten hex color with explicit amount", () => {
      const { lightenColor } = useCalendar();

      const result = lightenColor("#000000", 0.5);

      expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should return white text color for dark hex", () => {
      const { getTextColor } = useCalendar();

      expect(getTextColor("#000000")).toBe("white");
    });

    it("should return black text color for light hex", () => {
      const { getTextColor } = useCalendar();

      expect(getTextColor("#ffffff")).toBe("black");
    });

    it("should return numeric luminance for hex", () => {
      const { getLuminance } = useCalendar();

      expect(getLuminance("#000000")).toBe(0);
      expect(getLuminance("#ffffff")).toBeGreaterThan(0.9);
    });

    it("should return white for empty or invalid colors in getAverageTextColor", () => {
      const { getAverageTextColor } = useCalendar();

      expect(getAverageTextColor([])).toBe("white");
      expect(getAverageTextColor(["invalid", "nothex"])).toBe("white");
    });

    it("should return black or white by luminance for valid hexes in getAverageTextColor", () => {
      const { getAverageTextColor } = useCalendar();

      const result = getAverageTextColor(["#ffffff"]);
      expect(["black", "white"]).toContain(result);
    });
  });

  describe("event helpers", () => {
    it("should identify placeholder event by id prefix", () => {
      const { isPlaceholderEvent } = useCalendar();
      const normal: CalendarEvent = { id: "evt-1", title: "X", start: new Date(), end: new Date() };
      const placeholder: CalendarEvent = { id: "__placeholder_0", title: "", start: new Date(0), end: new Date(0) };

      expect(isPlaceholderEvent(normal)).toBe(false);
      expect(isPlaceholderEvent(placeholder)).toBe(true);
    });

    it("should identify placeholder event by isPlaceholder flag", () => {
      const { isPlaceholderEvent } = useCalendar();
      const event = { id: "other", title: "", start: new Date(0), end: new Date(0), isPlaceholder: true } as CalendarEvent & { isPlaceholder: true };

      expect(isPlaceholderEvent(event)).toBe(true);
    });

    it("should create placeholder event with expected shape", () => {
      const { createPlaceholderEvent } = useCalendar();

      const result = createPlaceholderEvent(3);

      expect(result.id).toBe("__placeholder_3");
      expect(result.isPlaceholder).toBe(true);
      expect(result.position).toBe(3);
      expect(result.title).toBe("");
      expect(result.start).toEqual(new Date(0));
      expect(result.end).toEqual(new Date(0));
    });

    it("should return eventColor when event has no users or color in getEventUserColors", () => {
      const { getEventUserColors } = useCalendar();
      const event: CalendarEvent = { id: "e1", title: "E", start: new Date(), end: new Date() };

      const result = getEventUserColors(event, { eventColor: "#aaa", defaultColor: "#bbb" });

      expect(result).toBe("#aaa");
    });

    it("should return event color when event.color is string in getEventUserColors", () => {
      const { getEventUserColors } = useCalendar();
      const event: CalendarEvent = { id: "e1", title: "E", start: new Date(), end: new Date(), color: "#abc" };

      const result = getEventUserColors(event);

      expect(result).toBe("#abc");
    });

    it("should return user colors when event has users with colors in getEventUserColors", () => {
      const { getEventUserColors } = useCalendar();
      const event: CalendarEvent = {
        id: "e1",
        title: "E",
        start: new Date(),
        end: new Date(),
        users: [{ id: "u1", name: "U1", color: "#111" }, { id: "u2", name: "U2", color: "#222" }],
      };

      const result = getEventUserColors(event, { eventColor: "#ccc", defaultColor: "#ddd" });

      expect(Array.isArray(result)).toBe(true);
      expect((result as string[]).sort()).toEqual(["#111", "#222"]);
    });
  });

  describe("overnight shift events", () => {
    const overnight = (id: string, integrationId: string): CalendarEvent => ({
      id,
      title: "Nights",
      start: new Date("2025-01-15T19:00:00Z"),
      end: new Date("2025-01-16T05:00:00Z"),
      allDay: false,
      integrationId,
    });
    const startDay = new Date("2025-01-15T12:00:00Z");
    const nextDay = new Date("2025-01-16T12:00:00Z");
    let wasTimezoneRegistered = false;

    beforeEach(() => {
      wasTimezoneRegistered = isTimezoneRegistered();
      setTimezoneRegistered(false);
      useNuxtData("integrations").data.value = [
        { id: "int-shifts", type: "calendar", service: "shifts" },
        { id: "int-ical", type: "calendar", service: "iCal" },
      ];
    });

    afterEach(() => {
      setTimezoneRegistered(wasTimezoneRegistered);
      useNuxtData("integrations").data.value = undefined;
    });

    it("identifies shift events by integration or source calendar", () => {
      const { isShiftEvent } = useCalendar();

      expect(isShiftEvent(overnight("s1", "int-shifts"))).toBe(true);
      expect(isShiftEvent(overnight("i1", "int-ical"))).toBe(false);
      expect(isShiftEvent({
        ...overnight("s2", ""),
        sourceCalendars: [{ integrationId: "int-shifts", integrationName: "Shifts", calendarId: "c", calendarName: "c", accessRole: "read", canEdit: false }],
      })).toBe(true);
    });

    it("shows an overnight shift only on its start day", () => {
      const { getAllEventsForDay, getAgendaEventsForDay } = useCalendar();
      const events = [overnight("s1", "int-shifts")];

      expect(getAllEventsForDay(events, startDay)).toHaveLength(1);
      expect(getAllEventsForDay(events, nextDay)).toHaveLength(0);
      expect(getAgendaEventsForDay(events, nextDay)).toHaveLength(0);
    });

    it("still shows other overnight events on every day they touch", () => {
      const { getAllEventsForDay } = useCalendar();
      const events = [overnight("i1", "int-ical")];

      expect(getAllEventsForDay(events, startDay)).toHaveLength(1);
      expect(getAllEventsForDay(events, nextDay)).toHaveLength(1);
    });
  });

  describe("UI helpers", () => {
    it("should return default heights for month, week, day", () => {
      const { computedEventHeight } = useCalendar();

      expect(computedEventHeight("month")).toBe(40);
      expect(computedEventHeight("week")).toBe(64);
      expect(computedEventHeight("day")).toBe(48);
    });

    it("should return customHeight when provided", () => {
      const { computedEventHeight } = useCalendar();

      expect(computedEventHeight("month", 100)).toBe(100);
    });

    it("should return true when date and selectedDate are same local day in isSelectedDate", () => {
      const { isSelectedDate } = useCalendar();
      const d = new Date("2025-01-15T12:00:00Z");
      const sel = new Date("2025-01-15T08:00:00Z");

      expect(isSelectedDate(d, sel)).toBe(true);
    });

    it("should return false when date and selectedDate differ in local day in isSelectedDate", () => {
      const { isSelectedDate } = useCalendar();
      const d = new Date("2025-01-16T05:59:59Z");
      const sel = new Date("2025-01-16T06:00:00Z");

      expect(isSelectedDate(d, sel)).toBe(false);
    });

    it("should return true for same local day across UTC midnight in isSelectedDate", () => {
      const { isSelectedDate } = useCalendar();
      const d = new Date("2025-01-15T23:59:59Z");
      const sel = new Date("2025-01-16T00:00:00Z");

      expect(isSelectedDate(d, sel)).toBe(true);
    });

    it("should sort events by start time without mutating input", () => {
      const { sortEvents } = useCalendar();
      const start = new Date("2025-01-15T10:00:00Z");
      const mid = new Date("2025-01-15T12:00:00Z");
      const late = new Date("2025-01-15T14:00:00Z");
      const events: CalendarEvent[] = [
        { id: "3", title: "C", start: late, end: late },
        { id: "1", title: "A", start: start, end: start },
        { id: "2", title: "B", start: mid, end: mid },
      ];

      const result = sortEvents(events);

      expect(result[0]!.id).toBe("1");
      expect(result[1]!.id).toBe("2");
      expect(result[2]!.id).toBe("3");
      expect(events[0]!.id).toBe("3");
    });
  });

  describe("combineEvents", () => {
    it("should merge events with same title, start, end, location, description", () => {
      const { combineEvents } = useCalendar();
      const start = new Date("2025-01-15T10:00:00Z");
      const end = new Date("2025-01-15T11:00:00Z");
      const events: CalendarEvent[] = [
        {
          id: "e1",
          title: "Meet",
          start,
          end,
          location: "L1",
          description: "D1",
          sourceCalendars: [{ integrationId: "i1", calendarId: "c1", accessRole: "read", canEdit: false, eventColor: "#aaa" }],
          users: [{ id: "u1", name: "U1", color: "#111" }],
        },
        {
          id: "e2",
          title: "Meet",
          start,
          end,
          location: "L1",
          description: "D1",
          sourceCalendars: [{ integrationId: "i2", calendarId: "c2", accessRole: "read", canEdit: false, eventColor: "#bbb" }],
          users: [{ id: "u2", name: "U2", color: "#222" }],
        },
      ];

      const result = combineEvents(events);

      expect(result).toHaveLength(1);
      expect(result[0]!.users).toHaveLength(2);
      expect(result[0]!.sourceCalendars).toHaveLength(2);
    });

    it("should sort combined events by start time", () => {
      const { combineEvents } = useCalendar();
      const early = new Date("2025-01-15T09:00:00Z");
      const late = new Date("2025-01-15T11:00:00Z");
      const events: CalendarEvent[] = [
        { id: "e2", title: "B", start: late, end: late },
        { id: "e1", title: "A", start: early, end: early },
      ];

      const result = combineEvents(events);

      expect(result[0]!.title).toBe("A");
      expect(result[1]!.title).toBe("B");
    });

    const birthdayStart = new Date("2026-10-03T00:00:00Z");
    const birthdayEnd = new Date("2026-10-04T00:00:00Z");

    function birthdayEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
      return {
        id: "b1",
        title: "John Doe's Birthday",
        start: birthdayStart,
        end: birthdayEnd,
        allDay: true,
        ...overrides,
      };
    }

    it("stripes merged events with each source's calendar color", () => {
      const { combineEvents } = useCalendar();
      const result = combineEvents([
        birthdayEvent({
          id: "g1",
          color: "#aaa",
          sourceCalendars: [{ integrationId: "i1", calendarId: "c1", accessRole: "read", canEdit: false, eventColor: "#aaa" }],
        }),
        birthdayEvent({
          id: "g2",
          color: "#bbb",
          sourceCalendars: [{ integrationId: "i2", calendarId: "c2", accessRole: "read", canEdit: false, eventColor: "#bbb" }],
        }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.color).toEqual(["#aaa", "#bbb"]);
    });

    it("prefers a source's user color over its calendar color when merged", () => {
      const { combineEvents } = useCalendar();
      const result = combineEvents([
        birthdayEvent({
          id: "g1",
          color: "#aaa",
          sourceCalendars: [{ integrationId: "i1", calendarId: "c1", accessRole: "read", canEdit: false, eventColor: "#aaa", userColor: "#111" }],
        }),
        birthdayEvent({
          id: "g2",
          color: "#bbb",
          sourceCalendars: [{ integrationId: "i2", calendarId: "c2", accessRole: "read", canEdit: false, eventColor: "#bbb" }],
        }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.color).toEqual(["#111", "#bbb"]);
    });

    it("uses the source color for a single-source non-shift event", () => {
      const { combineEvents } = useCalendar();
      const result = combineEvents([
        birthdayEvent({
          color: "#123456",
          sourceCalendars: [{ integrationId: "i1", calendarId: "c1", accessRole: "read", canEdit: false, eventColor: "#06b6d4" }],
        }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.color).toBe("#06b6d4");
    });

    it("keeps a single-source shift event's own color", () => {
      useNuxtData("integrations").data.value = [
        { id: "int-shifts", type: "calendar", service: "shifts" },
      ];
      try {
        const { combineEvents } = useCalendar();
        const result = combineEvents([
          birthdayEvent({
            color: "#123456",
            integrationId: "int-shifts",
            sourceCalendars: [{ integrationId: "int-shifts", calendarId: "c1", accessRole: "read", canEdit: false, eventColor: "#06b6d4" }],
          }),
        ]);

        expect(result).toHaveLength(1);
        expect(result[0]!.color).toBe("#123456");
      }
      finally {
        useNuxtData("integrations").data.value = undefined;
      }
    });

    it("merges events whose title, location and description differ only in case", () => {
      const { combineEvents } = useCalendar();
      const result = combineEvents([
        birthdayEvent({
          id: "g1",
          location: "Central Park",
          description: "Party at noon",
          sourceCalendars: [{ integrationId: "i1", calendarId: "c1", accessRole: "read", canEdit: false, eventColor: "#aaa" }],
        }),
        birthdayEvent({
          id: "g2",
          title: "John Doe's birthday",
          location: "central park",
          description: "party at noon",
          sourceCalendars: [{ integrationId: "i2", calendarId: "c2", accessRole: "read", canEdit: false, eventColor: "#bbb" }],
        }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.sourceCalendars).toHaveLength(2);
    });

    it("does not merge events at different times", () => {
      const { combineEvents } = useCalendar();
      const result = combineEvents([
        birthdayEvent({ id: "g1", allDay: false }),
        birthdayEvent({
          id: "g2",
          allDay: false,
          start: new Date("2026-10-03T01:00:00Z"),
          end: new Date("2026-10-04T01:00:00Z"),
        }),
      ]);

      expect(result).toHaveLength(2);
    });
  });
});
