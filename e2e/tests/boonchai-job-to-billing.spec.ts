import { test, expect, type Page } from '@playwright/test';
import { login } from './support/login';

// The Boonchai PoC flow end to end: open a two-container job, dispatch both
// (own fleet + a new subcontractor), advance and settle container 1, deliver
// it, attach the delivery document, share it with the customer, then bill it.
// Mutates data, so it only runs against the throwaway stack (see README).


// Container 1 revenue 18,000.00 THB -> VAT 7% 1,260.00, WHT 1% 180.00, net 19,080.00
const EXPECTED_INVOICE = {
  subtotal: '฿18,000.00',
  vat: '฿1,260.00',
  wht: '-฿180.00',
  net: '฿19,080.00',
};


async function pickOption(page: Page, trigger: string, option: string | null) {
  await page.getByText(trigger).first().click();
  const target = option ? page.getByRole('option', { name: option }) : page.getByRole('option').first();
  await target.click();
}

// Labelled inputs on the job page use a <Label> sibling, not a placeholder.
const fieldByLabel = (page: Page, label: string) =>
  page.locator(`div:has(> label:text-is("${label}"))`).first().locator('input');

// Chips in the status strip read "<label>" followed by their state text.
const chip = (page: Page, text: string) => page.getByText(text, { exact: false }).first();

