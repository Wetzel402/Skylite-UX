import prisma from "~/lib/prisma";

import { broadcastHomeUpdate } from "../../utils/broadcastHomeUpdate";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { todoId, direction, todoColumnId } = body;

    if (!todoId || !direction) {
      throw createError({
        statusCode: 400,
        message: "Todo ID and direction are required",
      });
    }

    const currentTodo = await prisma.todo.findUnique({
      where: { id: todoId },
    });

    if (!currentTodo) {
      throw createError({
        statusCode: 404,
        message: "Todo not found",
      });
    }

    const todos = await prisma.todo.findMany({
      where: {
        todoColumnId: todoColumnId || null,
        completed: currentTodo.completed,
      },
      orderBy: { order: "asc" },
    });

    const currentIndex = todos.findIndex(t => t.id === todoId);
    if (currentIndex === -1)
      return currentTodo;

    let targetIndex;
    if (direction === "up" && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    }
    else if (direction === "down" && currentIndex < todos.length - 1) {
      targetIndex = currentIndex + 1;
    }
    else {
      return currentTodo;
    }

    const targetTodo = todos[targetIndex];
    if (!targetTodo) {
      return currentTodo;
    }
    const tempOrder = currentTodo.order;

    await prisma.$transaction([
      prisma.todo.update({
        where: { id: todoId },
        data: { order: targetTodo.order },
      }),
      prisma.todo.update({
        where: { id: targetTodo.id },
        data: { order: tempOrder },
      }),
    ]);

    const updatedTodo = await prisma.todo.findUnique({
      where: { id: todoId },
      include: {
        todoColumn: {
          select: {
            id: true,
            name: true,
            order: true,
            isDefault: true,
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    broadcastHomeUpdate("todos_update").catch(() => {});

    return updatedTodo;
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to reorder todo: ${error}`,
    });
  }
});
