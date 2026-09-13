import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { container, TOKENS } from '../di/index.js';
import { IInvoiceRepository } from '../repositories/InvoiceRepository.js';
import { IInvoicingService } from '../services/InvoicingService.js';
import { ICommandBus } from '../commands/CommandBus.js';
import { CREATE_INVOICE, CreateInvoicePayload } from '../commands/invoices/CreateInvoiceCommand.js';
import { APPROVE_INVOICE, ApproveInvoicePayload } from '../commands/invoices/ApproveInvoiceCommand.js';
import { SEND_INVOICE, SendInvoicePayload } from '../commands/invoices/SendInvoiceCommand.js';
import { RECORD_PAYMENT, RecordPaymentPayload } from '../commands/invoices/RecordPaymentCommand.js';
import { VOID_INVOICE, VoidInvoicePayload } from '../commands/invoices/VoidInvoiceCommand.js';
import { guardWrites } from '../auth/guardWrites.js';
import { toBahtText } from '../services/thaiTax/bahtText.js';

export async function invoiceRoutes(server: FastifyInstance) {
  const invoiceRepo = container.resolve<IInvoiceRepository>(TOKENS.IInvoiceRepository);
  const invoicingService = container.resolve<IInvoicingService>(TOKENS.IInvoicingService);
  const commandBus = container.resolve<ICommandBus>(TOKENS.ICommandBus);

  server.addHook('preHandler', guardWrites('invoices'));

  // List invoices
  server.get('/api/v1/invoices', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'List invoices with optional filters',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'approved', 'sent', 'partial_paid', 'paid', 'overdue', 'void', 'disputed'] },
        },
      },
    },
  }, async (req: FastifyRequest) => {
    const query = req.query as Record<string, string>;
    const invoices = await invoiceRepo.findAll({
      customerId: query.customerId,
      status: query.status,
    });
    return { data: invoices, error: null };
  });

  // Get shipments ready to invoice
  server.get('/api/v1/invoices/ready-to-invoice', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'List shipments that are ready to be invoiced',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest) => {
    const query = req.query as Record<string, string>;
    const orgId = (req as any).orgId ?? '';
    const shipments = await invoicingService.findReadyToInvoice(orgId, query.customerId);
    return { data: shipments, error: null };
  });

  // Get invoice by ID
  server.get('/api/v1/invoices/:id', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'Get invoice with line items and payments',
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const invoice = await invoiceRepo.findById(id);
    if (!invoice) {
      reply.code(404);
      return { data: null, error: 'Invoice not found' };
    }
    return { data: invoice, error: null };
  });

  // Create invoice from shipments (via CQRS)
  server.post('/api/v1/invoices', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'Create an invoice from delivered shipments with approved charges',
      body: {
        type: 'object',
        required: ['customerId', 'shipmentIds'],
        properties: {
          customerId: { type: 'string' },
          shipmentIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          notes: { type: 'string' },
          internalNotes: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      customerId: z.string().min(1),
      shipmentIds: z.array(z.string()).min(1),
      notes: z.string().optional(),
      internalNotes: z.string().optional(),
    }).parse((req as any).body);

    try {
      const result = await commandBus.dispatch<CreateInvoicePayload, { id: string; invoiceNumber: string }>({
        type: CREATE_INVOICE,
        orgId: (req as any).orgId ?? '',
        actorId: (req as any).user?.sub ?? null,
        payload: body,
        metadata: { correlationId: crypto.randomUUID(), source: 'api' },
      });

      if (!result.success) {
        reply.code(400);
        return { data: null, error: result.error };
      }

      reply.code(201);
      return { data: result.data, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // Approve invoice
  server.post('/api/v1/invoices/:id/approve', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'Approve a draft invoice for sending',
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await commandBus.dispatch<ApproveInvoicePayload, { id: string }>({
        type: APPROVE_INVOICE,
        orgId: (req as any).orgId ?? '',
        actorId: (req as any).user?.sub ?? null,
        payload: { invoiceId: id },
        metadata: { correlationId: crypto.randomUUID(), source: 'api' },
      });
      if (!result.success) {
        reply.code(400);
        return { data: null, error: result.error };
      }
      return { data: result.data, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // Send invoice
  server.post('/api/v1/invoices/:id/send', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'Send an invoice to the customer',
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await commandBus.dispatch<SendInvoicePayload, { id: string }>({
        type: SEND_INVOICE,
        orgId: (req as any).orgId ?? '',
        actorId: (req as any).user?.sub ?? null,
        payload: { invoiceId: id },
        metadata: { correlationId: crypto.randomUUID(), source: 'api' },
      });
      if (!result.success) {
        reply.code(400);
        return { data: null, error: result.error };
      }
      return { data: result.data, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // Record payment
  server.post('/api/v1/invoices/:id/payments', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'Record a payment against an invoice',
      body: {
        type: 'object',
        required: ['amountCents'],
        properties: {
          amountCents: { type: 'integer', minimum: 1 },
          paymentMethod: { type: 'string', enum: ['check', 'ach', 'wire', 'credit_card'] },
          referenceNumber: { type: 'string' },
          receivedDate: { type: 'string', format: 'date' },
          notes: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      amountCents: z.number().int().positive(),
      paymentMethod: z.enum(['check', 'ach', 'wire', 'credit_card']).optional(),
      referenceNumber: z.string().optional(),
      receivedDate: z.string().optional(),
      notes: z.string().optional(),
    }).parse((req as any).body);

    try {
      const result = await commandBus.dispatch<RecordPaymentPayload, { id: string; invoiceStatus: string }>({
        type: RECORD_PAYMENT,
        orgId: (req as any).orgId ?? '',
        actorId: (req as any).user?.sub ?? null,
        payload: { invoiceId: id, ...body },
        metadata: { correlationId: crypto.randomUUID(), source: 'api' },
      });
      if (!result.success) {
        reply.code(400);
        return { data: null, error: result.error };
      }
      return { data: result.data, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // Void invoice
  server.post('/api/v1/invoices/:id/void', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'Void an invoice (only if no payments recorded)',
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      reason: z.string().optional(),
    }).parse((req as any).body ?? {});

    try {
      const result = await commandBus.dispatch<VoidInvoicePayload, { id: string }>({
        type: VOID_INVOICE,
        orgId: (req as any).orgId ?? '',
        actorId: (req as any).user?.sub ?? null,
        payload: { invoiceId: id, ...body },
        metadata: { correlationId: crypto.randomUUID(), source: 'api' },
      });
      if (!result.success) {
        reply.code(400);
        return { data: null, error: result.error };
      }
      return { data: result.data, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // Issue a 50-Tawi withholding tax certificate for a THB invoice
  server.post('/api/v1/invoices/:id/withholding-certificate', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'Issue a Thai withholding tax certificate (50 ทวิ) for an invoice with WHT withheld',
      body: {
        type: 'object',
        properties: {
          withholdingType: { type: 'string', enum: ['pnd53', 'pnd3'] },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      withholdingType: z.enum(['pnd53', 'pnd3']).optional(),
    }).parse((req as any).body ?? {});

    try {
      const invoice = await invoiceRepo.findById(id);
      if (!invoice) {
        reply.code(404);
        return { data: null, error: 'Invoice not found' };
      }
      if (invoice.whtCents <= 0) {
        reply.code(400);
        return { data: null, error: 'This invoice has no withholding tax to certify' };
      }
      if (invoice.withholdingCertificate) {
        reply.code(409);
        return { data: null, error: 'A withholding tax certificate already exists for this invoice', certificateId: invoice.withholdingCertificate.id } as any;
      }

      const prisma = container.resolve<any>(TOKENS.PrismaClient);
      const [customer, org] = await Promise.all([
        prisma.customer.findUnique({ where: { id: invoice.customerId }, select: { name: true, taxId: true } }),
        prisma.organization.findFirst({ select: { name: true, taxId: true } }),
      ]);

      const today = new Date();
      const monthStr = today.toISOString().slice(0, 7).replace('-', '');
      const prefix = `50T-${monthStr}-`;
      const latest = await prisma.withholdingTaxCertificate.findFirst({
        where: { orgId: (req as any).orgId ?? '', certificateNumber: { startsWith: prefix } },
        orderBy: { certificateNumber: 'desc' },
        select: { certificateNumber: true },
      });
      const seq = latest ? parseInt(latest.certificateNumber.slice(prefix.length), 10) + 1 : 1;
      const certificateNumber = `${prefix}${String(seq).padStart(4, '0')}`;

      const certificate = await prisma.withholdingTaxCertificate.create({
        data: {
          orgId: (req as any).orgId ?? '',
          invoiceId: invoice.id,
          certificateNumber,
          payerName: customer?.name ?? 'Unknown',
          payerTaxId: customer?.taxId ?? null,
          payeeName: org?.name ?? 'Ather TMS',
          payeeTaxId: org?.taxId ?? null,
          withholdingType: body.withholdingType ?? 'pnd53',
          taxableAmountCents: invoice.subtotalCents,
          witheldAmountCents: invoice.whtCents,
        },
      });

      reply.code(201);
      return {
        data: { ...certificate, witheldAmountBahtText: toBahtText(certificate.witheldAmountCents / 100) },
        error: null,
      };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // Consolidate invoices for a customer (manual trigger)
  server.post('/api/v1/invoices/consolidate', {
    schema: {
      tags: ['Financial - Invoices'],
      summary: 'Manually trigger invoice consolidation for a customer — batches all ready-to-invoice shipments into a single invoice',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      customerId: z.string().min(1),
      notes: z.string().optional(),
    }).parse((req as any).body);

    try {
      const orgId = (req as any).orgId ?? '';

      // Find all ready-to-invoice shipments for this customer
      const summaries = await invoiceRepo.findAll({ status: 'ready_to_invoice' } as any);

      // We need to find shipments via the financial summary
      const prisma = container.resolve<any>(TOKENS.IChargeRepository);

      // Simpler approach: use the invoicingService.findReadyToInvoice
      const ready = await invoicingService.findReadyToInvoice(orgId, body.customerId);

      if (ready.length === 0) {
        reply.code(400);
        return { data: null, error: 'No shipments ready to invoice for this customer' };
      }

      const shipmentIds = ready.map(s => s.shipmentId);

      // Create via command
      const result = await commandBus.dispatch<CreateInvoicePayload, { id: string; invoiceNumber: string }>({
        type: CREATE_INVOICE,
        orgId,
        actorId: (req as any).user?.sub ?? null,
        payload: {
          customerId: body.customerId,
          shipmentIds,
          notes: body.notes,
          internalNotes: `Manual consolidation — ${ready.length} shipments`,
        },
        metadata: { correlationId: crypto.randomUUID(), source: 'api' },
      });

      if (!result.success) {
        reply.code(400);
        return { data: null, error: result.error };
      }

      return { data: { ...result.data, shipmentCount: ready.length }, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });
}
