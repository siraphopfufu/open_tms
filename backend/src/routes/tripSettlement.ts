/**
 * Driver advance & trip settlement (Thai drayage): approve a cash advance
 * before a trip departs, record actual fuel receipts after, and reconcile
 * against a per-vehicle fuel benchmark. See
 * tms_evaluation_feedback_report.md section 5.4 and the customer's process
 * flowchart (stages 2-3: driver advance & execution, trip settlement & audit).
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requirePermission } from '../middleware/jwtAuth.js';
import { registerOrgScope } from '../auth/orgScopeMiddleware.js';
import {
  DEFAULT_KM_PER_LITER,
  calculateFuelBenchmark,
  calculateSettlementTotals,
} from '../services/tripSettlement/calculator.js';

export async function tripSettlementRoutes(server: FastifyInstance) {
  await registerOrgScope(server);

  // ─── Driver Advance ─────────────────────────────────────────────────────────

  server.get('/api/v1/shipments/:id/driver-advance', {
    schema: { tags: ['Trip Settlement'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const advance = await server.prisma.driverAdvance.findFirst({ where: { shipmentId: id, orgId }, include: { driver: true } });
      if (!advance) {
        reply.code(404);
        return { data: null, error: 'No driver advance recorded for this shipment' };
      }
      return { data: advance, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/shipments/:id/driver-advance', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Trip Settlement'],
      description: 'Approve a cash advance for a trip before departure (fuel + toll estimate + allowance)',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          driverId: { type: 'string', format: 'uuid' },
          fuelEstimateCents: { type: 'integer', minimum: 0 },
          tollEstimateCents: { type: 'integer', minimum: 0 },
          allowanceCents: { type: 'integer', minimum: 0 },
          transferMethod: { type: 'string', enum: ['cash', 'transfer'] },
          notes: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      const shipment = await server.prisma.shipment.findFirst({ where: { id, orgId, deletedAt: null } });
      if (!shipment) {
        reply.code(404);
        return { data: null, error: 'Shipment not found' };
      }

      let allowanceCents = body.allowanceCents;
      if (allowanceCents == null && body.driverId) {
        const driver = await server.prisma.driver.findUnique({ where: { id: body.driverId }, select: { standardAllowanceCents: true } });
        allowanceCents = driver?.standardAllowanceCents ?? 0;
      }
      allowanceCents = allowanceCents ?? 0;
      const fuelEstimateCents = body.fuelEstimateCents ?? 0;
      const tollEstimateCents = body.tollEstimateCents ?? 0;

      const advance = await server.prisma.driverAdvance.create({
        data: {
          orgId,
          shipmentId: id,
          driverId: body.driverId || null,
          fuelEstimateCents,
          tollEstimateCents,
          allowanceCents,
          totalAdvanceCents: fuelEstimateCents + tollEstimateCents + allowanceCents,
          transferMethod: body.transferMethod || 'cash',
          status: 'approved',
          approvedBy: (req as any).user?.sub || null,
          approvedAt: new Date(),
          notes: body.notes || null,
        },
      });
      reply.code(201);
      return { data: advance, error: null };
    } catch (err: any) {
      if (err.code === 'P2002') {
        reply.code(409);
        return { data: null, error: 'A driver advance already exists for this shipment' };
      }
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/shipments/:id/driver-advance/transfer', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Trip Settlement'],
      description: 'Mark a driver advance as transferred (cash handed over / bank transfer sent)',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const advance = await server.prisma.driverAdvance.findFirst({ where: { shipmentId: id, orgId } });
      if (!advance) {
        reply.code(404);
        return { data: null, error: 'No driver advance recorded for this shipment' };
      }
      const updated = await server.prisma.driverAdvance.update({
        where: { id: advance.id },
        data: { status: 'transferred', transferredAt: new Date() },
      });
      return { data: updated, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // ─── Fuel Transactions ──────────────────────────────────────────────────────

  server.get('/api/v1/shipments/:id/fuel-transactions', {
    schema: { tags: ['Trip Settlement'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const transactions = await server.prisma.fuelTransaction.findMany({ where: { shipmentId: id, orgId }, orderBy: { purchasedAt: 'asc' } });
      return { data: transactions, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/shipments/:id/fuel-transactions', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Trip Settlement'],
      description: 'Record a fuel receipt the driver submitted after the trip',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['liters', 'pricePerLiterCents'],
        properties: {
          liters: { type: 'number', minimum: 0 },
          pricePerLiterCents: { type: 'integer', minimum: 0 },
          odometerKm: { type: 'number', minimum: 0 },
          purchasedAt: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      const shipment = await server.prisma.shipment.findFirst({ where: { id, orgId, deletedAt: null } });
      if (!shipment) {
        reply.code(404);
        return { data: null, error: 'Shipment not found' };
      }
      const totalCostCents = Math.round(body.liters * body.pricePerLiterCents);
      const created = await server.prisma.fuelTransaction.create({
        data: {
          orgId,
          shipmentId: id,
          liters: body.liters,
          pricePerLiterCents: body.pricePerLiterCents,
          totalCostCents,
          odometerKm: body.odometerKm ?? null,
          purchasedAt: body.purchasedAt ? new Date(body.purchasedAt) : new Date(),
        },
      });
      reply.code(201);
      return { data: created, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // ─── Trip Settlement ────────────────────────────────────────────────────────

  server.get('/api/v1/shipments/:id/trip-settlement', {
    schema: { tags: ['Trip Settlement'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const settlement = await server.prisma.tripSettlement.findFirst({ where: { shipmentId: id, orgId }, include: { driver: true } });
      if (!settlement) {
        reply.code(404);
        return { data: null, error: 'No trip settlement recorded for this shipment' };
      }
      return { data: settlement, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/shipments/:id/trip-settlement', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Trip Settlement'],
      description: 'Reconcile actual fuel/toll cost for a trip against the fuel benchmark and the driver advance',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['distanceKm', 'dieselPriceCentsPerLiter'],
        properties: {
          distanceKm: { type: 'number', minimum: 0 },
          dieselPriceCentsPerLiter: { type: 'integer', minimum: 0 },
          vehicleKmPerLiter: { type: 'number', minimum: 0.1 },
          actualTollCents: { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      const shipment = await server.prisma.shipment.findFirst({ where: { id, orgId, deletedAt: null } });
      if (!shipment) {
        reply.code(404);
        return { data: null, error: 'Shipment not found' };
      }

      const [advance, fuelTransactions, load] = await Promise.all([
        server.prisma.driverAdvance.findFirst({ where: { shipmentId: id, orgId } }),
        server.prisma.fuelTransaction.findMany({ where: { shipmentId: id, orgId } }),
        server.prisma.load.findFirst({ where: { shipmentId: id }, include: { vehicle: true } }),
      ]);

      const actualFuelCostCents = fuelTransactions.reduce((sum, t) => sum + t.totalCostCents, 0);
      const actualTollCents = body.actualTollCents ?? 0;
      const allowanceCents = advance?.allowanceCents ?? 0;
      const totalAdvanceCents = advance?.totalAdvanceCents ?? 0;
      const vehicleKmPerLiter = body.vehicleKmPerLiter ?? load?.vehicle?.standardKmPerLiter ?? DEFAULT_KM_PER_LITER;

      const benchmark = calculateFuelBenchmark(body.distanceKm, vehicleKmPerLiter, body.dieselPriceCentsPerLiter, actualFuelCostCents);
      const totals = calculateSettlementTotals(totalAdvanceCents, actualFuelCostCents, actualTollCents, allowanceCents);

      const settlement = await server.prisma.tripSettlement.upsert({
        where: { shipmentId: id },
        create: {
          orgId,
          shipmentId: id,
          driverId: advance?.driverId || null,
          distanceKm: body.distanceKm,
          vehicleKmPerLiter,
          dieselPriceCentsPerLiter: body.dieselPriceCentsPerLiter,
          expectedFuelCostCents: benchmark.expectedFuelCostCents,
          actualFuelCostCents,
          actualTollCents,
          allowanceCents,
          fuelVariancePercent: benchmark.fuelVariancePercent,
          isOverBenchmark: benchmark.isOverBenchmark,
          totalAdvanceCents,
          totalActualCostCents: totals.totalActualCostCents,
          netSettlementCents: totals.netSettlementCents,
        },
        update: {
          distanceKm: body.distanceKm,
          vehicleKmPerLiter,
          dieselPriceCentsPerLiter: body.dieselPriceCentsPerLiter,
          expectedFuelCostCents: benchmark.expectedFuelCostCents,
          actualFuelCostCents,
          actualTollCents,
          allowanceCents,
          fuelVariancePercent: benchmark.fuelVariancePercent,
          isOverBenchmark: benchmark.isOverBenchmark,
          totalAdvanceCents,
          totalActualCostCents: totals.totalActualCostCents,
          netSettlementCents: totals.netSettlementCents,
        },
      });

      reply.code(201);
      return { data: settlement, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/shipments/:id/trip-settlement/settle', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Trip Settlement'],
      description: 'Mark a trip settlement as settled (cash/refund exchanged)',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const settlement = await server.prisma.tripSettlement.findFirst({ where: { shipmentId: id, orgId } });
      if (!settlement) {
        reply.code(404);
        return { data: null, error: 'No trip settlement recorded for this shipment' };
      }
      const updated = await server.prisma.tripSettlement.update({
        where: { id: settlement.id },
        data: { status: 'settled', settledAt: new Date(), settledBy: (req as any).user?.sub || null },
      });
      return { data: updated, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });
}
