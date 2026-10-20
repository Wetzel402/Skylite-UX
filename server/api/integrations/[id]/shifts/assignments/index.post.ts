import { getRouterParam, readBody } from "h3";

import prisma from "~/lib/prisma";

import { ensureShiftsIntegration, validateShiftAssignmentInput } from "../../../../../utils/shiftsIntegration";

export default defineEventHandler(async (event) => {
  const integrationId = getRouterParam(event, "id");
  if (!integrationId)
    throw createError({ statusCode: 400, message: "integration id required" });
  await ensureShiftsIntegration(integrationId);
  const body = await readBody(event);
  const { shiftRotationId } = body;
  if (!shiftRotationId || typeof shiftRotationId !== "string")
    throw createError({ statusCode: 400, message: "shiftRotationId is required" });
  const { userId, startDate, endDate } = validateShiftAssignmentInput(body);
  const rotation = await prisma.shiftRotation.findFirst({
    where: { id: shiftRotationId, integrationId },
  });
  if (!rotation)
    throw createError({ statusCode: 404, message: "Rotation not found" });
  const assignment = await prisma.shiftAssignment.create({
    data: {
      userId: userId ?? undefined,
      shiftRotationId,
      startDate,
      endDate,
    },
    include: {
      user: { select: { id: true, name: true, avatar: true, color: true } },
      shiftRotation: { select: { id: true, name: true, cycleDays: true } },
    },
  });
  return assignment;
});
