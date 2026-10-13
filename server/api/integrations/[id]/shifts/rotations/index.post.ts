import { getRouterParam, readBody } from "h3";

import prisma from "~/lib/prisma";

import {
  ensureShiftsIntegration,
  validateShiftAssignmentInput,
  validateShiftSlotInput,
} from "../../../../../utils/shiftsIntegration";

export default defineEventHandler(async (event) => {
  const integrationId = getRouterParam(event, "id");
  if (!integrationId)
    throw createError({ statusCode: 400, message: "integration id required" });
  await ensureShiftsIntegration(integrationId);
  const body = await readBody(event);
  const { name, cycleDays, color, order, slots, assignment } = body;
  if (!name || typeof name !== "string")
    throw createError({ statusCode: 400, message: "name is required" });
  if (!Number.isInteger(cycleDays) || cycleDays < 1)
    throw createError({ statusCode: 400, message: "cycleDays must be a positive integer" });
  if (slots !== undefined && !Array.isArray(slots))
    throw createError({ statusCode: 400, message: "slots must be an array" });
  const slotData = Array.isArray(slots)
    ? slots.map((slot: unknown) => validateShiftSlotInput(slot, cycleDays))
    : [];
  const assignmentData = assignment ? validateShiftAssignmentInput(assignment) : null;
  const rotation = await prisma.shiftRotation.create({
    data: {
      integrationId,
      name: name.trim(),
      cycleDays,
      color: color ?? null,
      order: typeof order === "number" ? order : 0,
      ...(slotData.length > 0 && { slots: { create: slotData } }),
      ...(assignmentData && { assignments: { create: [assignmentData] } }),
    },
    include: { slots: { orderBy: { order: "asc" } }, assignments: true },
  });
  return rotation;
});
