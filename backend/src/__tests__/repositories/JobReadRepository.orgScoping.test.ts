import { JobReadRepository } from '../../repositories/JobReadRepository';

const ORG = 'org-1';

function buildPrisma() {
  return {
    order: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    orderShipment: { findFirst: jest.fn().mockResolvedValue(null) },
    shipment: { findMany: jest.fn().mockResolvedValue([]) },
    charge: { findMany: jest.fn().mockResolvedValue([]) },
    attachment: { findMany: jest.fn().mockResolvedValue([]) },
    invoiceLineItem: { findMany: jest.fn().mockResolvedValue([]) },
    driverAdvance: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('JobReadRepository — tenancy', () => {
  it('listJobs filters by org and caps the page size', async () => {
    const prisma = buildPrisma();
    await new JobReadRepository(prisma).listJobs(ORG, { search: 'MSKU', limit: 10_000 });
    const args = prisma.order.findMany.mock.calls[0][0];
    expect(args.where.orgId).toBe(ORG);
    expect(args.take).toBe(100);
  });

  it('findJobId narrows every identifier to the org', async () => {
    const prisma = buildPrisma();
    const repo = new JobReadRepository(prisma);
    await repo.findJobId(ORG, { jobId: 'a0000000-0000-0000-0000-000000000000', orderNumber: 'ORD-1', containerNumber: 'MSKU 1234565' });

    for (const call of prisma.order.findFirst.mock.calls) expect(call[0].where.orgId).toBe(ORG);
    const link = prisma.orderShipment.findFirst.mock.calls[0][0].where;
    expect(link.order.orgId).toBe(ORG);
    expect(link.shipment.orgId).toBe(ORG);
    expect(link.shipment.shippingContainer.containerNumber.equals).toBe('MSKU1234565');
  });

  it('getJobDetail returns null for another org’s job and never loads its shipments', async () => {
    const prisma = buildPrisma();
    expect(await new JobReadRepository(prisma).getJobDetail(ORG, 'other-orgs-job')).toBeNull();
    expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({ id: 'other-orgs-job', orgId: ORG });
    expect(prisma.shipment.findMany).not.toHaveBeenCalled();
  });

  it('getJobDetail also scopes the shipment query by org', async () => {
    const prisma = buildPrisma();
    prisma.order.findFirst.mockResolvedValue({ id: 'job-1', orderShipments: [{ shipmentId: 's1' }] });
    await new JobReadRepository(prisma).getJobDetail(ORG, 'job-1');
    expect(prisma.shipment.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['s1'] }, orgId: ORG });
  });

  it('listUnsettledAdvances and revenueSummary filter by org', async () => {
    const prisma = buildPrisma();
    const repo = new JobReadRepository(prisma);
    await repo.listUnsettledAdvances(ORG);
    await repo.revenueSummary(ORG, new Date('2026-09-01'), new Date('2026-09-30'));
    expect(prisma.driverAdvance.findMany.mock.calls[0][0].where.orgId).toBe(ORG);
    expect(prisma.charge.findMany.mock.calls[0][0].where.shipment.orgId).toBe(ORG);
  });

  it('revenueSummary totals per customer, largest first', async () => {
    const prisma = buildPrisma();
    prisma.charge.findMany.mockResolvedValue([
      { amountCents: 100, currency: 'THB', shipment: { customer: { name: 'A' } } },
      { amountCents: 500, currency: 'THB', shipment: { customer: { name: 'B' } } },
      { amountCents: 50, currency: 'THB', shipment: { customer: { name: 'A' } } },
    ]);
    const out = await new JobReadRepository(prisma).revenueSummary(ORG, new Date(), new Date());
    expect(out.totalCents).toBe(650);
    expect(out.customers).toEqual([
      { customerName: 'B', totalCents: 500, chargeCount: 1 },
      { customerName: 'A', totalCents: 150, chargeCount: 2 },
    ]);
  });
});
