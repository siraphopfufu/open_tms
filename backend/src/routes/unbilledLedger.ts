/**
 * Master Unbilled vs Billed Ledger (Must Have #13): every completed shipment
 * split into "not yet invoiced" and "invoiced", so accounting can see what's
 * fallen through the cracks instead of billing tripping over month-end
 * surprises. Lives in the tms module (not finance) because it reads
 * Shipment directly and tms is the side of the dependency DAG allowed to see
 * both Shipment and Invoice/InvoiceLineItem.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { registerOrgScope } from '../auth/orgScopeMiddleware.js';

export async function unbilledLedgerRoutes(server: FastifyInstance) {
  await registerOrgScope(server);

  server.get('/api/v1/finance/unbilled-ledger', {
    schema: { tags: ['Financial - Invoices'], description: 'Completed shipments split into unbilled vs billed' },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = req.orgId!;
    try {
      const shipments = await server.prisma.shipment.findMany({
        where: { orgId, deletedAt: null, archived: false, status: 'complete' },
        select: {
          id: true,
          reference: true,
          deliveryDate: true,
          updatedAt: true,
          customer: { select: { name: true } },
          origin: { select: { city: true, name: true } },
          destination: { select: { city: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
      });

      const shipmentIds = shipments.map(s => s.id);
      const billedLineItems = shipmentIds.length
        ? await server.prisma.invoiceLineItem.findMany({
            where: { shipmentId: { in: shipmentIds } },
            select: { shipmentId: true, invoice: { select: { id: true, invoiceNumber: true, status: true } } },
          })
        : [];
      const invoiceByShipment = new Map(billedLineItems.map(li => [li.shipmentId as string, li.invoice]));

      const unbilled: any[] = [];
      const billed: any[] = [];

      for (const s of shipments) {
        const invoice = invoiceByShipment.get(s.id);
        const item = {
          shipmentId: s.id,
          reference: s.reference,
          customerName: s.customer.name,
          originCity: s.origin?.city ?? s.origin?.name ?? null,
          destinationCity: s.destination?.city ?? s.destination?.name ?? null,
          completedAt: s.deliveryDate ?? s.updatedAt,
          invoiceId: invoice?.id ?? null,
          invoiceNumber: invoice?.invoiceNumber ?? null,
          invoiceStatus: invoice?.status ?? null,
        };
        if (invoice) billed.push(item);
        else unbilled.push(item);
      }

      return { data: { unbilled, billed }, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });
}
