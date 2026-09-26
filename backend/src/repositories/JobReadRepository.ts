/**
 * Read side of the job-to-billing flow (งาน = Order, one Shipment per
 * container). Shared by the jobs routes and the shipment assistant, so both
 * answer from exactly the same derived state (POD received, ready to bill,
 * settlement, margin).
 *
 * Every method takes orgId and scopes by it; ids passed in are only ever
 * narrowed against that org, never trusted to select it.
 */
import { PrismaClient } from '@prisma/client';

export interface JobListFilter {
  /** Matches order number, booking number, customer name or container number. */
  search?: string;
  status?: string;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
}

export interface JobLookup {
  jobId?: string;
  orderNumber?: string;
  containerNumber?: string;
  shipmentReference?: string;
}

const MAX_LIMIT = 100;

export class JobReadRepository {
  constructor(private prisma: PrismaClient) {}

  async listJobs(orgId: string, filter: JobListFilter = {}) {
    const search = filter.search?.trim();
    const orders = await this.prisma.order.findMany({
      where: {
        orgId,
        status: filter.status ?? { not: 'cancelled' },
        ...((filter.createdFrom || filter.createdTo) && {
          createdAt: { ...(filter.createdFrom && { gte: filter.createdFrom }), ...(filter.createdTo && { lte: filter.createdTo }) },
        }),
        ...(search && {
          OR: [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { poNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { orderShipments: { some: { shipment: { shippingContainer: { containerNumber: { contains: search, mode: 'insensitive' } } } } } },
          ],
        }),
      },
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
      take: Math.min(filter.limit ?? MAX_LIMIT, MAX_LIMIT),
    });

    return orders.map(o => ({
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
  }

  /** Resolves a job id from any identifier a dispatcher might quote. */
  async findJobId(orgId: string, lookup: JobLookup): Promise<string | null> {
    if (lookup.jobId) {
      const order = await this.prisma.order.findFirst({ where: { id: lookup.jobId, orgId }, select: { id: true } });
      if (order) return order.id;
    }
    if (lookup.orderNumber) {
      const order = await this.prisma.order.findFirst({
        where: { orgId, orderNumber: { equals: lookup.orderNumber.trim(), mode: 'insensitive' } },
        select: { id: true },
      });
      if (order) return order.id;
    }
    if (lookup.containerNumber || lookup.shipmentReference) {
      const link = await this.prisma.orderShipment.findFirst({
        where: {
          order: { orgId },
          shipment: {
            orgId,
            ...(lookup.containerNumber && {
              shippingContainer: { containerNumber: { equals: lookup.containerNumber.replace(/\s+/g, ''), mode: 'insensitive' } },
            }),
            ...(lookup.shipmentReference && { reference: { equals: lookup.shipmentReference.trim(), mode: 'insensitive' } }),
          },
        },
        orderBy: { shipment: { createdAt: 'desc' } },
        select: { orderId: true },
      });
      if (link) return link.orderId;
    }
    return null;
  }

  async getJobDetail(orgId: string, jobId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: jobId, orgId },
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
    if (!order) return null;

    const shipmentIds = order.orderShipments.map(os => os.shipmentId);
    const shipments = await this.prisma.shipment.findMany({
      where: { id: { in: shipmentIds }, orgId },
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
      this.prisma.charge.findMany({ where: { shipmentId: { in: shipmentIds }, chargeCategory: 'revenue', status: { in: ['approved', 'invoiced'] } } }),
      this.prisma.attachment.findMany({ where: { entityType: 'shipment', entityId: { in: shipmentIds } }, select: { entityId: true, id: true, fileName: true } }),
      this.prisma.invoiceLineItem.findMany({ where: { shipmentId: { in: shipmentIds } }, select: { shipmentId: true, invoice: { select: { id: true, invoiceNumber: true, status: true } } } }),
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
        vehicle: load?.vehicle ? { id: load.vehicle.id, plate: load.vehicle.plate, carrierName: load.vehicle.carrier?.name, isOwnFleet: load.vehicle.carrier?.isOwnFleet ?? false } : null,
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
      id: order.id,
      orderNumber: order.orderNumber,
      bookingNumber: order.poNumber,
      status: order.status,
      createdAt: order.createdAt,
      customer: order.customer,
      origin: order.origin,
      destination: order.destination,
      containers,
    };
  }

  /** Driver advances paid out whose trip hasn't been settled (เคลียร์บิล) yet. */
  async listUnsettledAdvances(orgId: string, limit = 50) {
    const advances = await this.prisma.driverAdvance.findMany({
      where: { orgId, shipment: { tripSettlement: null } },
      select: {
        totalAdvanceCents: true,
        createdAt: true,
        driver: { select: { name: true } },
        shipment: {
          select: {
            reference: true,
            status: true,
            shippingContainer: { select: { containerNumber: true } },
            orderShipments: { select: { order: { select: { id: true, orderNumber: true } } }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, MAX_LIMIT),
    });
    return advances.map(a => ({
      driverName: a.driver?.name ?? null,
      totalAdvanceCents: a.totalAdvanceCents,
      advancedAt: a.createdAt,
      shipmentReference: a.shipment.reference,
      shipmentStatus: a.shipment.status,
      containerNumber: a.shipment.shippingContainer?.containerNumber ?? null,
      jobId: a.shipment.orderShipments[0]?.order.id ?? null,
      orderNumber: a.shipment.orderShipments[0]?.order.orderNumber ?? null,
    }));
  }

  /** Approved/invoiced revenue (ค่าระวาง) in a period, per customer. */
  async revenueSummary(orgId: string, from: Date, to: Date, customerName?: string) {
    const charges = await this.prisma.charge.findMany({
      where: {
        chargeCategory: 'revenue',
        status: { in: ['approved', 'invoiced'] },
        createdAt: { gte: from, lte: to },
        shipment: {
          orgId,
          ...(customerName && { customer: { name: { contains: customerName.trim(), mode: 'insensitive' } } }),
        },
      },
      select: { amountCents: true, currency: true, shipment: { select: { customer: { select: { name: true } } } } },
    });

    const byCustomer = new Map<string, { customerName: string; totalCents: number; chargeCount: number }>();
    for (const c of charges) {
      const name = c.shipment?.customer?.name ?? 'ไม่ระบุลูกค้า';
      const row = byCustomer.get(name) ?? { customerName: name, totalCents: 0, chargeCount: 0 };
      row.totalCents += c.amountCents;
      row.chargeCount += 1;
      byCustomer.set(name, row);
    }
    const customers = [...byCustomer.values()].sort((a, b) => b.totalCents - a.totalCents);
    return {
      from,
      to,
      currency: charges[0]?.currency ?? 'THB',
      totalCents: customers.reduce((sum, r) => sum + r.totalCents, 0),
      customers,
    };
  }
}
