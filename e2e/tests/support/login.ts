import type { Page } from '@playwright/test';

export const ADMIN = { email: 'admin@meridian-tms.demo', password: 'Password1!' };

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill(ADMIN.email);
  await page.getByPlaceholder('Enter your password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(url => new URL(url).pathname === '/');
}
