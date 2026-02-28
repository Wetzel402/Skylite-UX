import prisma from "~/lib/prisma";

import { broadcastHomeUpdate } from "../../utils/broadcastHomeUpdate";

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, "id");

    if (!id) {
      throw createError({
        statusCode: 400,
        message: "Meal plan ID is required",
      });
    }

    await prisma.mealPlan.delete({
      where: { id },
    });

    broadcastHomeUpdate("meals_update").catch(() => {});

    return { success: true };
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to delete meal plan: ${error}`,
    });
  }
});
