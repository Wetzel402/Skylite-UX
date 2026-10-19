import type { Prisma } from "@prisma/client";

import prisma from "~/lib/prisma";

type UserAssignable = {
  user?: unknown;
  useUserColors?: unknown;
};

function withoutUser<T extends UserAssignable>(entry: T, userId: string): T | null {
  if (!Array.isArray(entry.user) || !entry.user.includes(userId))
    return null;
  const user = entry.user.filter(id => id !== userId);
  return {
    ...entry,
    user,
    ...(user.length === 0 && { useUserColors: false }),
  };
}

function removeUserFromSettings(settings: unknown, userId: string): Prisma.InputJsonObject | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    return null;

  let changed = false;
  let result = { ...(settings as Record<string, unknown>) };

  const topLevel = withoutUser(result, userId);
  if (topLevel) {
    result = topLevel;
    changed = true;
  }

  if (Array.isArray(result.calendars)) {
    result.calendars = result.calendars.map((calendar: unknown) => {
      if (!calendar || typeof calendar !== "object")
        return calendar;
      const cleaned = withoutUser(calendar as UserAssignable, userId);
      if (!cleaned)
        return calendar;
      changed = true;
      return cleaned;
    });
  }

  return changed ? (result as Prisma.InputJsonObject) : null;
}

export default defineEventHandler(async (event) => {
  try {
    const userId = getRouterParam(event, "id");

    if (!userId) {
      throw createError({
        statusCode: 400,
        message: "User ID is required",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        todoColumn: {
          include: {
            todos: true,
          },
        },
      },
    });

    if (!existingUser) {
      throw createError({
        statusCode: 404,
        message: "User not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      if (existingUser.todoColumn && existingUser.todoColumn.todos.length > 0) {
        await tx.todo.deleteMany({
          where: { todoColumnId: existingUser.todoColumn.id },
        });
      }

      if (existingUser.todoColumn) {
        await tx.todoColumn.delete({
          where: { id: existingUser.todoColumn.id },
        });
      }

      const integrations = await tx.integration.findMany({
        select: { id: true, settings: true },
      });
      for (const integration of integrations) {
        const settings = removeUserFromSettings(integration.settings, userId);
        if (settings) {
          await tx.integration.update({
            where: { id: integration.id },
            data: { settings },
          });
        }
      }

      await tx.user.delete({
        where: { id: userId },
      });
    });

    return { success: true };
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to delete user: ${error}`,
    });
  }
});
