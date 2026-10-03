-- CreateTable
CREATE TABLE "ReportingWeatherDailyFact" (
    "storeStableId" TEXT NOT NULL,
    "localDate" VARCHAR(10) NOT NULL,
    "timezone" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "observationHours" INTEGER NOT NULL,
    "temperatureAvgC" DOUBLE PRECISION,
    "temperatureMinC" DOUBLE PRECISION,
    "temperatureMaxC" DOUBLE PRECISION,
    "precipitationMm" DOUBLE PRECISION,
    "snowDepthMm" DOUBLE PRECISION,
    "windSpeedKph" DOUBLE PRECISION,
    "peakWindGustKph" DOUBLE PRECISION,
    "sunshineMinutes" DOUBLE PRECISION,
    "significantCondition" TEXT,
    "refreshedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingWeatherDailyFact_pkey" PRIMARY KEY ("storeStableId","localDate")
);

-- CreateIndex
CREATE INDEX "ReportingWeatherDailyFact_localDate_idx" ON "ReportingWeatherDailyFact"("localDate");

-- CreateIndex
CREATE INDEX "ReportingWeatherDailyFact_status_refreshedAt_idx" ON "ReportingWeatherDailyFact"("status", "refreshedAt");
