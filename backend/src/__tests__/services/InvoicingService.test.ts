import { InvoicingService } from '../../services/InvoicingService';

const customer = {
  id: 'cust-1',
  name: 'Acme',
  paymentTermsDays: 30,
  currency: 'USD',
};

function buildCharge(overrides: any = {}) {
  return {
    id: overrides.id ?? `chg-${Math.random()}`,
    shipmentId: overrides.shipmentId ?? null,
    orderId: overrides.orderId ?? null,
    chargeType: 'linehaul',
    description: 'linehaul',
    amountCents: overrides.amountCents ?? 10000,
    currency: 'USD',
    freightClass: null,
    status: 'approved',
    chargeCategory: 'revenue',
    ...overrides,
  };
}

describe('InvoicingService — batching', () => {
  describe('generateFromShipments', () => {
    it('fetches charges in a single batch query for all shipments', async () => {
      const charges = [
        buildCharge({ id: 'c1', shipmentId: 's1', amountCents: 10000 }),
        buildCharge({ id: 'c2', shipmentId: 's2', amountCents: 5000 }),
        buildCharge({ id: 'c3', shipmentId: 's3', amountCents: 7500 }),
      ];

      const chargeRepo: any = {
        findAll: jest.fn().mockResolvedValue(charges),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        update: jest.fn(),
      };
      const invoiceRepo: any = {
        getNextInvoiceNumber: jest.fn().mockResolvedValue('INV-001'),
        create: jest.fn().mockResolvedValue({ id: 'inv-1' }),
        addLineItems: jest.fn(),
        findById: jest.fn().mockResolvedValue({ id: 'inv-1', lineItems: [] }),
      };
      const prisma: any = {
        customer: { findUnique: jest.fn().mockResolvedValue(customer) },
        shipmentFinancialSummary: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      };

      const svc = new InvoicingService(invoiceRepo, chargeRepo, prisma);
      await svc.generateFromShipments({
        orgId: 'org-1',
        customerId: 'cust-1',
        shipmentIds: ['s1', 's2', 's3'],
      });

      // Critical: one batched findAll call, not three (one per shipment)
      expect(chargeRepo.findAll).toHaveBeenCalledTimes(1);
      expect(chargeRepo.findAll).toHaveBeenCalledWith({
        shipmentIds: ['s1', 's2', 's3'],
        chargeCategory: 'revenue',
        status: 'approved',
      });

      // updateMany batches the status flip rather than calling update() per charge
      expect(chargeRepo.update).not.toHaveBeenCalled();
      expect(chargeRepo.updateMany).toHaveBeenCalledWith(['c1', 'c2', 'c3'], { status: 'invoiced' });

      // ShipmentFinancialSummary update is also batched via `in:`
      expect(prisma.shipmentFinancialSummary.updateMany).toHaveBeenCalledTimes(1);
      const where = prisma.shipmentFinancialSummary.updateMany.mock.calls[0][0].where;
      expect(where.shipmentId.in).toEqual(['s1', 's2', 's3']);
    });

    it('throws if no approved revenue charges exist', async () => {
      const chargeRepo: any = {
        findAll: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        update: jest.fn(),
      };
      const invoiceRepo: any = {};
      const prisma: any = {
        customer: { findUnique: jest.fn().mockResolvedValue(customer) },
      };

      const svc = new InvoicingService(invoiceRepo, chargeRepo, prisma);
      await expect(
        svc.generateFromShipments({ orgId: 'org-1', customerId: 'cust-1', shipmentIds: ['s1'] })
      ).rejects.toThrow(/No approved revenue charges/);
    });
  });

  describe('findReadyToInvoice', () => {
    const shipment = (id: string) => ({
      id, reference: `SH-${id}`, customerId: 'cust-1', deliveryDate: null, customer: { name: 'Acme' },
    });

    function buildPrisma(opts: {
      shipments: any[];
      podShipmentIds?: string[];
      invoicedShipmentIds?: string[];
    }): any {
      return {
        shipment: { findMany: jest.fn().mockResolvedValue(opts.shipments) },
        attachment: {
          findMany: jest.fn().mockResolvedValue((opts.podShipmentIds ?? []).map(entityId => ({ entityId }))),
        },
        invoiceLineItem: {
          findMany: jest.fn().mockResolvedValue((opts.invoicedShipmentIds ?? []).map(shipmentId => ({ shipmentId }))),
        },
      };
    }

    it('uses one batch query each for charges, POD attachments and existing invoice lines', async () => {
      const charges = [
        buildCharge({ id: 'c1', shipmentId: 's1', amountCents: 100 }),
        buildCharge({ id: 'c2', shipmentId: 's1', amountCents: 50 }),
        buildCharge({ id: 'c3', shipmentId: 's2', amountCents: 200 }),
        // s3 has no charges
      ];
      const chargeRepo: any = { findAll: jest.fn().mockResolvedValue(charges) };
      const prisma = buildPrisma({
        shipments: [shipment('s1'), shipment('s2'), shipment('s3')],
        podShipmentIds: ['s1', 's2', 's3'],
      });

      const svc = new InvoicingService({} as any, chargeRepo, prisma);
      const result = await svc.findReadyToInvoice('org-1');

      expect(chargeRepo.findAll).toHaveBeenCalledTimes(1);
      expect(chargeRepo.findAll).toHaveBeenCalledWith({
        shipmentIds: ['s1', 's2', 's3'],
        chargeCategory: 'revenue',
        status: 'approved',
      });
      expect(prisma.attachment.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.attachment.findMany.mock.calls[0][0].where).toEqual({
        entityType: 'shipment',
        entityId: { in: ['s1', 's2', 's3'] },
      });
      expect(prisma.invoiceLineItem.findMany).toHaveBeenCalledTimes(1);

      // s1 -> 150, s2 -> 200, s3 -> excluded (no charges)
      expect(result).toHaveLength(2);
      const s1 = result.find((r) => r.shipmentId === 's1')!;
      expect(s1.totalRevenueCents).toBe(150);
      expect(s1.chargeCount).toBe(2);
      expect(result.find((r) => r.shipmentId === 's2')!.totalRevenueCents).toBe(200);
      expect(result.find((r) => r.shipmentId === 's3')).toBeUndefined();
    });

    it('only considers completed, live shipments scoped to the org (and customer when given)', async () => {
      const prisma = buildPrisma({ shipments: [] });
      const svc = new InvoicingService({} as any, { findAll: jest.fn() } as any, prisma);

      await svc.findReadyToInvoice('org-1', 'cust-9');

      expect(prisma.shipment.findMany.mock.calls[0][0].where).toEqual({
        orgId: 'org-1',
        status: 'complete',
        archived: false,
        deletedAt: null,
        customerId: 'cust-9',
      });
    });

    it('excludes shipments without a delivery document attached', async () => {
      const chargeRepo: any = {
        findAll: jest.fn().mockResolvedValue([
          buildCharge({ shipmentId: 's1' }),
          buildCharge({ shipmentId: 's2' }),
        ]),
      };
      const prisma = buildPrisma({ shipments: [shipment('s1'), shipment('s2')], podShipmentIds: ['s2'] });

      const result = await new InvoicingService({} as any, chargeRepo, prisma).findReadyToInvoice('org-1');

      expect(result.map(r => r.shipmentId)).toEqual(['s2']);
    });

    it('excludes shipments that already appear on an invoice', async () => {
      const chargeRepo: any = {
        findAll: jest.fn().mockResolvedValue([
          buildCharge({ shipmentId: 's1' }),
          buildCharge({ shipmentId: 's2' }),
        ]),
      };
      const prisma = buildPrisma({
        shipments: [shipment('s1'), shipment('s2')],
        podShipmentIds: ['s1', 's2'],
        invoicedShipmentIds: ['s1'],
      });

      const result = await new InvoicingService({} as any, chargeRepo, prisma).findReadyToInvoice('org-1');

      expect(result.map(r => r.shipmentId)).toEqual(['s2']);
    });

    it('returns empty array without further queries when no shipment is complete', async () => {
      const chargeRepo: any = { findAll: jest.fn() };
      const prisma = buildPrisma({ shipments: [] });

      const result = await new InvoicingService({} as any, chargeRepo, prisma).findReadyToInvoice('org-1');

      expect(result).toEqual([]);
      expect(chargeRepo.findAll).not.toHaveBeenCalled();
      expect(prisma.attachment.findMany).not.toHaveBeenCalled();
    });
  });
});
