import { PDFDocument } from 'pdf-lib';
import { DocumentGenerationService } from '../../services/DocumentGenerationService';

// Every document must be branded, numbered and tagged with the org that owns
// it. The mock returns a different tenant for any lookup that isn't scoped by
// id, so an unscoped query shows up as the wrong org in the output.

const OWNER = { id: 'org-owner', name: 'Owner Logistics', mcNumber: 'MC-OWNER', themeConfig: null, logoStorageKey: null };
const OTHER = { id: 'org-other', name: 'Other Tenant', mcNumber: 'MC-OTHER', themeConfig: null, logoStorageKey: null };

const place = { name: 'Depot', address1: '1 Road', city: 'Bangkok', state: '', postalCode: '10110', country: 'TH' };

const shipment = {
  id: 'ship-1',
  orgId: OWNER.id,
  reference: 'SH-001',
  status: 'in_transit',
  customerId: 'cust-1',
  pickupDate: new Date('2026-09-01'),
  deliveryDate: new Date('2026-09-02'),
  origin: place,
  destination: place,
  customer: { id: 'cust-1', name: 'Customer Co' },
  carrier: { id: 'car-1', name: 'Carrier Co' },
  loads: [],
  stops: [],
  orderShipments: [],
  shippingContainer: null,
  driverAdvance: null,
  charges: [{ description: 'Linehaul', amountCents: 50_000, chargeCategory: 'cost', status: 'approved' }],
  shipmentFinancialSummary: null,
};

const order = {
  id: 'ord-1',
  orgId: OWNER.id,
  orderNumber: 'ORD-001',
  customer: { name: 'Customer Co' },
  origin: place,
  destination: place,
  trackableUnits: [{ identifier: 'TU-1', unitType: 'pallet', sequenceNumber: 1 }],
  orderShipments: [],
};

function buildPrisma() {
  const orgs: Record<string, any> = { [OWNER.id]: { ...OWNER, bolSequenceNumber: 41 }, [OTHER.id]: { ...OTHER, bolSequenceNumber: 7 } };
  return {
    shipment: { findUniqueOrThrow: jest.fn().mockResolvedValue(shipment) },
    order: { findUniqueOrThrow: jest.fn().mockResolvedValue(order) },
    organization: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(orgs[where.id] ?? null)),
      findFirst: jest.fn(() => Promise.resolve(OTHER)),
      update: jest.fn(({ where, data }: any) => {
        const org = orgs[where.id];
        if (data.bolSequenceNumber?.increment) org.bolSequenceNumber += data.bolSequenceNumber.increment;
        return Promise.resolve({ bolSequenceNumber: org.bolSequenceNumber });
      }),
    },
  } as any;
}

function setup() {
  const prisma = buildPrisma();
  const docRepo = { create: jest.fn().mockResolvedValue({ id: 'doc-1' }) } as any;
  const templateRepo = { findById: jest.fn(), findDefault: jest.fn().mockResolvedValue(null) } as any;
  const service = new DocumentGenerationService(prisma, templateRepo, docRepo);
  const pdfSpy = jest.spyOn(service, 'htmlToPdf');
  return { prisma, docRepo, service, pdfSpy };
}

const storedMetadata = (docRepo: any) => docRepo.create.mock.calls[0][0].metadata;

afterEach(() => jest.restoreAllMocks());

describe('DocumentGenerationService — org scoping', () => {
  it('BOL: claims the next number from the owning org with an atomic increment', async () => {
    const { prisma, docRepo, service } = setup();

    await service.generateBOL('ship-1');

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: OWNER.id },
      data: { bolSequenceNumber: { increment: 1 } },
      select: { bolSequenceNumber: true },
    });
    expect(storedMetadata(docRepo).bolNumber).toMatch(/^BOL-\d{8}-0042$/);
    expect(storedMetadata(docRepo).branding.orgName).toBe(OWNER.name);
  });

  it('labels: branded with the order’s org', async () => {
    const { docRepo, service } = setup();
    await service.generateLabels('ord-1');
    expect(storedMetadata(docRepo).branding.orgName).toBe(OWNER.name);
  });

  it('customs form: branded with the shipment’s org', async () => {
    const { docRepo, service } = setup();
    await service.generateCustomsForm('ship-1');
    expect(storedMetadata(docRepo).branding.orgName).toBe(OWNER.name);
  });

  it('rate confirmation: MC number and branding come from the shipment’s org', async () => {
    const { docRepo, service } = setup();
    await service.generateRateConfirmation('ship-1');
    const metadata = storedMetadata(docRepo);
    expect(JSON.stringify(metadata)).toContain('MC-OWNER');
    expect(JSON.stringify(metadata)).not.toContain('MC-OTHER');
    expect(metadata.branding.orgName).toBe(OWNER.name);
  });

  it('job sheet: branded with the shipment’s org', async () => {
    const { service } = setup();
    const html = await service.renderJobSheetHtml('ship-1');
    expect(html).toContain(OWNER.name);
    expect(html).not.toContain(OTHER.name);
  });

  it('PDF creator metadata is the owning org, never another tenant', async () => {
    const { service, pdfSpy } = setup();
    await service.generateBOL('ship-1');

    expect(pdfSpy.mock.calls[0][2]).toBe(OWNER.name);
    const pdf = await PDFDocument.load(await pdfSpy.mock.results[0].value);
    expect(pdf.getCreator()).toBe(OWNER.name);
  });

  it('never falls back to an unscoped organization lookup', async () => {
    const { prisma, service } = setup();
    await service.generateBOL('ship-1');
    await service.generateLabels('ord-1');
    await service.generateCustomsForm('ship-1');
    await service.generateRateConfirmation('ship-1');
    await service.renderJobSheetHtml('ship-1');
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });
});
