import { test, expect } from '@playwright/test';
test('local character survives refresh, undo, checkpoint restore, export and import', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await page.getByRole('button', { name: 'New character', exact: true }).first().click();
  await page.getByLabel('Character name', { exact: true }).fill('Aria');
  await page.getByLabel('Character name', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Aria', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add 1 Wood', exact: true }).click();
  await page.getByRole('button', { name: 'Add 1 Wood', exact: true }).click();
  await page.getByRole('button', { name: 'Add 1 Attack / Melee XP', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const characterUrl = page.url();
  await page.reload();
  // Local mode does not impersonate a cloud session; choose it again after a reload.
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await expect(page.getByRole('heading', { name: 'Aria', exact: true })).toBeVisible();
  await expect(page.locator('.skill-attack .xp-track')).toHaveAttribute('aria-label', '1 XP');
  await page.getByRole('button', { name: 'Undo latest action' }).click();
  await expect(page.locator('.skill-attack .xp-track')).toHaveAttribute('aria-label', '0 XP');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/kingdoms.*json/);
  const backupPath = await download.path();
  await page.getByRole('button', { name: 'Browse checkpoints' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.getByLabel('Restore this checkpoint over the current character state.').check();
  await page.getByRole('button', { name: 'Restore checkpoint', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('link', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Import save' }).click();
  await page.getByLabel('Backup file').setInputFiles(backupPath!);
  await expect(page.getByRole('heading', { name: 'Preview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import backup', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Add 1 Wood', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.goto(characterUrl);
  await page.reload();
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await expect(page.getByRole('heading', { name: 'Aria', exact: true })).toBeVisible();
  await expect(page.locator('.skill-attack .xp-slot')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Reach level 8 in any skill.', exact: true }).check();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Reach level 8 in any skill.', exact: true }),
  ).toBeChecked();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/character-sheet.png', fullPage: true });
});
test('production app reloads offline with cached character state', async ({ page, context }) => {
  await page.goto('http://127.0.0.1:4174/');
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await page.getByRole('button', { name: 'New character', exact: true }).first().click();
  await page.getByLabel('Character name', { exact: true }).fill('Offline ranger');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Offline ranger', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await expect(page.getByRole('heading', { name: 'Offline ranger', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add 1 Wood', exact: true }).click();
  await page.getByRole('button', { name: 'Add 1 Wood', exact: true }).click();
  await expect(page.locator('.resource').filter({ hasText: 'Wood' }).locator('strong')).toHaveText(
    '2',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await expect(page.locator('.resource').filter({ hasText: 'Wood' }).locator('strong')).toHaveText(
    '2',
  );
  await context.setOffline(false);
});
test('cards, portrait ZIP export, and printed summary are usable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await page.getByRole('link', { name: 'Card library', exact: true }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByLabel('Card name').fill('Test sword');
  await page.getByLabel('Effects', { exact: true }).fill('Test reference effect');
  await page.getByRole('button', { name: 'Save reference', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'New character', exact: true }).first().click();
  await page.getByLabel('Character name', { exact: true }).fill('Portrait knight');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Card', exact: true })
    .selectOption({ label: 'Test sword' });
  await page.getByRole('button', { name: 'Add to inventory' }).click();
  await expect(page.getByText('Test reference effect', { exact: true }).first()).toBeVisible();
  const image = await page.screenshot();
  await page.getByRole('button', { name: 'Change character portrait' }).click();
  await page
    .getByLabel('Choose image')
    .setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByAltText('Cropped portrait preview')).toBeVisible();
  await page.getByRole('button', { name: 'Save portrait', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/\.zip$/);
  await page.getByRole('tab', { name: 'Notes', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-summary')).toBeVisible();
  await expect(page.locator('.print-summary')).toContainText('Test reference effect');
});

test('confirmed XP rolls over and sheet controls match the requested behavior', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await page.getByRole('button', { name: 'New character', exact: true }).first().click();
  await page.getByLabel('Character name', { exact: true }).fill('XP ranger');
  await page.getByLabel('Character name', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'XP ranger', exact: true })).toBeVisible();
  const award = page.getByRole('button', { name: 'Add 1 Attack / Melee XP', exact: true });
  await award.click();
  await expect(page.locator('.skill-attack .xp-slot.filled')).toHaveCount(1);
  await award.click();
  await expect(page.locator('.skill-attack .xp-slot.filled')).toHaveCount(2);
  await award.click();
  await expect(page.locator('.skill-attack .paper-level')).toHaveText('2');
  await expect(page.locator('.skill-attack .xp-slot.filled')).toHaveCount(0);
  await expect(page.locator('.quick-two')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add 1 deaths', exact: true }).click();
  await expect(page.locator('.paper-deaths .counter strong')).toHaveText('1');
  await expect(page.locator('.tally-marks')).toHaveCount(0);
  const checkbox = page.getByRole('checkbox', { name: 'Have 15 coins.', exact: true });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  expect(await checkbox.evaluate((el) => getComputedStyle(el).padding)).toBe('0px');
  await page.screenshot({ path: 'test-results/updated-sheet-controls.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await expect(page.locator('.skill-attack .paper-level')).toHaveText('2');
  await expect(page.locator('.skill-attack .xp-slot.filled')).toHaveCount(0);
});

test('default resources and original-size sheet keep GP and XP controls in place', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try on this device' }).click();
  await page.getByRole('button', { name: 'New character', exact: true }).first().click();
  await page.getByLabel('Character name', { exact: true }).fill('Compact sheet');
  await page.getByLabel('Character name', { exact: true }).press('Enter');
  await expect(page.locator('.paper-supplies .paper-resource')).toHaveCount(10);
  for (const selector of ['.skill-attack', '.skill-thieving', '.paper-supplies .paper-resource']) {
    const icon = page.locator(selector).first().locator('img.custom-game-icon');
    await expect(icon).toBeVisible();
    expect(
      await icon.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    ).toBeTruthy();
  }
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.locator('.physical-frame').evaluate((el) => getComputedStyle(el).zoom)).toBe(
      '1',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    const gp = (await page.locator('.paper-gp').boundingBox())!;
    const benefits = (await page.locator('.quest-benefits').boundingBox())!;
    expect(gp.y - benefits.y - benefits.height).toBeLessThan(30);
    const slots = (await page.locator('.skill-attack .paper-xp').boundingBox())!;
    const plus = (await page.locator('.skill-attack .paper-award').boundingBox())!;
    const header = (await page.locator('.paper-skills > .ribbon').boundingBox())!;
    expect(Math.abs(plus.x + plus.width - header.x - header.width)).toBeLessThan(2);
    expect(plus.x).toBeGreaterThanOrEqual(slots.x + slots.width);
    expect(Math.abs(plus.y + plus.height / 2 - slots.y - slots.height / 2)).toBeLessThan(2);
  }
  await page.screenshot({ path: 'test-results/original-sheet.png', fullPage: true });
});
