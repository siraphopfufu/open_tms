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
      const [billedLineItems, podAttachments] = shipmentIds.length
        ? await Promise.all([
            server.prisma.invoiceLineItem.findMany({
              where: { shipmentId: { in: shipmentIds } },
              select: { shipmentId: true, invoice: { select: { id: true, invoiceNumber: true, status: true } } },
            }),
            // PoC demo definition-of-done: "A delivered trip stays out of the
            // billing queue until a delivery document is attached." Any
            // attachment on the shipment counts as the POD for this demo —
            // there's no dedicated "delivery note" document type yet.
            server.prisma.attachment.findMany({
              where: { entityType: 'shipment', entityId: { in: shipmentIds } },
              select: { entityId: true },
            }),
          ])
        : [[], []];
      const invoiceByShipment = new Map(billedLineItems.map(li => [li.shipmentId as string, li.invoice]));
      const podByShipment = new Set(podAttachments.map(a => a.entityId));

      const unbilled: any[] = [];
      const billed: any[] = [];
      const awaitingDocument: any[] = [];

      for (const s of shipments) {
        const invoice = invoiceByShipment.get(s.id);
        const podReceived = podByShipment.has(s.id);
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
          podReceived,
        };
        if (invoice) billed.push(item);
        else if (podReceived) unbilled.push(item);
        else awaitingDocument.push(item);
      }

      return { data: { unbilled, billed, awaitingDocument }, error: null };
    } catch (err: any) {
      reply.code(500);
      return { data: null, error: err.message };
    }
  });
}
