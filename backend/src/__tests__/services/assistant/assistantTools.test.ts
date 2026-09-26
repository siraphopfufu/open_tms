import { AssistantToolExecutor, ASSISTANT_TOOLS } from '../../../services/assistant/assistantTools';

const ORG = 'org-1';

function setup() {
  const jobs = {
    listJobs: jest.fn().mockResolvedValue([{ id: 'job-1', orderNumber: 'ORD-001', customerName: 'Boonchai' }]),
    findJobId: jest.fn().mockResolvedValue('job-1'),
    getJobDetail: jest.fn().mockResolvedValue({
      id: 'job-1',
      orderNumber: 'ORD-001',
      containers: [{
        reference: 'ORD-001-1', status: 'complete', container: { containerNumber: 'MSKU1234565', sizeType: '40HC' },
        vehicle: { plate: '70-1234', carrierName: 'Own Fleet', isOwnFleet: true }, trailerPlate: null,
        driver: { name: 'สมชาย' }, advance: { totalAdvanceCents: 135_000 }, netSettlementCents: 2_500,
        isOverBenchmark: false, podReceived: true, revenueCents: 1_800_000, totalActualCostCents: 132_500,
        grossMarginCents: 1_667_500, invoiceNumber: null, invoiceStatus: null,
      }],
    }),
    listUnsettledAdvances: jest.fn().mockResolvedValue([]),
    revenueSummary: jest.fn().mockResolvedValue({ currency: 'THB', totalCents: 3_550_000, customers: [{ customerName: 'Boonchai', totalCents: 3_550_000, chargeCount: 2 }] }),
  };
  const invoicing = {
    findReadyToInvoice: jest.fn().mockResolvedValue([
      { shipmentId: 's1', shipmentReference: 'ORD-001-1', customerId: 'c1', customerName: 'Boonchai Transport', totalRevenueCents: 1_800_000, chargeCount: 1, deliveredAt: null },
      { shipmentId: 's2', shipmentReference: 'ORD-002-1', customerId: 'c2', customerName: 'Other Co', totalRevenueCents: 500_000, chargeCount: 1, deliveredAt: null },
    ]),
  };
  return { jobs, invoicing, exec: new AssistantToolExecutor(jobs as any, invoicing as any) };
}

describe('AssistantToolExecutor', () => {
  it('declares exactly the read-only tools', () => {
    expect(ASSISTANT_TOOLS.map(t => t.name).sort()).toEqual(
      ['get_job', 'list_ready_to_invoice', 'list_unsettled_advances', 'revenue_summary', 'search_jobs'],
    );
  });

  it('always scopes by the orgId it is given, whatever the model sends', async () => {
    const { jobs, invoicing, exec } = setup();
    await exec.execute(ORG, 'search_jobs', { search: 'MSKU', orgId: 'org-evil' });
    await exec.execute(ORG, 'get_job', { container_number: 'MSKU1234565' });
    await exec.execute(ORG, 'list_ready_to_invoice', {});
    await exec.execute(ORG, 'list_unsettled_advances', {});
    await exec.execute(ORG, 'revenue_summary', { from: '2026-09-01', to: '2026-09-30' });

    expect(jobs.listJobs.mock.calls[0][0]).toBe(ORG);
    expect(jobs.findJobId.mock.calls[0][0]).toBe(ORG);
    expect(jobs.getJobDetail.mock.calls[0][0]).toBe(ORG);
    expect(invoicing.findReadyToInvoice).toHaveBeenCalledWith(ORG);
    expect(jobs.listUnsettledAdvances.mock.calls[0][0]).toBe(ORG);
    expect(jobs.revenueSummary.mock.calls[0][0]).toBe(ORG);
  });

  it('rejects unknown tools and invalid input as tool errors instead of throwing', async () => {
    const { exec, jobs } = setup();
    expect(await exec.execute(ORG, 'delete_everything', {})).toMatchObject({ isError: true });
    expect(await exec.execute(ORG, 'get_job', {})).toMatchObject({ isError: true });
    expect(await exec.execute(ORG, 'revenue_summary', { from: 'last month', to: '2026-09-30' })).toMatchObject({ isError: true });
    expect(await exec.execute(ORG, 'search_jobs', { limit: 5000 })).toMatchObject({ isError: true });
    expect(jobs.listJobs).not.toHaveBeenCalled();
  });

  it('get_job returns baht, never satang, and links the job', async () => {
    const { exec } = setup();
    const out = await exec.execute(ORG, 'get_job', { container_number: 'MSKU1234565' });
    const c = (out.result as any).job.containers[0];
    expect(c).toMatchObject({ containerNumber: 'MSKU1234565', revenueBaht: 18000, advanceBaht: 1350, marginBaht: 16675, podReceived: true, settled: true });
    expect(JSON.stringify(out.result)).not.toContain('Cents');
    expect(out.jobRefs).toEqual([{ jobId: 'job-1', orderNumber: 'ORD-001' }]);
  });

  it('get_job reports not-found without leaking anything', async () => {
    const { exec, jobs } = setup();
    jobs.findJobId.mockResolvedValueOnce(null);
    expect(await exec.execute(ORG, 'get_job', { order_number: 'NOPE' })).toEqual({ result: { found: false }, isError: false, jobRefs: [] });
    expect(jobs.getJobDetail).not.toHaveBeenCalled();
  });

  it('filters ready-to-invoice by customer name and totals it in baht', async () => {
    const { exec } = setup();
    const out = await exec.execute(ORG, 'list_ready_to_invoice', { customer_name: 'boonchai' });
    expect(out.result).toMatchObject({ count: 1, totalBaht: 18000, shipments: [{ shipmentReference: 'ORD-001-1' }] });
  });

  it('reads revenue date ranges as whole Bangkok days', async () => {
    const { exec, jobs } = setup();
    await exec.execute(ORG, 'revenue_summary', { from: '2026-09-01', to: '2026-09-30' });
    const [, from, to] = jobs.revenueSummary.mock.calls[0];
    expect((from as Date).toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect((to as Date).toISOString()).toBe('2026-09-30T16:59:59.999Z');
  });
});
