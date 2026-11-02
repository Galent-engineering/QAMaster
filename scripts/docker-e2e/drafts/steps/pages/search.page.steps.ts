import { When } from '../../src/fixtures';
import { SearchPage } from '../../src/web/pages/SearchPage';

When('I search the catalogue for {string}', async ({ page }, term: string) => {
  await new SearchPage(page).search(term);
});
