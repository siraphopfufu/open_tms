-- Thai finance & withholding tax (Sprint 2): VAT/WHT breakdown on invoices,
-- container numbers on line items, and 50-Tawi withholding tax certificates.
-- See tms_evaluation_feedback_report.md section 5.1.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "netPayableCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whtCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN     "containerNumber" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "taxId" TEXT;

-- CreateTable
CREATE TABLE "WithholdingTaxCertificate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "payerTaxId" TEXT,
    "payeeName" TEXT NOT NULL,
    "payeeTaxId" TEXT,
    "withholdingType" TEXT NOT NULL DEFAULT 'pnd53',
    "incomeDescription" TEXT NOT NULL DEFAULT 'ค่าจ้างขนส่ง (มาตรา 3 เตรส)',
    "taxableAmountCents" INTEGER NOT NULL,
    "witheldAmountCents" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithholdingTaxCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WithholdingTaxCertificate_invoiceId_key" ON "WithholdingTaxCertificate"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "WithholdingTaxCertificate_certificateNumber_key" ON "WithholdingTaxCertificate"("certificateNumber");

-- CreateIndex
CREATE INDEX "WithholdingTaxCertificate_orgId_idx" ON "WithholdingTaxCertificate"("orgId");

-- AddForeignKey
ALTER TABLE "WithholdingTaxCertificate" ADD CONSTRAINT "WithholdingTaxCertificate_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
