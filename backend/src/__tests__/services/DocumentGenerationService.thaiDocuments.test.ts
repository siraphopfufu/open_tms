import { DocumentGenerationService } from '../../services/DocumentGenerationService';

const ORG_ID = 'org-boonchai';

const customer = { id: 'cust-1', name: 'Boonchai Transport Customer Co., Ltd.' };

function buildPrisma(invoice: any): any {
  const orgs: Record<string, any> = {
    [ORG_ID]: { id: ORG_ID, name: 'Boonchai Transport', taxId: '0105551234567', themeConfig: null, logoStorageKey: null },
  };
  return {
    invoice: { findUniqueOrThrow: jest.fn().mockResolvedValue(invoice) },
    organization: {
      // Unscoped lookups would get this other tenant; scoped ones must not.
      findFirst: jest.fn(({ where }: any = {}) =>
        Promise.resolve(where?.id ? orgs[where.id] ?? null : { name: 'Some Other Tenant', taxId: '9999999999999' })),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(orgs[where.id] ?? null)),
    },
  };
}

const newService = (prisma: any) => new DocumentGenerationService(prisma, {} as any, {} as any);

const thbInvoice = {
  id: 'inv-1',
  orgId: ORG_ID,
  invoiceNumber: 'INV-20260924-0001',
  customerId: customer.id,
  customer,
  currency: 'THB',
  issueDate: new Date('2026-09-24'),
  dueDate: new Date('2026-10-24'),
  paymentTermsDays: 30,
  subtotalCents: 1_800_000,
  vatCents: 126_000,
  whtCents: 18_000,
  netPayableCents: 1_908_000,
  notes: null,
  lineItems: [{ description: 'ค่าขนส่งตู้', containerNumber: 'MSKU1234565', totalCents: 1_800_000 }],
};

describe('DocumentGenerationService — Thai tax documents', () => {
  describe('renderInvoiceHtml', () => {
    it('shows VAT, WHT, net payable in words and the container number', async () => {
      const html = await newService(buildPrisma(thbInvoice)).renderInvoiceHtml('inv-1');

      expect(html).toContain('INV-20260924-0001');
      expect(html).toContain('MSKU1234565');
      expect(html).toContain('18000.00');
      expect(html).toContain('1260.00');
      expect(html).toContain('180.00');
      expect(html).toContain('19080.00');
      expect(html).toContain('หนึ่งหมื่นเก้าพันแปดสิบบาทถ้วน');
    });

    it("prints the invoicing org's own tax ID, not another tenant's", async () => {
      const prisma = buildPrisma(thbInvoice);
      const html = await newService(prisma).renderInvoiceHtml('inv-1');

      expect(html).toContain('0105551234567');
      expect(html).not.toContain('9999999999999');
      expect(html).not.toContain('Some Other Tenant');
    });
  });

  describe('renderWithholdingCertificateHtml', () => {
    const cert = {
      certificateNumber: 'WHT-2026-0001',
      issueDate: new Date('2026-09-30'),
      withholdingType: 'pnd53',
      payerName: customer.name,
      payerTaxId: '0105559876543',
      payeeName: 'Boonchai Transport',
      payeeTaxId: '0105551234567',
      incomeDescription: 'ค่าขนส่ง',
      taxableAmountCents: 1_800_000,
      witheldAmountCents: 18_000,
    };

    it('renders the 50-Tawi certificate with the withheld amount in words', async () => {
      const html = await newService(buildPrisma({ ...thbInvoice, withholdingCertificate: cert }))
        .renderWithholdingCertificateHtml('inv-1');

      expect(html).toContain('WHT-2026-0001');
      expect(html).toContain('ภ.ง.ด. 53');
      expect(html).toContain('0105559876543');
      expect(html).toContain('18000.00');
      expect(html).toContain('180.00');
      expect(html).toContain('หนึ่งร้อยแปดสิบบาทถ้วน');
      expect(html).toContain('INV-20260924-0001');
    });

    it('labels an individual payer as ภ.ง.ด. 3', async () => {
      const html = await newService(buildPrisma({ ...thbInvoice, withholdingCertificate: { ...cert, withholdingType: 'pnd3' } }))
        .renderWithholdingCertificateHtml('inv-1');

      expect(html).toContain('ภ.ง.ด. 3');
      expect(html).not.toContain('ภ.ง.ด. 53');
    });

    it('refuses to render before a certificate is issued', async () => {
      await expect(
        newService(buildPrisma({ ...thbInvoice, withholdingCertificate: null })).renderWithholdingCertificateHtml('inv-1'),
      ).rejects.toThrow(/No withholding tax certificate/);
    });
  });

  describe('renderReceiptHtml', () => {
    const receipt = { receiptNumber: 'RC-2026-0001', issueDate: new Date('2026-10-01'), amountCents: 1_908_000, currency: 'THB' };

    it('shows the amount received in figures and words, from the right org', async () => {
      const html = await newService(buildPrisma({ ...thbInvoice, receipt })).renderReceiptHtml('inv-1');

      expect(html).toContain('RC-2026-0001');
      expect(html).toContain('฿19080.00');
      expect(html).toContain('หนึ่งหมื่นเก้าพันแปดสิบบาทถ้วน');
      expect(html).toContain('Boonchai Transport');
      expect(html).not.toContain('Some Other Tenant');
    });

    it('omits the Thai amount-in-words for non-THB receipts', async () => {
      const html = await newService(buildPrisma({ ...thbInvoice, receipt: { ...receipt, currency: 'USD' } }))
        .renderReceiptHtml('inv-1');

      expect(html).toContain('$19080.00');
      expect(html).not.toContain('บาทถ้วน');
    });

    it('refuses to render before a receipt is issued', async () => {
      await expect(
        newService(buildPrisma({ ...thbInvoice, receipt: null })).renderReceiptHtml('inv-1'),
      ).rejects.toThrow(/No receipt/);
    });
  });
});
