import { BaseApiClient } from '../base/BaseApiClient';

export class TodoService extends BaseApiClient {
  create(title: string) {
    return this.post<{ id: number; title: string }>('/api/todos', { data: { title } });
  }
}
