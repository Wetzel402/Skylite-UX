import { getRouterParam, readBody } from "h3";

import prisma from "~/lib/prisma";

import { ensureShiftsIntegration, validateShiftSlotUpdate } from "../../../../../../../utils/shiftsIntegration";

export default defineEventHandler(async (event) => {
  const integrationId = getRouterParam(event, "id");
  const rotationId = getRouterParam(event, "rotationId");
  const slotId = getRouterParam(event, "slotId");
  if (!integrationId || !rotationId || !slotId)
    throw createError({ statusCode: 400, message: "id, rotationId and slotId required" });
  await ensureShiftsIntegration(integrationId);
  const rotation = await prisma.shiftRotation.findFirst({
    where: { id: rotationId, integrationId },
  });
  if (!rotation)
    throw createError({ statusCode: 404, message: "Rotation not found" });
  const body = await readBody(event);
  const result = await prisma.shiftSlot.updateMany({
    where: { id: slotId, shiftRotationId: rotationId },
    data: validateShiftSlotUpdate(body, rotation.cycleDays),
  });
  if (result.count === 0)
    throw createError({ statusCode: 404, message: "Slot not found" });
  return prisma.shiftSlot.findUniqueOrThrow({ where: { id: slotId } });
});
