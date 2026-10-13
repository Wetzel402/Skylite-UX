import type { Integration } from "@prisma/client";

import { createError } from "h3";

import prisma from "~/lib/prisma";

export async function ensureShiftsIntegration(
  integrationId: string,
): Promise<Integration> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });
  if (!integration) {
    throw createError({
      statusCode: 404,
      message: "Integration not found",
    });
  }
  if (integration.type !== "calendar" || integration.service !== "shifts") {
    throw createError({
      statusCode: 400,
      message: "Integration is not a shifts integration",
    });
  }
  return integration;
}

export type ShiftSlotData = {
  dayIndex: number;
  startTime: string;
  endTime: string;
  label: string | null;
  color: string | null;
  order: number;
};

export type ShiftAssignmentData = {
  userId: string | null;
  startDate: Date;
  endDate: Date | null;
};

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function badRequest(message: string) {
  return createError({ statusCode: 400, message });
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw badRequest("Invalid input");
  return input as Record<string, unknown>;
}

function validateDayIndex(dayIndex: unknown, cycleDays: number): number {
  if (typeof dayIndex !== "number" || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= cycleDays)
    throw badRequest(`dayIndex must be an integer between 0 and ${cycleDays - 1}`);
  return dayIndex;
}

function validateTime(value: string, field: string): string {
  const time = value.trim();
  if (!TIME_PATTERN.test(time))
    throw badRequest(`${field} must be in HH:MM format`);
  return time;
}

function toOptionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function parseDateField(value: unknown, field: string): Date {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date))
    throw badRequest(`${field} is not a valid date`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw badRequest(`${field} is not a valid date`);
  return date;
}

function ensureDateOrder(startDate: Date | undefined, endDate: Date | null | undefined) {
  if (startDate && endDate && endDate.getTime() < startDate.getTime())
    throw badRequest("endDate cannot be before startDate");
}

export function validateShiftSlotInput(input: unknown, cycleDays: number): ShiftSlotData {
  const { dayIndex, startTime, endTime, label, color, order } = asRecord(input);
  const validDayIndex = validateDayIndex(dayIndex, cycleDays);
  if (typeof startTime !== "string" || typeof endTime !== "string")
    throw badRequest("startTime and endTime are required");
  return {
    dayIndex: validDayIndex,
    startTime: validateTime(startTime, "startTime"),
    endTime: validateTime(endTime, "endTime"),
    label: toOptionalText(label),
    color: toOptionalText(color),
    order: typeof order === "number" ? order : 0,
  };
}

export function validateShiftSlotUpdate(input: unknown, cycleDays: number): Partial<ShiftSlotData> {
  const { dayIndex, startTime, endTime, label, color, order } = asRecord(input);
  const data: Partial<ShiftSlotData> = {};
  if (dayIndex !== undefined)
    data.dayIndex = validateDayIndex(dayIndex, cycleDays);
  if (typeof startTime === "string")
    data.startTime = validateTime(startTime, "startTime");
  if (typeof endTime === "string")
    data.endTime = validateTime(endTime, "endTime");
  if (label !== undefined)
    data.label = toOptionalText(label);
  if (color !== undefined)
    data.color = toOptionalText(color);
  if (typeof order === "number")
    data.order = order;
  return data;
}

export function validateShiftAssignmentInput(input: unknown): ShiftAssignmentData {
  const { userId, startDate, endDate } = asRecord(input);
  if (!startDate)
    throw badRequest("startDate is required");
  const start = parseDateField(startDate, "startDate");
  const end = endDate ? parseDateField(endDate, "endDate") : null;
  ensureDateOrder(start, end);
  return {
    userId: typeof userId === "string" ? userId : null,
    startDate: start,
    endDate: end,
  };
}

export function validateShiftAssignmentUpdate(input: unknown): Partial<ShiftAssignmentData> {
  const { userId, startDate, endDate } = asRecord(input);
  const data: Partial<ShiftAssignmentData> = {};
  if (userId !== undefined)
    data.userId = typeof userId === "string" ? userId : null;
  if (startDate !== undefined)
    data.startDate = parseDateField(startDate, "startDate");
  if (endDate !== undefined)
    data.endDate = endDate ? parseDateField(endDate, "endDate") : null;
  ensureDateOrder(data.startDate, data.endDate);
  return data;
}
