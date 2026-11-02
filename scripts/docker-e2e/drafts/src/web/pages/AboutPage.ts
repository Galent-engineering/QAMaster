import { aboutLocators } from '../locators/about.page.locators';
import { BasePage } from './BasePage';

export class AboutPage extends BasePage {
  readonly path = '/#/about';

  termsOfUse() {
    return this.find(aboutLocators.termsOfUse);
  }
}
