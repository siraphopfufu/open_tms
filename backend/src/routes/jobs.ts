/**
 * Job-to-billing PoC (Boonchai demo): งาน (job, an Order) holding one or more
 * เที่ยว/ตู้ (trips, one Shipment per container). One endpoint creates the
 * whole job in a single call so the "เปิดงานใหม่" screen can stay one
 * screen instead of the base product's create-Order-then-convert flow.
 *
 * Reuses existing entities untouched (Order, Shipment, ShippingContainer,
 * Charge, OrderShipment) — no new tables beyond what earlier sprints added.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { registerOrgScope } from '../auth/orgScopeMiddleware.js';
import { requirePermission } from '../middleware/jwtAuth.js';
import { validateContainerNumber } from '../services/shippingContainers/iso6346.js';
import { JobReadRepository } from '../repositories/JobReadRepository.js';

export async function jobRoutes(server: FastifyInstance) {
  await registerOrgScope(server);
  const jobs = new JobReadRepository(server.prisma);

  // ─── List jobs (งานวันนี้) ──────────────────────────────────────────────────

  server.get('/api/v1/jobs', {
    schema: { tags: ['Jobs'], description: 'List jobs (orders) with their container/trip count' },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    try {
      const rows = await jobs.listJobs(orgId);
      return { data: rows, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  // ─── Create a job with N containers in one call ────────────────────────────

  server.post('/api/v1/jobs', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Jobs'],
      description: 'Create a job (order) with one Shipment per container, in one call',
      body: {
        type: 'object',
        required: ['customerId', 'containers'],
        properties: {
          customerId: { type: 'string', format: 'uuid' },
          poNumber: { type: 'string' },
          direction: { type: 'string', enum: ['import', 'export', 'reposition'] },
          originId: { type: 'string', format: 'uuid' },
          destinationId: { type: 'string', format: 'uuid' },
          containers: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                sizeType: { type: 'string' },
                bookingNumber: { type: 'string' },
                containerNumber: { type: 'string' },
                sealNumber: { type: 'string' },
                revenueCents: { type: 'integer', minimum: 0 },
              },
            },
          },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const body = req.body as any;

    // Validate container numbers up front so a bad one doesn't fail midway
    // through an otherwise-successful job creation.
    for (const c of body.containers) {
      if (c.containerNumber) {
        const validation = validateContainerNumber(c.containerNumber);
        if (!validation.valid) {
          reply.code(400);
          return { data: null, error: `Invalid container number "${c.containerNumber}": ${validation.reason}` };
        }
      }
    }

    try {
      const result = await server.prisma.$transaction(async (tx: any) => {
        const orderNumber = `WID-${Date.now().toString(36).toUpperCase()}`;
        const order = await tx.order.create({
          data: {
            orgId,
            orderNumber,
            poNumber: body.poNumber || null,
            customerId: body.customerId,
            originId: body.originId || null,
            destinationId: body.destinationId || null,
            status: 'verified',
          },
        });

        const shipmentIds: string[] = [];

        for (const c of body.containers) {
          const shipment = await tx.shipment.create({
            data: {
              orgId,
              reference: `${orderNumber}-${shipmentIds.length + 1}`,
              customerId: body.customerId,
              originId: body.originId || null,
              destinationId: body.destinationId || null,
              direction: body.direction || null,
              serviceLevel: 'FTL',
              status: 'draft',
            },
          });

          if (c.sizeType) {
            const container = await tx.shippingContainer.create({
              data: {
                orgId,
                containerNumber: c.containerNumber ? validateContainerNumber(c.containerNumber).normalized : null,
                sizeType: c.sizeType,
                sealNumber: c.sealNumber || null,
                bookingNumber: c.bookingNumber || body.poNumber || null,
              },
            });
            await tx.shipment.update({ where: { id: shipment.id }, data: { shippingContainerId: container.id } });
          }

          await tx.orderShipment.create({ data: { orderId: order.id, shipmentId: shipment.id } });

          if (c.revenueCents) {
            const charge = await tx.charge.create({
              data: {
                orgId,
                shipmentId: shipment.id,
                orderId: order.id,
                chargeType: 'linehaul',
                chargeCategory: 'revenue',
                description: `ค่าระวาง — ${orderNumber}-${shipmentIds.length + 1}`,
                amountCents: c.revenueCents,
                currency: 'THB',
                status: 'approved',
              },
            });
            void charge;
          }

          shipmentIds.push(shipment.id);
        }

        return { orderId: order.id, orderNumber, shipmentIds };
      });

      reply.code(201);
      return { data: result, error: null };
    } catch (err: any) {
      if (err.code === 'P2002' && err.meta?.target?.includes?.('containerNumber')) {
        reply.code(409);
        return { data: null, error: 'เลขตู้นี้มีอยู่ในระบบแล้ว กรุณาใช้เลขตู้อื่น (This container number is already in use — pick a different one)' };
      }
      reply.code(400);
      return { data: null, error: 'ไม่สามารถเปิดงานได้ กรุณาลองอีกครั้ง (Could not create the job — please try again)' };
    }
  });

  // ─── Mark a trip delivered ──────────────────────────────────────────────────
  //
  // The general TMS's POST /shipments/:id/transition enforces a readiness gate
  // (carrierId, pickupDate, deliveryDate) built for the broker/EDI workflow —
  // fields this manual, own-fleet Thai dispatch flow never populates. Manual
  // completion of a drayage trip is analogous to the automatic tracking
  // handlers, which the transition command's own docs say "intentionally
  // bypass this command — they update status directly." This does the same,
  // scoped to jobs.

  server.post('/api/v1/shipments/:id/mark-delivered', {
    preHandler: requirePermission('shipments:write'),
    schema: { tags: ['Jobs'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const shipment = await server.prisma.shipment.findFirst({ where: { id, orgId, deletedAt: null } });
      if (!shipment) {
        reply.code(404);
        return { data: null, error: 'Shipment not found' };
      }
      const updated = await server.prisma.shipment.update({
        where: { id },
        data: { status: 'complete', deliveryDate: shipment.deliveryDate ?? new Date() },
      });
      return { data: { id: updated.id, status: updated.status }, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // ─── Job detail (the pitch page) ────────────────────────────────────────────

  server.get('/api/v1/jobs/:id', {
    schema: { tags: ['Jobs'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const job = await jobs.getJobDetail(orgId, id);
      if (!job) {
        reply.code(404);
        return { data: null, error: 'Job not found' };
      }
      return { data: job, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });
}
