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

export async function jobRoutes(server: FastifyInstance) {
  await registerOrgScope(server);

  // ─── List jobs (งานวันนี้) ──────────────────────────────────────────────────

  server.get('/api/v1/jobs', {
    schema: { tags: ['Jobs'], description: 'List jobs (orders) with their container/trip count' },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    try {
      const orders = await server.prisma.order.findMany({
        where: { orgId, status: { not: 'cancelled' } },
        select: {
          id: true,
          orderNumber: true,
          poNumber: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
          origin: { select: { name: true, city: true } },
          destination: { select: { name: true, city: true } },
          orderShipments: {
            select: {
              shipment: {
                select: {
                  id: true,
                  status: true,
                  shippingContainer: { select: { containerNumber: true, sizeType: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const rows = orders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        bookingNumber: o.poNumber,
        status: o.status,
        createdAt: o.createdAt,
        customerName: o.customer.name,
        originName: o.origin?.city ?? o.origin?.name ?? null,
        destinationName: o.destination?.city ?? o.destination?.name ?? null,
        containerCount: o.orderShipments.length,
        containers: o.orderShipments.map(os => os.shipment.shippingContainer?.containerNumber || os.shipment.shippingContainer?.sizeType || 'ตู้').join(', '),
      }));

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
      const order = await server.prisma.order.findFirst({
        where: { id, orgId },
        select: {
          id: true,
          orderNumber: true,
          poNumber: true,
          status: true,
          createdAt: true,
          customerId: true,
          customer: { select: { id: true, name: true } },
          origin: { select: { id: true, name: true, city: true } },
          destination: { select: { id: true, name: true, city: true } },
          orderShipments: { select: { shipmentId: true } },
        },
      });
      if (!order) {
        reply.code(404);
        return { data: null, error: 'Job not found' };
      }

      const shipmentIds = order.orderShipments.map(os => os.shipmentId);
      const shipments = await server.prisma.shipment.findMany({
        where: { id: { in: shipmentIds } },
        select: {
          id: true,
          reference: true,
          status: true,
          direction: true,
          shippingContainer: true,
          loads: { include: { vehicle: { include: { carrier: true } }, driver: true } },
          driverAdvance: { include: { driver: true } },
          fuelTransactions: true,
          tripSettlement: true,
        },
        orderBy: { reference: 'asc' },
      });

      const [charges, attachmentCounts, lineItems] = await Promise.all([
        server.prisma.charge.findMany({ where: { shipmentId: { in: shipmentIds }, chargeCategory: 'revenue', status: { in: ['approved', 'invoiced'] } } }),
        server.prisma.attachment.findMany({ where: { entityType: 'shipment', entityId: { in: shipmentIds } }, select: { entityId: true, id: true, fileName: true } }),
        server.prisma.invoiceLineItem.findMany({ where: { shipmentId: { in: shipmentIds } }, select: { shipmentId: true, invoice: { select: { id: true, invoiceNumber: true, status: true } } } }),
      ]);

      const revenueByShipment = new Map<string, number>();
      for (const c of charges) revenueByShipment.set(c.shipmentId!, (revenueByShipment.get(c.shipmentId!) ?? 0) + c.amountCents);
      const attachmentsByShipment = new Map<string, any[]>();
      for (const a of attachmentCounts) {
        const list = attachmentsByShipment.get(a.entityId) ?? [];
        list.push(a);
        attachmentsByShipment.set(a.entityId, list);
      }
      const invoiceByShipment = new Map(lineItems.map(li => [li.shipmentId as string, li.invoice]));

      const containers = shipments.map(s => {
        const load = s.loads[0];
        const revenueCents = revenueByShipment.get(s.id) ?? 0;
        const actualFuelCostCents = s.fuelTransactions.reduce((sum: number, t: any) => sum + t.totalCostCents, 0);
        const actualLiters = s.fuelTransactions.reduce((sum: number, t: any) => sum + t.liters, 0);
        const settlement = s.tripSettlement;
        const totalActualCostCents = settlement?.totalActualCostCents ?? (actualFuelCostCents + (s.driverAdvance?.tollEstimateCents ?? 0) + (s.driverAdvance?.allowanceCents ?? 0));
        const grossMarginCents = revenueCents - totalActualCostCents;
        const attachments = attachmentsByShipment.get(s.id) ?? [];
        const invoice = invoiceByShipment.get(s.id);

        return {
          shipmentId: s.id,
          reference: s.reference,
          status: s.status,
          direction: s.direction,
          container: s.shippingContainer,
          vehicle: load?.vehicle ? { id: load.vehicle.id, plate: load.vehicle.plate, carrierName: load.vehicle.carrier?.name, isOwnFleet: load.vehicle.carrier?.isOwnFleet } : null,
          trailerPlate: load?.trailerPlate ?? null,
          driver: load?.driver ? { id: load.driver.id, name: load.driver.name } : null,
          advance: s.driverAdvance ? {
            id: s.driverAdvance.id,
            totalAdvanceCents: s.driverAdvance.totalAdvanceCents,
            status: s.driverAdvance.status,
          } : null,
          expectedLiters: settlement ? settlement.distanceKm / settlement.vehicleKmPerLiter : null,
          actualLiters,
          isOverBenchmark: settlement?.isOverBenchmark ?? null,
          netSettlementCents: settlement?.netSettlementCents ?? null,
          revenueCents,
          totalActualCostCents,
          grossMarginCents,
          attachmentCount: attachments.length,
          podReceived: attachments.length > 0,
          invoiceNumber: invoice?.invoiceNumber ?? null,
          invoiceStatus: invoice?.status ?? null,
        };
      });

      return {
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          bookingNumber: order.poNumber,
          status: order.status,
          createdAt: order.createdAt,
          customer: order.customer,
          origin: order.origin,
          destination: order.destination,
          containers,
        },
        error: null,
      };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });
}
