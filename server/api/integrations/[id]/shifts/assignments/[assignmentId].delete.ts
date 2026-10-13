import { getRouterParam } from "h3";

import prisma from "~/lib/prisma";

import { ensureShiftsIntegration } from "../../../../../utils/shiftsIntegration";

export default defineEventHandler(async (event) => {
  const integrationId = getRouterParam(event, "id");
  const assignmentId = getRouterParam(event, "assignmentId");
  if (!integrationId || !assignmentId)
    throw createError({ statusCode: 400, message: "id and assignmentId required" });
  await ensureShiftsIntegration(integrationId);
  await prisma.$transaction(async (tx) => {
    const assignment = await tx.shiftAssignment.findFirst({
      where: {
        id: assignmentId,
        shiftRotation: { integrationId },
      },
    });
    if (!assignment)
      throw createError({ statusCode: 404, message: "Assignment not found" });
    await tx.shiftAssignment.delete({ where: { id: assignment.id } });
    const remaining = await tx.shiftAssignment.count({
      where: { shiftRotationId: assignment.shiftRotationId },
    });
    if (remaining === 0)
      await tx.shiftRotation.delete({ where: { id: assignment.shiftRotationId } });
  });
  return { ok: true };
});
