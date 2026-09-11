import { endOfDay, endOfMonth, endOfWeek } from "date-fns";
import { describe, it, expect } from "vitest";

import { getDueRangeCutoff, getPriorityColor, isTodoWithinDueRange } from "~/types/ui";

describe("getDueRangeCutoff", () => {
  const now = new Date("2026-08-19T12:00:00"); // a Wednesday, late enough in the month that week and month cutoffs diverge

  it("returns null for 'all'", () => {
    expect(getDueRangeCutoff("all", now)).toBeNull();
  });

  it("returns end of the given day for 'day'", () => {
    expect(getDueRangeCutoff("day", now)).toEqual(endOfDay(now));
  });

  it("returns end of week for 'week'", () => {
    expect(getDueRangeCutoff("week", now)).toEqual(
      endOfWeek(now, { weekStartsOn: 0 }),
    );
  });

  it("returns end of month for 'month'", () => {
    expect(getDueRangeCutoff("month", now)).toEqual(endOfMonth(now));
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
