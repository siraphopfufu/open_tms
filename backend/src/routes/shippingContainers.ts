/**
 * Thai container drayage (Sprint 1): ISO shipping containers, and the EIR / weighbridge
 * tickets a trip generates at the port terminal or empty depot. See
 * tms_evaluation_feedback_report.md section 4 for the source requirements.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requirePermission } from '../middleware/jwtAuth.js';
import { registerOrgScope } from '../auth/orgScopeMiddleware.js';
import {
  validateContainerNumber,
  CONTAINER_SIZE_TYPES,
  MAX_GROSS_WEIGHT_KG,
} from '../services/shippingContainers/iso6346.js';

export async function shippingContainerRoutes(server: FastifyInstance) {
  await registerOrgScope(server);

  // ─── Shipping Containers ───────────────────────────────────────────────────

  server.get('/api/v1/shipping-containers', {
    schema: {
      tags: ['Shipping Containers'],
      description: 'List shipping containers, optionally filtered by container number',
      querystring: {
        type: 'object',
        properties: { search: { type: 'string' } },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { search } = (req.query as any) || {};
    try {
      const where: any = { orgId };
      if (search) {
        where.containerNumber = { contains: String(search).toUpperCase(), mode: 'insensitive' };
      }
      const containers = await server.prisma.shippingContainer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return { data: containers, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.get('/api/v1/shipping-containers/:id', {
    schema: {
      tags: ['Shipping Containers'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const found = await server.prisma.shippingContainer.findFirst({ where: { id, orgId } });
      if (!found) {
        reply.code(404);
        return { data: null, error: 'Shipping container not found' };
      }
      return { data: found, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/shipping-containers', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Shipping Containers'],
      description: 'Register an ISO 6346 shipping container. Validates the check digit server-side.',
      body: {
        type: 'object',
        required: ['containerNumber', 'sizeType'],
        properties: {
          containerNumber: { type: 'string' },
          sizeType: { type: 'string', enum: CONTAINER_SIZE_TYPES as unknown as string[] },
          sealNumber: { type: 'string' },
          status: { type: 'string', enum: ['empty', 'laden', 'discharged'] },
          shippingLine: { type: 'string' },
          bookingNumber: { type: 'string' },
          billOfLadingNo: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const body = req.body as any;

    const validation = validateContainerNumber(body.containerNumber);
    if (!validation.valid) {
      reply.code(400);
      return { data: null, error: `Invalid container number: ${validation.reason}` };
    }

    try {
      const created = await server.prisma.shippingContainer.create({
        data: {
          orgId,
          containerNumber: validation.normalized!,
          sizeType: body.sizeType,
          sealNumber: body.sealNumber || null,
          status: body.status || 'empty',
          shippingLine: body.shippingLine || null,
          bookingNumber: body.bookingNumber || null,
          billOfLadingNo: body.billOfLadingNo || null,
        },
      });
      reply.code(201);
      return { data: created, error: null };
    } catch (err: any) {
      if (err.code === 'P2002') {
        reply.code(409);
        return { data: null, error: `Container ${validation.normalized} is already registered` };
      }
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  server.patch('/api/v1/shipping-containers/:id', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Shipping Containers'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          sealNumber: { type: 'string' },
          status: { type: 'string', enum: ['empty', 'laden', 'discharged'] },
          shippingLine: { type: 'string' },
          bookingNumber: { type: 'string' },
          billOfLadingNo: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      const existing = await server.prisma.shippingContainer.findFirst({ where: { id, orgId } });
      if (!existing) {
        reply.code(404);
        return { data: null, error: 'Shipping container not found' };
      }
      const updated = await server.prisma.shippingContainer.update({ where: { id }, data: body });
      return { data: updated, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // ─── Attach a container to a shipment (trip) ───────────────────────────────

  server.patch('/api/v1/shipments/:id/container', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Shipping Containers'],
      description: 'Attach (or clear) the shipping container a shipment is moving',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: { shippingContainerId: { type: ['string', 'null'], format: 'uuid' } },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    const { shippingContainerId } = req.body as { shippingContainerId: string | null };
    try {
      const shipment = await server.prisma.shipment.findFirst({ where: { id, orgId, deletedAt: null } });
      if (!shipment) {
        reply.code(404);
        return { data: null, error: 'Shipment not found' };
      }
      if (shippingContainerId) {
        const container = await server.prisma.shippingContainer.findFirst({ where: { id: shippingContainerId, orgId } });
        if (!container) {
          reply.code(400);
          return { data: null, error: 'Shipping container not found' };
        }
      }
      const updated = await server.prisma.shipment.update({
        where: { id },
        data: { shippingContainerId },
        include: { shippingContainer: true },
      });
      return { data: updated, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // ─── EIR Tickets ────────────────────────────────────────────────────────────

  server.get('/api/v1/shipments/:id/eir', {
    schema: {
      tags: ['Shipping Containers'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const tickets = await server.prisma.eirTicket.findMany({
        where: { shipmentId: id, orgId },
        include: { location: true },
        orderBy: { issuedAt: 'desc' },
      });
      return { data: tickets, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/shipments/:id/eir', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Shipping Containers'],
      description: 'Record an Equipment Interchange Receipt (EIR) for a shipment',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['ticketNumber', 'direction'],
        properties: {
          ticketNumber: { type: 'string' },
          direction: { type: 'string', enum: ['pickup_empty', 'return_empty', 'pickup_laden', 'return_laden'] },
          locationId: { type: 'string', format: 'uuid' },
          issuedAt: { type: 'string' },
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
      const created = await server.prisma.eirTicket.create({
        data: {
          orgId,
          shipmentId: id,
          ticketNumber: body.ticketNumber,
          direction: body.direction,
          locationId: body.locationId || null,
          issuedAt: body.issuedAt ? new Date(body.issuedAt) : new Date(),
        },
      });
      reply.code(201);
      return { data: created, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });

  // ─── Weight Tickets ─────────────────────────────────────────────────────────

  server.get('/api/v1/shipments/:id/weight-tickets', {
    schema: {
      tags: ['Shipping Containers'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    try {
      const tickets = await server.prisma.weightTicket.findMany({
        where: { shipmentId: id, orgId },
        include: { location: true },
        orderBy: { weighedAt: 'desc' },
      });
      return { data: tickets, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.post('/api/v1/shipments/:id/weight-ticket', {
    preHandler: requirePermission('shipments:write'),
    schema: {
      tags: ['Shipping Containers'],
      description: 'Record a weighbridge slip for a shipment. Flags overweight past the 50,500kg Thai highway limit.',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['grossWeightKg'],
        properties: {
          ticketNumber: { type: 'string' },
          grossWeightKg: { type: 'number', minimum: 0 },
          tareWeightKg: { type: 'number', minimum: 0 },
          locationId: { type: 'string', format: 'uuid' },
          weighedAt: { type: 'string' },
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
      const netWeightKg = body.tareWeightKg != null ? body.grossWeightKg - body.tareWeightKg : null;
      const created = await server.prisma.weightTicket.create({
        data: {
          orgId,
          shipmentId: id,
          ticketNumber: body.ticketNumber || null,
          grossWeightKg: body.grossWeightKg,
          tareWeightKg: body.tareWeightKg ?? null,
          netWeightKg,
          isOverweight: body.grossWeightKg > MAX_GROSS_WEIGHT_KG,
          locationId: body.locationId || null,
          weighedAt: body.weighedAt ? new Date(body.weighedAt) : new Date(),
        },
      });
      reply.code(201);
      return { data: created, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });
}
