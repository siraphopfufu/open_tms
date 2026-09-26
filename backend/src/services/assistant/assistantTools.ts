/**
 * Read-only tools the shipment assistant may call. Each one is scoped to the
 * caller's org by the executor: orgId comes from the authenticated request,
 * never from the model, so no tool input can reach another tenant's data.
 *
 * Money is converted from satang to baht here so the model never does unit
 * arithmetic on cents.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { JobReadRepository } from '../../repositories/JobReadRepository.js';
import type { IInvoicingService } from '../InvoicingService.js';

const toBaht = (cents: number | null | undefined) => (cents == null ? null : cents / 100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_jobs',
    description:
      'List jobs (งาน). Each job has one or more containers (ตู้/เที่ยว). Optionally filter by free text '
      + '(order number, booking number, customer name or container number), job status, or creation date range. '
      + 'Returns newest first. Use get_job for a single job’s full detail.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Free text: order no., booking no., customer name, or container no.' },
        status: { type: 'string', description: 'Job status, e.g. pending, assigned, in_transit, delivered, cancelled' },
        created_from: { type: 'string', description: 'Earliest creation date, YYYY-MM-DD (inclusive)' },
        created_to: { type: 'string', description: 'Latest creation date, YYYY-MM-DD (inclusive)' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Max rows, default 20' },
      },
    },
  },
  {
    name: 'get_job',
    description:
      'Full detail of one job and every container on it: status, truck plate, driver, own fleet or subcontractor, '
      + 'driver advance, trip settlement, delivery document (POD) attached, revenue, cost, margin and invoice. '
      + 'Look the job up by any one identifier.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'Job UUID' },
        order_number: { type: 'string', description: 'Order number of the job' },
        container_number: { type: 'string', description: 'Container number, e.g. MSKU1234565' },
        shipment_reference: { type: 'string', description: 'Trip/shipment reference, e.g. ORD-...-1' },
      },
    },
  },
  {
    name: 'list_ready_to_invoice',
    description:
      'Containers that are delivered, have a delivery document attached, have approved revenue, and are not yet '
      + 'on any invoice, i.e. ready to bill (พร้อมวางบิล). Optionally filter by customer name.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Part of the customer name' },
      },
    },
  },
  {
    name: 'list_unsettled_advances',
    description: 'Driver advances (เงินทดรอง) that were paid out but whose trip has not been settled (ยังไม่เคลียร์บิล).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'revenue_summary',
    description: 'Total approved revenue (ค่าระวาง) in a date range, broken down by customer. Optionally one customer.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date, YYYY-MM-DD (inclusive)' },
        to: { type: 'string', description: 'End date, YYYY-MM-DD (inclusive)' },
        customer_name: { type: 'string', description: 'Part of the customer name' },
      },
      required: ['from', 'to'],
    },
  },
];

const schemas = {
  search_jobs: z.object({
    search: z.string().max(100).optional(),
    status: z.string().max(40).optional(),
    created_from: isoDate.optional(),
    created_to: isoDate.optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  get_job: z.object({
    job_id: z.string().uuid().optional(),
    order_number: z.string().max(60).optional(),
    container_number: z.string().max(20).optional(),
    shipment_reference: z.string().max(60).optional(),
  }).refine(v => v.job_id || v.order_number || v.container_number || v.shipment_reference, 'give one identifier'),
  list_ready_to_invoice: z.object({ customer_name: z.string().max(100).optional() }),
  list_unsettled_advances: z.object({}),
  revenue_summary: z.object({ from: isoDate, to: isoDate, customer_name: z.string().max(100).optional() }),
};

export type AssistantToolName = keyof typeof schemas;

export interface ToolOutcome {
  /** JSON sent back to the model. */
  result: unknown;
  isError: boolean;
  /** Jobs this result mentions, so the UI can link to them. */
  jobRefs: { jobId: string; orderNumber: string }[];
}

const startOfDay = (d: string) => new Date(`${d}T00:00:00+07:00`);
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

export class AssistantToolExecutor {
  constructor(
    private jobs: JobReadRepository,
    private invoicing: IInvoicingService,
  ) {}

