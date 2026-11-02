import type { Locator, Page } from '@playwright/test';

/**
 * The base of every page object. A page object drives one screen through business-level methods; its selectors live
 * in src/web/locators/<page>.page.locators.ts, never inline.
 */
export abstract class BasePage {
  constructor(readonly page: Page) {}

  /** The screen's route, relative to the base URL (e.g. '/#/login'). */
  abstract readonly path: string;

  async open(): Promise<void> {
    await this.page.goto(this.path);
  }

  protected find(selector: string): Locator {
    return this.page.locator(selector);
  }
}
