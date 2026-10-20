import { getRouterParam, readBody } from "h3";

import prisma from "~/lib/prisma";

import { ensureShiftsIntegration, validateShiftAssignmentUpdate } from "../../../../../utils/shiftsIntegration";

export default defineEventHandler(async (event) => {
  const integrationId = getRouterParam(event, "id");
  const assignmentId = getRouterParam(event, "assignmentId");
  if (!integrationId || !assignmentId)
    throw createError({ statusCode: 400, message: "id and assignmentId required" });
  await ensureShiftsIntegration(integrationId);
  const body = await readBody(event);
  const result = await prisma.shiftAssignment.updateMany({
    where: {
      id: assignmentId,
      shiftRotation: { integrationId },
    },
    data: validateShiftAssignmentUpdate(body),
  });
  if (result.count === 0)
    throw createError({ statusCode: 404, message: "Assignment not found" });
  return prisma.shiftAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      user: { select: { id: true, name: true, avatar: true, color: true } },
      shiftRotation: { select: { id: true, name: true, cycleDays: true } },
    },
  });
});
