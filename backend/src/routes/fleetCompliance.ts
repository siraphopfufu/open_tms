/**
 * Fleet compliance (Must Have #20): annual tax disc, insurance, and the
 * 6-monthly ตรอ inspection renewal, tracked per Vehicle (tractor or
 * trailer-registered-as-Vehicle) with an early-warning window matching the
 * source requirement — orange at 30 days out, red at 7.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requirePermission } from '../middleware/jwtAuth.js';
import { registerOrgScope } from '../auth/orgScopeMiddleware.js';

const WARNING_DAYS = 30;
const CRITICAL_DAYS = 7;

type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok' | 'unset';

function statusFor(date: Date | null, now: Date): ExpiryStatus {
  if (!date) return 'unset';
  const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= CRITICAL_DAYS) return 'critical';
  if (daysUntil <= WARNING_DAYS) return 'warning';
  return 'ok';
}

const SEVERITY_RANK: Record<ExpiryStatus, number> = { expired: 4, critical: 3, warning: 2, ok: 1, unset: 0 };

export async function fleetComplianceRoutes(server: FastifyInstance) {
  await registerOrgScope(server);

  server.get('/api/v1/fleet/compliance', {
    schema: { tags: ['Fleet'], description: 'Every vehicle (tractor or trailer) with tax/insurance/ตรอ expiry status' },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    try {
      const vehicles = await server.prisma.vehicle.findMany({
        where: { orgId },
        select: {
          id: true,
          plate: true,
          type: true,
          taxExpiryDate: true,
          insuranceExpiryDate: true,
          inspectionExpiryDate: true,
          carrier: { select: { id: true, name: true, isOwnFleet: true } },
        },
        orderBy: { plate: 'asc' },
      });

      const now = new Date();
      const rows = vehicles.map(v => {
        const tax = statusFor(v.taxExpiryDate, now);
        const insurance = statusFor(v.insuranceExpiryDate, now);
        const inspection = statusFor(v.inspectionExpiryDate, now);
        const worst = [tax, insurance, inspection].sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])[0];
        return {
          id: v.id,
          plate: v.plate,
          type: v.type,
          carrierName: v.carrier.name,
          isOwnFleet: v.carrier.isOwnFleet,
          taxExpiryDate: v.taxExpiryDate,
          taxStatus: tax,
          insuranceExpiryDate: v.insuranceExpiryDate,
          insuranceStatus: insurance,
          inspectionExpiryDate: v.inspectionExpiryDate,
          inspectionStatus: inspection,
          worstStatus: worst,
        };
      });

      rows.sort((a, b) => SEVERITY_RANK[b.worstStatus as ExpiryStatus] - SEVERITY_RANK[a.worstStatus as ExpiryStatus]);

      return { data: rows, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });

  server.patch('/api/v1/vehicles/:id/compliance', {
    preHandler: requirePermission('carriers:write'),
    schema: {
      tags: ['Fleet'],
      description: 'Set a vehicle\'s tax/insurance/ตรอ inspection expiry dates',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          taxExpiryDate: { type: ['string', 'null'] },
          insuranceExpiryDate: { type: ['string', 'null'] },
          inspectionExpiryDate: { type: ['string', 'null'] },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      const existing = await server.prisma.vehicle.findFirst({ where: { id, orgId } });
      if (!existing) {
        reply.code(404);
        return { data: null, error: 'Vehicle not found' };
      }
      const data: any = {};
      if ('taxExpiryDate' in body) data.taxExpiryDate = body.taxExpiryDate ? new Date(body.taxExpiryDate) : null;
      if ('insuranceExpiryDate' in body) data.insuranceExpiryDate = body.insuranceExpiryDate ? new Date(body.insuranceExpiryDate) : null;
      if ('inspectionExpiryDate' in body) data.inspectionExpiryDate = body.inspectionExpiryDate ? new Date(body.inspectionExpiryDate) : null;

      const updated = await server.prisma.vehicle.update({ where: { id }, data });
      return { data: updated, error: null };
    } catch (err: any) {
      reply.code(400);
      return { data: null, error: err.message };
    }
  });
}
