import type { Page } from '@playwright/test';
import { expect, Given, Then, When } from '../../src/fixtures';

// Generic, reusable web steps. Screen-specific steps live in steps/pages/<page>.page.steps.ts.
// TestGen's .feature files are written in exactly these phrasings (open a path, click a named button or link, fill a
// named field, see a text, the URL contains), so a scenario's text is reused as it is: add a step definition only for
// a step none of them covers.

Given('I open the path {string}', async ({ page }, route: string) => {
  await page.goto(route);
});

Then('I should see the text {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
});

Then('the URL should contain {string}', async ({ page }, part: string) => {
  await expect(page).toHaveURL(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

const click = (page: Page, role: 'button' | 'link', name: string) => page.getByRole(role, { name }).first().click();

When('I click the {string} button', async ({ page }, name: string) => {
  await click(page, 'button', name);
});

When('I click the {string} link', async ({ page }, name: string) => {
  await click(page, 'link', name);
});

When('I fill the {string} field with {string}', async ({ page }, field: string, value: string) => {
  await page.getByLabel(field).or(page.getByPlaceholder(field)).first().fill(value);
});
