import prisma from "~/lib/prisma";

import { broadcastHomeUpdate } from "../../utils/broadcastHomeUpdate";

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, "id");

    if (!id) {
      throw createError({
        statusCode: 400,
        message: "Calendar event ID is required",
      });
    }

    const isExpandedEvent = id.includes("-");
    let actualId = id;

    if (isExpandedEvent) {
      actualId = id.split("-")[0] || id;
    }

    const existingEvent = await prisma.calendarEvent.findUnique({
      where: { id: actualId },
    });

    if (!existingEvent) {
      throw createError({
        statusCode: 404,
        message: "Calendar event not found",
      });
    }

    await prisma.calendarEvent.delete({
      where: { id: actualId },
    });

    broadcastHomeUpdate("events_update").catch(() => {});
    return {
      success: true,
      message: isExpandedEvent
        ? "Entire recurring series deleted"
        : "Event deleted successfully",
    };
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to delete calendar event: ${error}`,
    });
  }
});
