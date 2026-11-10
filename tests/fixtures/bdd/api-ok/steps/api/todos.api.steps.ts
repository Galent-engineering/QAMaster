import { expect, Then, When } from '../../src/fixtures';
import { lastResponse } from '../../src/api/state';
import { TodoService } from '../../src/api/services/TodoService';

When('I create a todo with the title {string}', async ({ request }, title: string) => {
  lastResponse.set(request, await new TodoService(request).create(title));
});

Then('the response status is {int}', async ({ request }, status: number) => {
  expect(lastResponse.get(request)?.status).toBe(status);
});
