import { expect, Given, Then } from '../../src/fixtures';

// Generic, reusable web steps. Screen-specific steps live in steps/pages/<page>.page.steps.ts.

Given('I open the path {string}', async ({ page }, route: string) => {
  await page.goto(route);
});

Then('I should see the text {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
});

Then('the URL should contain {string}', async ({ page }, part: string) => {
  await expect(page).toHaveURL(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
