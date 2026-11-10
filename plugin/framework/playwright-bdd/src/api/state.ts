import type { APIRequestContext } from '@playwright/test';
import type { ApiResponse } from './base/ApiResponse';

/**
 * The last response of a scenario, shared by its steps. A scenario has its own request context, so keying on it keeps
 * scenarios apart: `lastResponse.set(request, await service.create(...))` in a When, `lastResponse.get(request)` in a Then.
 */
export const lastResponse = new WeakMap<APIRequestContext, ApiResponse>();
