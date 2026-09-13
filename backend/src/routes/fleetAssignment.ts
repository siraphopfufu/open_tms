/**
 * Fleet assignment (Thai drayage): vehicles and drivers under a carrier, and
 * assigning a tractor + trailer + driver to a shipment (customer process
 * flowchart stage 1 — "การเปิดงานและจัดสรรรถ / Job Booking & Dispatch").
 * A carrier with isOwnFleet=true is the company's own trucks; any other
 * carrier is a subcontractor (รถร่วม/รถซับ) paid per trip.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requirePermission } from '../middleware/jwtAuth.js';
import { registerOrgScope } from '../auth/orgScopeMiddleware.js';

export async function fleetAssignmentRoutes(server: FastifyInstance) {
  await registerOrgScope(server);

  // ─── Dispatch Board ─────────────────────────────────────────────────────────
  // The flowchart's stage-1 decision point (own fleet vs. subcontractor) laid
  // out as a triage board: every non-final shipment, bucketed by whether it
  // still needs a truck/driver assigned and which fleet it's on.

  server.get('/api/v1/dispatch/board', {
    schema: { tags: ['Fleet'], description: 'Active shipments grouped by dispatch assignment state' },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    try {
      const shipments = await server.prisma.shipment.findMany({
        where: { orgId, deletedAt: null, archived: false, status: { notIn: ['complete', 'archived'] } },
        select: {
          id: true,
          reference: true,
          status: true,
          proNumber: true,
          pickupDate: true,
          deliveryDate: true,
          customer: { select: { name: true } },
          origin: { select: { city: true, name: true } },
          destination: { select: { city: true, name: true } },
          loads: {
            select: {
              trailerPlate: true,
              vehicle: { select: { plate: true, carrier: { select: { id: true, name: true, isOwnFleet: true } } } },
              driver: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const board: { unassigned: any[]; ownFleet: any[]; subcontractor: any[] } = {
        unassigned: [],
        ownFleet: [],
        subcontractor: [],
      };

      for (const s of shipments) {
        const load = s.loads[0];
        const item = {
          id: s.id,
          reference: s.reference,
          status: s.status,
          proNumber: s.proNumber,
          customerName: s.customer.name,
          originCity: s.origin?.city ?? s.origin?.name ?? null,
          destinationCity: s.destination?.city ?? s.destination?.name ?? null,
          pickupDate: s.pickupDate,
          deliveryDate: s.deliveryDate,
          carrierName: load?.vehicle?.carrier?.name ?? null,
          tractorPlate: load?.vehicle?.plate ?? null,
          trailerPlate: load?.trailerPlate ?? null,
          driverName: load?.driver?.name ?? null,
        };
        if (!load?.vehicle) board.unassigned.push(item);
        else if (load.vehicle.carrier?.isOwnFleet) board.ownFleet.push(item);
        else board.subcontractor.push(item);
      }

      return { data: board, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  // ─── Vehicles ───────────────────────────────────────────────────────────────

  server.get('/api/v1/carriers/:id/vehicles', {
    schema: { tags: ['Fleet'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const vehicles = await server.prisma.vehicle.findMany({ where: { carrierId: id, orgId }, orderBy: { plate: 'asc' } });
      return { data: vehicles, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/carriers/:id/vehicles', {
    preHandler: requirePermission('carriers:write'),
    schema: {
      tags: ['Fleet'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['plate'],
        properties: {
          plate: { type: 'string' },
          type: { type: 'string' },
          standardKmPerLiter: { type: 'number', minimum: 0.1 },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      const carrier = await server.prisma.carrier.findFirst({ where: { id, orgId } });
      if (!carrier) {
        reply.code(404);
        return { data: null, error: 'Carrier not found' };
      }
      const vehicle = await server.prisma.vehicle.create({
        data: {
          orgId,
          carrierId: id,
          plate: body.plate,
          type: body.type || 'tractor',
          standardKmPerLiter: body.standardKmPerLiter ?? null,
        },
      });
      reply.code(201);
      return { data: vehicle, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // ─── Drivers ────────────────────────────────────────────────────────────────

  server.get('/api/v1/carriers/:id/drivers', {
    schema: { tags: ['Fleet'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const drivers = await server.prisma.driver.findMany({ where: { carrierId: id, orgId }, orderBy: { name: 'asc' } });
      return { data: drivers, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/carriers/:id/drivers', {
    preHandler: requirePermission('carriers:write'),
    schema: {
      tags: ['Fleet'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          nationalId: { type: 'string' },
          standardAllowanceCents: { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      const carrier = await server.prisma.carrier.findFirst({ where: { id, orgId } });
      if (!carrier) {
        reply.code(404);
        return { data: null, error: 'Carrier not found' };
      }
      const driver = await server.prisma.driver.create({
        data: {
          orgId,
          carrierId: id,
          name: body.name,
          phone: body.phone || null,
          nationalId: body.nationalId || null,
          standardAllowanceCents: body.standardAllowanceCents ?? null,
        },
      });
      reply.code(201);
      return { data: driver, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // ─── Load Assignment ────────────────────────────────────────────────────────

  server.patch('/api/v1/shipments/:id/load', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Fleet'],
      description: 'Assign (or update) the tractor, trailer, and driver dispatched for a trip',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          vehicleId: { type: 'string', format: 'uuid' },
          driverId: { type: 'string', format: 'uuid' },
          trailerPlate: { type: 'string' },
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

      const existingLoad = await server.prisma.load.findFirst({ where: { shipmentId: id } });
      const data = {
        vehicleId: body.vehicleId ?? undefined,
        driverId: body.driverId ?? undefined,
        trailerPlate: body.trailerPlate ?? undefined,
        assignedAt: new Date(),
      };

      const load = existingLoad
        ? await server.prisma.load.update({ where: { id: existingLoad.id }, data })
        : await server.prisma.load.create({ data: { shipmentId: id, ...data } });

      const full = await server.prisma.load.findUnique({
        where: { id: load.id },
        include: { vehicle: { include: { carrier: true } }, driver: true },
      });
      reply.code(existingLoad ? 200 : 201);
      return { data: full, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });
}
