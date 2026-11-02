import { test as base, createBdd } from 'playwright-bdd';

/**
 * Fixtures every step definition can ask for. Add one per shared helper; page objects are created in the steps that
 * use them, from src/web/pages.
 */
export const test = base.extend<Record<string, never>>({});
export const { Given, When, Then } = createBdd(test);
export { expect } from '@playwright/test';
