import type { APIRequestContext } from '@playwright/test';

const mockBaseUrl = 'http://127.0.0.1:4010';

export async function resetMock(request: APIRequestContext, options?: { addons?: { recall?: boolean } }): Promise<void> {
  const response = await request.post(`${mockBaseUrl}/__reset`, { data: options });

  if (!response.ok()) {
    throw new Error(`Mock reset failed with HTTP ${response.status()}.`);
  }
}

export async function offboardMockStaff(request: APIRequestContext, staffId: string): Promise<void> {
  const response = await request.post(`${mockBaseUrl}/__staff/${encodeURIComponent(staffId)}/offboard`);
  if (!response.ok()) {
    throw new Error(`Mock offboarding failed with HTTP ${response.status()}.`);
  }
}

/** The server forgets a staff member without telling the device — a reset
 *  database or a restored backup, as distinct from a deliberate offboarding. */
export async function forgetMockStaff(request: APIRequestContext, staffId: string): Promise<void> {
  const response = await request.post(`${mockBaseUrl}/__staff/${encodeURIComponent(staffId)}/forget`);
  if (!response.ok()) {
    throw new Error(`Mock staff forget failed with HTTP ${response.status()}.`);
  }
}

export async function readMockSales(request: APIRequestContext): Promise<Array<{ id: string; staff_id: string }>> {
  const response = await request.get(`${mockBaseUrl}/__state`);
  if (!response.ok()) throw new Error(`Mock state read failed with HTTP ${response.status()}.`);
  const state = await response.json() as { sales: Record<string, { id: string; staff_id: string }> };
  return Object.values(state.sales);
}
