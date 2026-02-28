import prisma from "~/lib/prisma";

import { broadcastHomeUpdate } from "../../utils/broadcastHomeUpdate";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { todoIds } = body;

    const updatePromises = todoIds.map((id: string, index: number) =>
      prisma.todo.update({
        where: { id },
        data: { order: index },
      }),
    );

    await Promise.all(updatePromises);

    broadcastHomeUpdate("todos_update").catch(() => {});

    return { success: true };
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to reorder todo: ${error}`,
    });
  }
});