test('Boonchai job to billing', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Mutating flow: only runs against the local E2E stack');

  await login(page);

  // ── 1. Open a job with two containers ─────────────────────────────────
  await page.goto('/jobs/new');
  await pickOption(page, 'เลือกลูกค้า...', 'Boonchai Transport Customer Co., Ltd.');
  await page.getByText('เลือกสถานที่...').first().click();
  await page.getByText('Laem Chabang Terminal B3 (LCIT)').click();
  await page.getByText('เลือกสถานที่...').first().click();
  await page.getByText('ICD Lat Krabang').click();
  await page.getByPlaceholder('15000').fill('18000');
  await page.getByRole('button', { name: 'เพิ่มตู้' }).click();
  await page.getByPlaceholder('15000').nth(1).fill('17500');

  const jobResponse = page.waitForResponse(r => /\/api\/v1\/jobs\/[0-9a-f-]+$/.test(r.url()) && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'เปิดงาน' }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]+$/);
  const job = (await (await jobResponse).json()).data;
  expect(job.containers).toHaveLength(2);
  const [container1] = job.containers;

  // ── 2. Dispatch container 1 to the own fleet ──────────────────────────
  await pickOption(page, 'เลือกบริษัทรถ...', 'Boonchai Transport - Own Fleet');
  await pickOption(page, 'เลือกรถหัวลาก...', null);
  await pickOption(page, 'เลือกคนขับ...', null);
  await page.getByRole('button', { name: 'จัดรถ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เบิกเงินทดรอง' }).first()).toBeVisible();

  // ── 3. Dispatch container 2 to a brand-new subcontractor ──────────────
  await page.getByRole('button', { name: 'รถร่วม' }).click();
  await page.getByPlaceholder('ชื่อผู้รับจ้าง / บริษัท').fill('สมชาย ขนส่ง E2E');
  await page.getByPlaceholder('ทะเบียนหัวลาก').fill('80-5678 ระยอง');
  await page.getByPlaceholder('ทะเบียนหางลาก').fill('80-5679 ระยอง');
  await page.getByPlaceholder('เลขผู้เสียภาษี').fill('1234567890123');
  await page.getByPlaceholder('เลขบัตรประชาชน').fill('3456789012345');
  await page.getByPlaceholder('เบอร์โทร').fill('081-234-5678');
  await page.getByRole('button', { name: 'บันทึกและจัดรถ' }).click();
  await expect(page.getByRole('button', { name: 'เบิกเงินทดรอง' })).toHaveCount(2);

  // ── 4. Job sheet opens and renders ────────────────────────────────────
  const [jobSheet] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'ใบปฏิบัติงาน' }).first().click(),
  ]);
  await jobSheet.waitForLoadState('load');
  await expect(jobSheet.locator('body')).toContainText(container1.reference);
  await jobSheet.close();

  // ── 5. Driver advance on container 1 ──────────────────────────────────
  await fieldByLabel(page, 'ค่าน้ำมัน (โดยประมาณ)').fill('1200');
  await fieldByLabel(page, 'ค่าทางด่วน').fill('150');
  await page.getByRole('button', { name: 'เบิกเงินทดรอง' }).first().click();
  await expect(page.getByText(/เงินทดรอง: ฿/).first()).toBeVisible();

  // ── 6. Settle container 1 ─────────────────────────────────────────────
  await fieldByLabel(page, 'ระยะทาง (กม.)').fill('150');
  await fieldByLabel(page, 'ราคาน้ำมัน (บาท/ลิตร)').fill('32');
  await fieldByLabel(page, 'น้ำมันจริง (ลิตร)').fill('35');
  await fieldByLabel(page, 'ค่าทางด่วนจริง').fill('140');
  await page.getByRole('button', { name: 'เคลียร์บิล', exact: true }).first().click();
  await expect(page.getByText(/คนขับคืนเงิน|บริษัทจ่ายเพิ่ม/).first()).toBeVisible();
  await expect(chip(page, 'เคลียร์บิลแล้ว')).toBeVisible();

  // ── 7. Deliver: not billable yet without the delivery document ────────
  await page.getByRole('button', { name: 'ส่งถึงแล้ว' }).first().click();
  await expect(chip(page, 'ขาดใบส่งของ')).toBeVisible();
  await expect(chip(page, 'พร้อมวางบิล')).toHaveCount(0);

  // ── 8. Attach the delivery document -> ready to bill ──────────────────
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'pod.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('E2E delivery note\n'),
  });
  await expect(chip(page, 'แนบแล้ว (1)')).toBeVisible();
  await expect(chip(page, 'พร้อมวางบิล')).toBeVisible();

  // ── 9. Customer share link works with its one-time access code ────────
  await page.getByRole('button', { name: 'ลิงก์ติดตามสำหรับลูกค้า' }).first().click();
  const copyCode = page.getByRole('button', { name: 'คัดลอกรหัส' });
  await expect(copyCode).toBeVisible();
  const shareBox = copyCode.locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]');
  const shareUrl = (await shareBox.locator('span.truncate').first().textContent())!.trim();
  const accessCode = (await shareBox.locator('span.font-mono').first().textContent())!.trim();
  expect(shareUrl).toMatch(/\/share\/[^/]+$/);
  expect(accessCode).not.toBe('');

  const customer = await page.context().browser()!.newContext();
  const sharePage = await customer.newPage();
  await sharePage.goto(new URL(new URL(shareUrl).pathname, page.url()).toString());
  await sharePage.getByLabel('Your email address').fill('customer@example.com');
  await sharePage.getByLabel('Access code').fill(accessCode);
  await sharePage.getByRole('button', { name: 'View shipment' }).click();
  await expect(sharePage.getByRole('heading', { level: 1 })).toHaveText(container1.reference);
  await customer.close();

  // ── 10. Bill container 1 ──────────────────────────────────────────────
  await page.goto('/finance/invoices/create');
  const row = page.getByRole('row').filter({ hasText: container1.reference });
  await expect(row).toContainText('฿18,000.00');
  await row.click();
  await page.getByRole('button', { name: 'สร้างใบแจ้งหนี้' }).click();
  await page.waitForURL(/\/finance\/invoices\/[0-9a-f-]+$/);

  // ── 11. Invoice carries Thai VAT/WHT ──────────────────────────────────
  const totalRow = (label: string) => page.locator('div.flex.justify-between').filter({ hasText: label }).first();
  await expect(totalRow('ยอดรวม')).toContainText(EXPECTED_INVOICE.subtotal);
  await expect(totalRow('ภาษีมูลค่าเพิ่ม (7%)')).toContainText(EXPECTED_INVOICE.vat);
  await expect(totalRow('ภาษีหัก ณ ที่จ่าย (1%)')).toContainText(EXPECTED_INVOICE.wht);
  await expect(totalRow('ยอดสุทธิ')).toContainText(EXPECTED_INVOICE.net);

  // ── 12. Billed shipments leave the ready-to-invoice list ──────────────
  await page.goto('/finance/invoices/create');
  await expect(page.getByRole('row').filter({ hasText: container1.reference })).toHaveCount(0);
});
