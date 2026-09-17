-- Fleet compliance (Must Have #20): tax/insurance/ตรอ inspection expiry
-- tracking per Vehicle (tractor or trailer-registered-as-Vehicle).
-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "inspectionExpiryDate" TIMESTAMP(3),
ADD COLUMN     "insuranceExpiryDate" TIMESTAMP(3),
ADD COLUMN     "taxExpiryDate" TIMESTAMP(3);

-- Official receipt (Must Have #17): numbered separately from the invoice
-- sequence, issued once a payment is recorded.
-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_invoiceId_key" ON "Receipt"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "Receipt_orgId_idx" ON "Receipt"("orgId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
