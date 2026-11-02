import { expect, Given, Then } from '../../src/fixtures';
import { AboutPage } from '../../src/web/pages/AboutPage';

Given('I open the About page', async ({ page }) => {
  await new AboutPage(page).open();
});

Then('the terms of use link leads to {string}', async ({ page }, href: string) => {
  await expect(new AboutPage(page).termsOfUse()).toHaveAttribute('href', href);
});
