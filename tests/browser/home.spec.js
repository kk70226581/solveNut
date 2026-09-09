import { test, expect } from '@playwright/test';

const homeData = {
  stats: { approvedExperts: 2, sessionsCompleted: 18, clientSatisfaction: 94 },
  experts: [
    { name: 'Jordan Lee', domain: 'Career strategy', exp: '8+ yrs', sessions: 24, tag: 'Verified expert', color: '#22d3ee', initial: 'JL' },
    { name: 'Maya Chen', domain: 'Business planning', exp: '11+ yrs', sessions: 31, tag: 'Top rated', color: '#34d399', initial: 'MC' },
  ],
};

async function prepareHome(page) {
  await page.route('**/api/public-home-data', route => route.fulfill({ json: homeData }));
  await page.route('**/api/help', async route => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: { answer: 'Choose the relevant workspace from your dashboard.' } });
  });
}

test('home page presents live data, navigation, and help at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareHome(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Real-world expertise/ })).toBeVisible();
  await expect(page.locator('.hp-stat-value').first()).toHaveText('2+');
  await expect(page.locator('.hp-expert-card')).toHaveCount(2);
  await expect(page.getByText('2,400+ professionals')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Experts', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Open help chat' }).click();
  await expect(page.locator('.helpbot-modal')).toBeVisible();
  await page.locator('.helpbot-input').fill('How do I book an expert?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.helpbot-message.assistant').last()).toContainText('Choose the relevant workspace');

  await page.getByRole('button', { name: 'Close help' }).click();
  await page.getByRole('button', { name: 'Experts', exact: true }).click();
  await expect(page).toHaveURL(/\/experts$/);
});

test('home page drawer and cards remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareHome(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Toggle menu' }).click();
  await expect(page.locator('.hp-drawer--open')).toBeVisible();
  await page.locator('.hp-drawer').getByRole('button', { name: 'Browse experts' }).click();
  await expect(page).toHaveURL(/\/experts$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
