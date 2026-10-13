import { getRouterParam, readBody } from "h3";

import prisma from "~/lib/prisma";

import { ensureShiftsIntegration, validateShiftSlotInput } from "../../../../../../../utils/shiftsIntegration";

export default defineEventHandler(async (event) => {
  const integrationId = getRouterParam(event, "id");
  const rotationId = getRouterParam(event, "rotationId");
  if (!integrationId || !rotationId)
    throw createError({ statusCode: 400, message: "id and rotationId required" });
  await ensureShiftsIntegration(integrationId);
  const rotation = await prisma.shiftRotation.findFirst({
    where: { id: rotationId, integrationId },
  });
  if (!rotation)
    throw createError({ statusCode: 404, message: "Rotation not found" });
  const body = await readBody(event);
  const slot = await prisma.shiftSlot.create({
    data: {
      shiftRotationId: rotationId,
      ...validateShiftSlotInput(body, rotation.cycleDays),
    },
  });
  return slot;
});
