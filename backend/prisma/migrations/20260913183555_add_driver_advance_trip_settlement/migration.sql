-- Driver advance & trip settlement (Thai drayage): approve a cash advance
-- before a trip, record fuel receipts after, reconcile against a fuel
-- benchmark. See tms_evaluation_feedback_report.md section 5.4.

-- AlterTable
ALTER TABLE "Carrier" ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "standardAllowanceCents" INTEGER;

-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "trailerPlate" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "standardKmPerLiter" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "DriverAdvance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT,
    "fuelEstimateCents" INTEGER NOT NULL DEFAULT 0,
    "tollEstimateCents" INTEGER NOT NULL DEFAULT 0,
    "allowanceCents" INTEGER NOT NULL DEFAULT 0,
    "totalAdvanceCents" INTEGER NOT NULL,
    "transferMethod" TEXT NOT NULL DEFAULT 'cash',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelTransaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "liters" DOUBLE PRECISION NOT NULL,
    "pricePerLiterCents" INTEGER NOT NULL,
    "totalCostCents" INTEGER NOT NULL,
    "odometerKm" DOUBLE PRECISION,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSettlement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "vehicleKmPerLiter" DOUBLE PRECISION NOT NULL,
    "dieselPriceCentsPerLiter" INTEGER NOT NULL,
    "expectedFuelCostCents" INTEGER NOT NULL,
    "actualFuelCostCents" INTEGER NOT NULL,
    "actualTollCents" INTEGER NOT NULL DEFAULT 0,
    "allowanceCents" INTEGER NOT NULL DEFAULT 0,
    "fuelVariancePercent" DOUBLE PRECISION NOT NULL,
    "isOverBenchmark" BOOLEAN NOT NULL DEFAULT false,
    "totalAdvanceCents" INTEGER NOT NULL,
    "totalActualCostCents" INTEGER NOT NULL,
    "netSettlementCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledBy" TEXT,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverAdvance_shipmentId_key" ON "DriverAdvance"("shipmentId");

-- CreateIndex
CREATE INDEX "DriverAdvance_orgId_idx" ON "DriverAdvance"("orgId");

-- CreateIndex
CREATE INDEX "DriverAdvance_driverId_idx" ON "DriverAdvance"("driverId");

-- CreateIndex
CREATE INDEX "FuelTransaction_orgId_idx" ON "FuelTransaction"("orgId");

-- CreateIndex
CREATE INDEX "FuelTransaction_shipmentId_idx" ON "FuelTransaction"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TripSettlement_shipmentId_key" ON "TripSettlement"("shipmentId");

-- CreateIndex
CREATE INDEX "TripSettlement_orgId_idx" ON "TripSettlement"("orgId");

-- CreateIndex
CREATE INDEX "TripSettlement_driverId_idx" ON "TripSettlement"("driverId");

-- CreateIndex
CREATE INDEX "TripSettlement_status_idx" ON "TripSettlement"("status");

-- AddForeignKey
ALTER TABLE "DriverAdvance" ADD CONSTRAINT "DriverAdvance_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAdvance" ADD CONSTRAINT "DriverAdvance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