  async execute(orgId: string, name: string, rawInput: unknown): Promise<ToolOutcome> {
    if (!(name in schemas)) return this.error(`Unknown tool: ${name}`);
    const parsed = schemas[name as AssistantToolName].safeParse(rawInput ?? {});
    if (!parsed.success) return this.error(`Invalid input: ${parsed.error.issues.map(i => i.message).join('; ')}`);
    const input = parsed.data as any;

    switch (name as AssistantToolName) {
      case 'search_jobs': {
        const rows = await this.jobs.listJobs(orgId, {
          search: input.search,
          status: input.status,
          createdFrom: input.created_from ? startOfDay(input.created_from) : undefined,
          createdTo: input.created_to ? endOfDay(input.created_to) : undefined,
          limit: input.limit ?? 20,
        });
        return this.ok({ count: rows.length, jobs: rows }, rows.map(r => ({ jobId: r.id, orderNumber: r.orderNumber })));
      }

      case 'get_job': {
        const jobId = await this.jobs.findJobId(orgId, {
          jobId: input.job_id,
          orderNumber: input.order_number,
          containerNumber: input.container_number,
          shipmentReference: input.shipment_reference,
        });
        const job = jobId ? await this.jobs.getJobDetail(orgId, jobId) : null;
        if (!job) return this.ok({ found: false }, []);
        return this.ok({
          found: true,
          job: {
            ...job,
            containers: job.containers.map(c => ({
              reference: c.reference,
              status: c.status,
              containerNumber: c.container?.containerNumber ?? null,
              containerSize: c.container?.sizeType ?? null,
              truckPlate: c.vehicle?.plate ?? null,
              trailerPlate: c.trailerPlate,
              carrierName: c.vehicle?.carrierName ?? null,
              ownFleet: c.vehicle?.isOwnFleet ?? null,
              driverName: c.driver?.name ?? null,
              advanceBaht: toBaht(c.advance?.totalAdvanceCents),
              settled: c.netSettlementCents != null,
              netSettlementBaht: toBaht(c.netSettlementCents),
              fuelOverBenchmark: c.isOverBenchmark,
              podReceived: c.podReceived,
              revenueBaht: toBaht(c.revenueCents),
              costBaht: toBaht(c.totalActualCostCents),
              marginBaht: toBaht(c.grossMarginCents),
              invoiceNumber: c.invoiceNumber,
              invoiceStatus: c.invoiceStatus,
            })),
          },
        }, [{ jobId: job.id, orderNumber: job.orderNumber }]);
      }

      case 'list_ready_to_invoice': {
        const ready = await this.invoicing.findReadyToInvoice(orgId);
        const needle = input.customer_name?.toLowerCase();
        const rows = (needle ? ready.filter(r => r.customerName.toLowerCase().includes(needle)) : ready).map(r => ({
          shipmentReference: r.shipmentReference,
          customerName: r.customerName,
          revenueBaht: toBaht(r.totalRevenueCents),
          deliveredAt: r.deliveredAt,
        }));
        return this.ok({ count: rows.length, totalBaht: rows.reduce((s, r) => s + (r.revenueBaht ?? 0), 0), shipments: rows }, []);
      }

      case 'list_unsettled_advances': {
        const rows = await this.jobs.listUnsettledAdvances(orgId);
        return this.ok({
          count: rows.length,
          advances: rows.map(r => ({ ...r, totalAdvanceBaht: toBaht(r.totalAdvanceCents), totalAdvanceCents: undefined })),
        }, rows.filter(r => r.jobId && r.orderNumber).map(r => ({ jobId: r.jobId!, orderNumber: r.orderNumber! })));
      }

      case 'revenue_summary': {
        const summary = await this.jobs.revenueSummary(orgId, startOfDay(input.from), endOfDay(input.to), input.customer_name);
        return this.ok({
          from: input.from,
          to: input.to,
          currency: summary.currency,
          totalBaht: toBaht(summary.totalCents),
          customers: summary.customers.map(c => ({ customerName: c.customerName, totalBaht: toBaht(c.totalCents), chargeCount: c.chargeCount })),
        }, []);
      }
    }
  }

  private ok(result: unknown, jobRefs: ToolOutcome['jobRefs']): ToolOutcome {
    return { result, isError: false, jobRefs };
  }

  private error(message: string): ToolOutcome {
    return { result: { error: message }, isError: true, jobRefs: [] };
  }
}
