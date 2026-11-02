import { searchLocators } from '../locators/search.page.locators';
import { BasePage } from './BasePage';

export class SearchPage extends BasePage {
  readonly path = '/#/search';

  async search(term: string): Promise<void> {
    // the welcome banner opens a moment after the page; it covers the navbar until closed
    const welcome = this.find(searchLocators.closeWelcome);
    await welcome.waitFor({ timeout: 5000 }).then(
      () => welcome.click(),
      () => {},
    );
    await this.find(searchLocators.searchToggle).click();
    await this.find(searchLocators.searchField).fill(term);
    await this.find(searchLocators.searchField).press('Enter');
  }
}
