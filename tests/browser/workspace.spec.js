import { test, expect } from '@playwright/test';

const client = { name: 'Alex Morgan', email: 'client@example.com', role: 'client', phone: '', location: '', focusArea: '' };
const expert = { name: 'Jordan Lee', email: 'expert@example.com', role: 'expert', field: 'Career', headline: 'Make your next career move with confidence.', status: 'approved', price: 800, experience: 8, avgRating: 4.8, ratingsCount: 24 };
const room = 'client@example.com_expert@example.com';
const messages = Array.from({ length: 30 }, (_, i) => ({ _id: String(i), room, author: i % 2 ? client.email : expert.email, message: i === 29 ? 'A long message: ' + 'context'.repeat(90) : `Let’s work through your next step. Message ${i + 1}`, createdAt: new Date().toISOString() }));

async function prepare(page, role = 'client') {
  const person = role === 'client' ? client : expert;
  await page.addInitScript(({ person }) => {
    const token = `test.${btoa(JSON.stringify({ ...person, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
    for (const [key, value] of Object.entries({ token, email: person.email, name: person.name, username: person.name, role: person.role })) localStorage.setItem(key, value);
  }, { person });
  let profile = { ...person };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let data = {};
    if (url.pathname === '/api/profile') {
      if (route.request().method() === 'PUT') { profile = { ...profile, ...route.request().postDataJSON() }; data = { success: true, user: profile }; }
      else data = url.searchParams.get('email') === expert.email ? expert : profile;
    } else if (url.pathname === '/api/experts') data = [expert];
    else if (url.pathname === '/api/conversations') data = [{ room, otherEmail: role === 'client' ? expert.email : client.email, otherName: role === 'client' ? expert.name : client.name, lastMessage: 'Ready to explore your next step?', lastMessageTime: new Date().toISOString() }];
    else if (url.pathname === '/api/messages') data = messages;
    else if (url.pathname === '/api/my-payments') data = [];
    else if (url.pathname === '/api/check-payment') data = { hasAccess: true, hoursLeft: 24, accessUntil: new Date(Date.now() + 86400000).toISOString() };
    await route.fulfill({ json: data });
  });
  await page.route('**/socket.io/**', route => route.abort());
}

async function fits(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [390, 768, 1440]) {
  test(`client chat fits ${width}px and keeps expert details accessible`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page);
    await page.goto('/chat?email=expert@example.com');
    await expect(page.getByRole('log')).toContainText('A long message');
    await fits(page, '.chat-input-area');
    await expect(page.getByLabel('Message to expert')).toBeVisible();
    await page.screenshot({ path: `test-results/client-chat-${width}.png` });
    if (width <= 900) {
      await page.locator('.mobile-pane-btn').nth(1).click();
      await expect(page.locator('.expert-card')).toBeVisible();
      await page.locator('.mobile-pane-btn').first().click();
      await expect(page.getByLabel('Message to expert')).toBeVisible();
    }
  });
  test(`expert chat fits ${width}px with message search`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page, 'expert');
    await page.goto('/expert-dashboard');
    await page.getByRole('button', { name: 'Open messages' }).click();
    const conversation = page.locator('.ed-conv-item').first();
    if (width <= 900) await page.getByRole('button', { name: 'View Conversations', exact: true }).click();
    await conversation.click();
    await expect(page.getByRole('log')).toContainText('A long message');
    await fits(page, '.ed-compose');
    await page.getByLabel('Message to client').fill('Keep this draft while offline');
    await page.locator('.ed-send-btn').click();
    await expect(page.getByLabel('Message to client')).toHaveValue('Keep this draft while offline');
    await expect(page.locator('.ed-chat-error')).toContainText('Reconnecting');
    if (width > 640) {
      await page.getByTitle('Search messages').click();
      await page.locator('.ed-msg-search-bar input').fill('A long message');
      await expect(page.locator('.ed-msg-search-count')).toContainText('1 results');
    }
    await page.screenshot({ path: `test-results/expert-chat-${width}.png` });
  });
}

test('client dashboard saves a decision across reload and edits profile', async ({ page }) => {
  await prepare(page);
  await page.goto('/client-dashboard');
  await expect(page.locator('.cd-conversations')).toContainText('Jordan Lee');
  await page.screenshot({ path: 'test-results/client-dashboard.png', fullPage: true });
  await page.getByRole('button', { name: 'Add decision', exact: true }).first().click();
  await page.locator('.cd-modal input').first().fill('Choose my next role');
  await page.locator('.cd-modal-foot .cd-btn-primary').click();
  await expect(page.locator('.cd-board-card-title')).toHaveText('Choose my next role');
  await page.reload();
  await expect(page.locator('.cd-board-card-title')).toHaveText('Choose my next role');
  await page.getByLabel('Settings', { exact: true }).click();
  await page.getByLabel('Location (optional)').fill('Bengaluru');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Profile saved');
});

test('expert dashboard exposes failed requests with a retry', async ({ page }) => {
  await prepare(page, 'expert');
  await page.route('**/api/my-payments', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/expert-dashboard');
  await expect(page.locator('.ed-error-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

for (const type of ['audio', 'video']) {
  test(`two participants connect over ${type} and release their devices`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const a = await context.newPage();
    const b = await context.newPage();
    for (const [page, peer] of [[a, b], [b, a]]) {
      await page.exposeFunction('relaySignal', payload => peer.evaluate(({ event, data }) => window.testSocket.receive(event, data), payload));
    }
    await a.goto('/tests/browser/call.html?role=client');
    await b.goto('/tests/browser/call.html?role=expert');
    await a.getByRole('button', { name: `Start ${type} call`, exact: true }).click();
    await b.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(a.locator('.vc-status')).toContainText('Live', { timeout: 15000 });
    await expect(b.locator('.vc-status')).toContainText('Live');
    for (const page of [a, b]) {
      expect(await page.locator('audio').evaluate(audio => audio.srcObject.getAudioTracks().length)).toBe(1);
      expect(await page.locator('audio').evaluate(audio => !audio.paused && !audio.muted)).toBe(true);
    }
    await a.getByRole('button', { name: 'Mute microphone', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Unmute microphone', exact: true })).toBeVisible();
    if (type === 'video') {
      await expect.poll(() => a.locator('.vc-video-card-local video').evaluate(video => video.videoWidth)).toBeGreaterThan(0);
      await expect.poll(() => b.locator('.vc-video-card-remote video').evaluate(video => video.videoWidth)).toBeGreaterThan(0);
      await a.evaluate(() => {
        navigator.mediaDevices.getDisplayMedia = () => navigator.mediaDevices.getUserMedia({ video: true });
      });
      await a.getByRole('button', { name: 'Share screen', exact: true }).click();
      await expect(a.locator('.vc-video-card-local video')).toHaveClass(/vc-screen-share/);
      await a.getByRole('button', { name: 'Stop screen sharing', exact: true }).click();
      await expect(a.locator('.vc-video-card-local video')).toHaveClass(/vc-camera/);
      await a.getByRole('button', { name: 'Move and resize panel' }).click();
      await a.getByTestId('background-action').click();
      await expect(a.getByTestId('background-action')).toHaveText('Workspace available');
      const before = await a.locator('.vc-panel').boundingBox();
      await a.waitForTimeout(500);
      const after = await a.locator('.vc-panel').boundingBox();
      expect(Math.abs(before.width - after.width)).toBeLessThan(2);
      await a.getByRole('button', { name: 'Dock panel' }).click();
      await a.getByRole('button', { name: 'Open fullscreen' }).click();
      await expect(a.locator('.vc-panel')).toHaveClass(/vc-panel-fullscreen/);
      await a.getByRole('button', { name: 'Exit fullscreen' }).click();
      const preview = await a.locator('.vc-video-card-local').boundingBox();
      expect(preview.height).toBeLessThanOrEqual(150);
      for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await a.setViewportSize(viewport);
        await fits(a, '.vc-actions');
      }
      await a.setViewportSize({ width: 1280, height: 900 });
    }
    await a.screenshot({ path: `test-results/${type}-call.png` });
    await a.getByRole('button', { name: 'End call', exact: true }).click();
    await expect(b.getByRole('button', { name: 'Start audio call', exact: true })).toBeVisible();
    expect(await a.locator('.vc-video-card-local video').evaluate(video => video.srcObject)).toBeNull();
    await context.close();
  });
}

test('permission errors stay visible and cancelling pending permission stops the eventual stream', async ({ page }) => {
  await page.goto('/tests/browser/call.html');
  await page.evaluate(() => {
    window.originalMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.getByRole('button', { name: 'Start video call', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('permission was denied');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.allowMedia = resolve; });
  });
  await page.getByRole('button', { name: 'Start video call', exact: true }).click();
  await page.getByRole('button', { name: 'End call', exact: true }).click();
  await page.evaluate(async () => {
    window.lateStream = await window.originalMedia({ audio: true, video: true });
    window.allowMedia(window.lateStream);
  });
  await expect.poll(() => page.evaluate(() => window.lateStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Start video call', exact: true })).toBeVisible();
});
