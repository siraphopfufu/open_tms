-- Thai container drayage (Sprint 1): ISO shipping containers, plus the EIR / weighbridge
-- tickets a trip generates. See tms_evaluation_feedback_report.md section 4.

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "operatorCompany" TEXT,
ADD COLUMN     "terminalCode" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "shippingContainerId" TEXT;

-- CreateTable
CREATE TABLE "ShippingContainer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "containerNumber" TEXT NOT NULL,
    "sizeType" TEXT NOT NULL,
    "sealNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'empty',
    "shippingLine" TEXT,
    "bookingNumber" TEXT,
    "billOfLadingNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingContainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EirTicket" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "locationId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EirTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightTicket" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "ticketNumber" TEXT,
    "grossWeightKg" DOUBLE PRECISION NOT NULL,
    "tareWeightKg" DOUBLE PRECISION,
    "netWeightKg" DOUBLE PRECISION,
    "isOverweight" BOOLEAN NOT NULL DEFAULT false,
    "locationId" TEXT,
    "weighedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingContainer_containerNumber_key" ON "ShippingContainer"("containerNumber");

-- CreateIndex
CREATE INDEX "ShippingContainer_orgId_idx" ON "ShippingContainer"("orgId");

-- CreateIndex
CREATE INDEX "ShippingContainer_status_idx" ON "ShippingContainer"("status");

-- CreateIndex
CREATE INDEX "EirTicket_orgId_idx" ON "EirTicket"("orgId");

-- CreateIndex
CREATE INDEX "EirTicket_shipmentId_idx" ON "EirTicket"("shipmentId");

-- CreateIndex
CREATE INDEX "WeightTicket_orgId_idx" ON "WeightTicket"("orgId");

-- CreateIndex
CREATE INDEX "WeightTicket_shipmentId_idx" ON "WeightTicket"("shipmentId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_shippingContainerId_fkey" FOREIGN KEY ("shippingContainerId") REFERENCES "ShippingContainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EirTicket" ADD CONSTRAINT "EirTicket_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EirTicket" ADD CONSTRAINT "EirTicket_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightTicket" ADD CONSTRAINT "WeightTicket_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightTicket" ADD CONSTRAINT "WeightTicket_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
