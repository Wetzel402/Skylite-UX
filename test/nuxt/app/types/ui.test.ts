import { describe, expect, it } from "vitest";

import { getDueRangeCutoff, getPriorityColor, isTodoWithinDueRange, isValidTimezone, resolveNavigation } from "~/types/ui";

// A timezone with a fixed +05:30 offset and no DST, so cutoffs computed
// against it can be asserted with plain arithmetic instead of depending on
// the host machine's local timezone.
const FIXED_OFFSET_TZID = "Asia/Kolkata";

describe("getDueRangeCutoff", () => {
  const now = new Date("2026-08-19T12:00:00Z"); // a Wednesday, late enough in the month that week and month cutoffs diverge

  it("returns null for 'all'", () => {
    expect(getDueRangeCutoff("all", now, "UTC")).toBeNull();
  });

  it("returns end of the given day in UTC", () => {
    expect(getDueRangeCutoff("day", now, "UTC")).toEqual(
      new Date("2026-08-19T23:59:59.999Z"),
    );
  });

  it("returns end of week in UTC", () => {
    expect(getDueRangeCutoff("week", now, "UTC")).toEqual(
      new Date("2026-08-22T23:59:59.999Z"),
    );
  });

  it("returns end of month in UTC", () => {
    expect(getDueRangeCutoff("month", now, "UTC")).toEqual(
      new Date("2026-08-31T23:59:59.999Z"),
    );
  });

  it("computes the day cutoff using the configured zone's wall-clock time, not UTC", () => {
    // 12:00 UTC is 17:30 in the +05:30 zone, still the same calendar day.
    expect(getDueRangeCutoff("day", now, FIXED_OFFSET_TZID)).toEqual(
      new Date("2026-08-19T18:29:59.999Z"),
    );
  });

  it("computes the week cutoff using the configured zone's wall-clock time", () => {
    expect(getDueRangeCutoff("week", now, FIXED_OFFSET_TZID)).toEqual(
      new Date("2026-08-22T18:29:59.999Z"),
    );
  });

  it("computes the month cutoff using the configured zone's wall-clock time", () => {
    expect(getDueRangeCutoff("month", now, FIXED_OFFSET_TZID)).toEqual(
      new Date("2026-08-31T18:29:59.999Z"),
    );
  });

  it("rolls the day cutoff to the next calendar day when the zone offset crosses midnight", () => {
    // 20:00 UTC is 01:30 the next day in the +05:30 zone, so the cutoff
    // must land on Aug 20 in that zone, not Aug 19.
    const nearMidnightUtc = new Date("2026-08-19T20:00:00Z");
    expect(getDueRangeCutoff("day", nearMidnightUtc, FIXED_OFFSET_TZID)).toEqual(
      new Date("2026-08-20T18:29:59.999Z"),
    );
  });

  it("falls back to UTC when the given timezone is not registered", () => {
    expect(getDueRangeCutoff("day", now, "Not/Registered")).toEqual(
      new Date("2026-08-19T23:59:59.999Z"),
    );
  });

  it("uses daylight time before the fall-back instant in America/Chicago", () => {
    expect(getDueRangeCutoff("day", new Date("2026-11-01T04:00:00Z"), "America/Chicago")).toEqual(
      new Date("2026-11-01T04:59:59.999Z"),
    );
    expect(getDueRangeCutoff("day", new Date("2026-11-01T05:00:00Z"), "America/Chicago")).toEqual(
      new Date("2026-11-02T05:59:59.999Z"),
    );
  });

  it("validates IANA timezone names", () => {
    expect(isValidTimezone("America/Chicago")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });

  it("produces the same cutoff regardless of how many times it is evaluated for the same inputs (SSR and client parity)", () => {
    const firstEvaluation = getDueRangeCutoff("week", now, FIXED_OFFSET_TZID);
    const secondEvaluation = getDueRangeCutoff("week", now, FIXED_OFFSET_TZID);
    expect(firstEvaluation).toEqual(secondEvaluation);
  });
});

describe("getPriorityColor", () => {
  it("returns the mapped class string for LOW", () => {
    expect(getPriorityColor("LOW")).toBe(
      "text-green-600 bg-green-50 dark:bg-green-950",
    );
  });

  it("returns the mapped class string for MEDIUM", () => {
    expect(getPriorityColor("MEDIUM")).toBe(
      "text-yellow-600 bg-yellow-50 dark:bg-yellow-950",
    );
  });

  it("returns the mapped class string for HIGH", () => {
    expect(getPriorityColor("HIGH")).toBe(
      "text-orange-600 bg-orange-50 dark:bg-orange-950",
    );
  });

  it("returns the mapped class string for URGENT", () => {
    expect(getPriorityColor("URGENT")).toBe(
      "text-red-600 bg-red-50 dark:bg-red-950",
    );
  });

  it("falls back to a muted class string for an unmapped value", () => {
    // @ts-expect-error testing an out-of-range value
    expect(getPriorityColor("UNKNOWN")).toBe("text-muted bg-muted");
  });
});

describe("isTodoWithinDueRange", () => {
  const cutoff = new Date("2026-08-19T23:59:59");

  it("returns true when cutoff is null (no filter applied)", () => {
    expect(isTodoWithinDueRange(new Date("2099-01-01"), false, null)).toBe(true);
  });

  it("returns true for a completed todo past the cutoff", () => {
    expect(isTodoWithinDueRange(new Date("2099-01-01"), true, cutoff)).toBe(true);
  });

  it("returns true for an undated todo", () => {
    expect(isTodoWithinDueRange(null, false, cutoff)).toBe(true);
  });

  it("returns true when the due date is before the cutoff", () => {
    expect(isTodoWithinDueRange(new Date("2026-08-18"), false, cutoff)).toBe(true);
  });

  it("returns true when the due date is exactly at the cutoff", () => {
    expect(isTodoWithinDueRange(cutoff, false, cutoff)).toBe(true);
  });

  it("returns false when the due date is after the cutoff", () => {
    expect(isTodoWithinDueRange(new Date("2026-08-20"), false, cutoff)).toBe(false);
  });
});

describe("resolveNavigation", () => {
  it("returns dock for auto in portrait", () => {
    expect(resolveNavigation("auto", true)).toBe("dock");
  });

  it("returns sidebar for auto in landscape", () => {
    expect(resolveNavigation("auto", false)).toBe("sidebar");
  });

  it("treats an undefined preference as auto", () => {
    expect(resolveNavigation(undefined, true)).toBe("dock");
    expect(resolveNavigation(undefined, false)).toBe("sidebar");
  });

  it("honors an explicit sidebar preference regardless of orientation", () => {
    expect(resolveNavigation("sidebar", true)).toBe("sidebar");
    expect(resolveNavigation("sidebar", false)).toBe("sidebar");
  });

  it("honors an explicit dock preference regardless of orientation", () => {
    expect(resolveNavigation("dock", true)).toBe("dock");
    expect(resolveNavigation("dock", false)).toBe("dock");
  });
});
