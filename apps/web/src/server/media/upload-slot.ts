// Share one heavy upload slot across route bundles in the single production Node process.
const state = globalThis as typeof globalThis & { __inceptUploadActive?: boolean };

export async function withUploadSlot(work: () => Promise<Response>): Promise<Response> {
  if (state.__inceptUploadActive) return Response.json({ error: 'Another upload is in progress. Try again shortly.' }, {
    status: 429, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
  });
  state.__inceptUploadActive = true;
  try { return await work(); }
  finally { state.__inceptUploadActive = false; }
}
