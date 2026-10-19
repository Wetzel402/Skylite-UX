import { getRouterParam, readBody } from "h3";

import prisma from "~/lib/prisma";

import {
  ensureShiftsIntegration,
  validateShiftAssignmentUpdate,
  validateShiftSlotUpdate,
} from "../../../../../utils/shiftsIntegration";

function requireId(input: unknown, entity: string): string {
  const id = input && typeof input === "object" && "id" in input ? input.id : undefined;
  if (typeof id !== "string" || !id)
    throw createError({ statusCode: 400, message: `${entity} id is required` });
  return id;
}

export default defineEventHandler(async (event) => {
  const integrationId = getRouterParam(event, "id");
  const rotationId = getRouterParam(event, "rotationId");
  if (!integrationId || !rotationId)
    throw createError({ statusCode: 400, message: "id and rotationId required" });
  await ensureShiftsIntegration(integrationId);
  const body = await readBody(event);
  const { name, cycleDays, color, order, assignment, slots } = body;
  if (cycleDays !== undefined && (!Number.isInteger(cycleDays) || cycleDays < 1))
    throw createError({ statusCode: 400, message: "cycleDays must be a positive integer" });
  if (slots !== undefined && !Array.isArray(slots))
    throw createError({ statusCode: 400, message: "slots must be an array" });

  let effectiveCycleDays: number | undefined = cycleDays;
  if (effectiveCycleDays === undefined && Array.isArray(slots)) {
    const existing = await prisma.shiftRotation.findFirst({
      where: { id: rotationId, integrationId },
    });
    if (!existing)
      throw createError({ statusCode: 404, message: "Rotation not found" });
    effectiveCycleDays = existing.cycleDays;
  }
  const slotUpdates = Array.isArray(slots)
    ? slots.map((slot: unknown) => ({
        id: requireId(slot, "slot"),
        data: validateShiftSlotUpdate(slot, effectiveCycleDays ?? 1),
      }))
    : [];
  const assignmentUpdate = assignment !== undefined
    ? { id: requireId(assignment, "assignment"), data: validateShiftAssignmentUpdate(assignment) }
    : null;

  if (cycleDays !== undefined) {
    const movedSlotIds = slotUpdates
      .filter(s => s.data.dayIndex !== undefined)
      .map(s => s.id);
    const outOfRangeSlot = await prisma.shiftSlot.findFirst({
      where: {
        shiftRotationId: rotationId,
        dayIndex: { gte: cycleDays },
        ...(movedSlotIds.length > 0 && { id: { notIn: movedSlotIds } }),
      },
    });
    if (outOfRangeSlot)
      throw createError({ statusCode: 400, message: "cycleDays is shorter than existing slots" });
  }

  return prisma.$transaction(async (tx) => {
    const rotation = await tx.shiftRotation.updateMany({
      where: { id: rotationId, integrationId },
      data: {
        ...(typeof name === "string" && { name: name.trim() }),
        ...(cycleDays !== undefined && { cycleDays }),
        ...(color !== undefined && { color: color ?? null }),
        ...(typeof order === "number" && { order }),
      },
    });
    if (rotation.count === 0)
      throw createError({ statusCode: 404, message: "Rotation not found" });
    if (assignmentUpdate) {
      const result = await tx.shiftAssignment.updateMany({
        where: { id: assignmentUpdate.id, shiftRotationId: rotationId },
        data: assignmentUpdate.data,
      });
      if (result.count === 0)
        throw createError({ statusCode: 404, message: "Assignment not found" });
    }
    for (const slot of slotUpdates) {
      const result = await tx.shiftSlot.updateMany({
        where: { id: slot.id, shiftRotationId: rotationId },
        data: slot.data,
      });
      if (result.count === 0)
        throw createError({ statusCode: 404, message: "Slot not found" });
    }
    return tx.shiftRotation.findUniqueOrThrow({
      where: { id: rotationId },
      include: { slots: { orderBy: { order: "asc" } }, assignments: true },
    });
  });
});
