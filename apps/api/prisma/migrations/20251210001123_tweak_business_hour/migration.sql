/*
  Warnings:

  - A unique constraint covering the columns `[weekday]` on the table `BusinessHour` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- AlterTable
ALTER TABLE "BusinessHour" ALTER COLUMN "openMinutes" DROP NOT NULL,
ALTER COLUMN "closeMinutes" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHour_weekday_key" ON "BusinessHour"("weekday");
