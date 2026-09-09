import { test, expect } from '@playwright/test';

const user = { name: 'Alex Morgan', email: 'client@example.com', role: 'client' };

async function prepare(page) {
  await page.addInitScript(({ user: person }) => {
    const token = `test.${btoa(JSON.stringify({ ...person, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
    for (const [key, value] of Object.entries({ token, email: person.email, name: person.name, username: person.name, role: person.role })) {
      localStorage.setItem(key, value);
    }
  }, { user });

  await page.route('**/api/ai/start', route => route.fulfill({
    json: { success: true, conversation: { _id: 'conversation-1', domain: 'career' }, firstExchange: null },
  }));
  await page.route('**/api/ai/message', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: [
      'event: ready\ndata: {"conversationId":"conversation-1"}',
      'event: token\ndata: {"token":"## A clearer next step\\n\\n"}',
      'event: token\ndata: {"token":"**Compare** the offers against your priorities."}',
      'event: done\ndata: {"messageId":"assistant-1","text":"## A clearer next step\\n\\n**Compare** the offers against your priorities.","confidenceScore":88,"recommendEscalation":false}',
      '',
    ].join('\n\n'),
  }));
  await page.route('**/api/ai/feedback', route => route.fulfill({ json: { success: true } }));
}

test('AI Expert starts a guided consultation and exposes response actions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await prepare(page);
  await page.goto('/ai-expert');

  await expect(page.getByRole('heading', { name: 'Ask AI Expert' })).toBeVisible();
  await page.getByRole('button', { name: 'Compare two job offers' }).click();
  await expect(page.getByLabel('Describe your decision or problem')).toHaveValue('Compare two job offers');
  await page.getByLabel('Describe your decision or problem').fill('I have two job offers and need to choose thoughtfully.');
  await page.getByRole('button', { name: 'Start AI Consultation' }).click();

  await expect(page.getByRole('log')).toContainText('A clearer next step');
  await expect(page.getByRole('log')).toContainText('Compare');
  await expect(page.getByText('Confidence')).toContainText('88%');
  await expect(page.getByRole('button', { name: 'Copy AI response' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy AI response' }).click();
  await expect(page.locator('.ai-copy-btn')).toContainText('Copied');
  await page.getByRole('button', { name: 'Yes, this helped' }).click();
  await expect(page.locator('.ai-feedback--active')).toContainText('Yes, this helped');

  await page.getByRole('button', { name: 'Start a new consultation' }).click();
  await expect(page.getByRole('button', { name: 'Start AI Consultation' })).toBeVisible();
});

test('AI Expert remains usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.goto('/ai-expert');

  await expect(page.getByRole('button', { name: 'Book a verified human expert' })).toBeVisible();
  await expect(page.locator('.ai-domain-grid')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start AI Consultation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ai-expert-mobile.png', fullPage: true });
});
