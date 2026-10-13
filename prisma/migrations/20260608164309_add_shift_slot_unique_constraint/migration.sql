/*
  Warnings:

  - A unique constraint covering the columns `[shiftRotationId,weekIndex,dayOfWeek]` on the table `shift_slots` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "shift_slots_shiftRotationId_weekIndex_dayOfWeek_key" ON "shift_slots"("shiftRotationId", "weekIndex", "dayOfWeek");
