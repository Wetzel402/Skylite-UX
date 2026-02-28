import prisma from "~/lib/prisma";

import { broadcastHomeUpdate } from "../../utils/broadcastHomeUpdate";

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, "id");

    if (!id) {
      throw createError({
        statusCode: 400,
        message: "Todo ID is required",
      });
    }

    await prisma.todo.delete({
      where: { id },
    });

    broadcastHomeUpdate("todos_update").catch(() => {});
    broadcastHomeUpdate("countdowns_update").catch(() => {});

    return { success: true };
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to delete todo: ${error}`,
    });
  }
});
