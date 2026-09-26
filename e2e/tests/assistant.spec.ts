import { test, expect } from '@playwright/test';
import { login } from './support/login';

// The E2E stack points the assistant at mock-claude.ts, a scripted stand-in
// for the Messages API. That still runs the real tool loop, tools and
// database, so the answer below is built from real seeded jobs.

test('ผู้ช่วย AI answers from real job data and links to the jobs it mentions', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Needs the mock model in the local E2E stack');

  await login(page);
  await page.getByRole('link', { name: 'ผู้ช่วย AI' }).click();
  await expect(page).toHaveURL(/\/assistant$/);

  await page.getByLabel('ถามผู้ช่วย AI').fill('วันนี้มีงานอะไรบ้าง');
  const chat = page.waitForResponse(r => r.url().endsWith('/api/v1/assistant/chat'));
  await page.getByRole('button', { name: 'ถาม' }).click();
  const res = await chat;
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.data.toolCalls).toEqual([{ name: 'search_jobs', input: { limit: 5 }, isError: false }]);
  expect(body.data.jobRefs.length).toBeGreaterThan(0);
  expect(body.data.decisionId).toEqual(expect.any(String));

  const answer = page.locator('[data-role="assistant"]').last();
  const firstJob = body.data.jobRefs[0];
  await expect(answer).toContainText(/พบ \d+ งาน/);
  await expect(answer).toContainText(firstJob.orderNumber);
  await expect(answer).toContainText('ข้อมูลจาก: ค้นหางาน');

  await answer.getByRole('link', { name: firstJob.orderNumber }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${firstJob.jobId}$`));
});

test('ผู้ช่วย AI rejects malformed conversations', async ({ page, request }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Needs the mock model in the local E2E stack');

  await login(page);
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const endsWithAssistant = await request.post('/api/v1/assistant/chat', {
    headers,
    data: { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] },
  });
  expect(endsWithAssistant.status()).toBe(400);

  const tooLong = await request.post('/api/v1/assistant/chat', {
    headers,
    data: { messages: [{ role: 'user', content: 'x'.repeat(2001) }] },
  });
  expect(tooLong.status()).toBe(400);
});
