import { test, expect } from '@playwright/test';

// Read-only checks that are safe against any environment, including
// production (E2E_BASE_URL=https://tms.ather-ai.com). Nothing here logs in
// or writes data.

test('API answers through the public origin', async ({ request }) => {
  // The ALB routes /api/* to the backend; an unauthenticated read proves the
  // backend is up and reachable without needing credentials.
  const res = await request.get('/api/v1/shipments');
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ data: null, error: 'Authorization header required' });
});

test('login page renders and talks to the API over the same scheme', async ({ page, baseURL }) => {
  const insecureRequests: string[] = [];
  page.on('request', req => {
    if (baseURL!.startsWith('https:') && req.url().startsWith('http:')) insecureRequests.push(req.url());
  });

  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  // Submitting bad credentials must reach the backend and come back as a
  // rejected login, not a network/mixed-content failure.
  await page.getByPlaceholder('you@company.com').fill('smoke-test@example.invalid');
  await page.getByPlaceholder('Enter your password').fill('not-a-real-password');
  const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  const res = await loginResponse;
  expect(res.status()).toBe(401);
  expect(new URL(res.url()).origin).toBe(new URL(baseURL!).origin);

  expect(insecureRequests).toEqual([]);
});

test('client-side routes fall back to the app instead of 404', async ({ page }) => {
  const res = await page.goto('/jobs/new');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/Ather TMS/);
});
