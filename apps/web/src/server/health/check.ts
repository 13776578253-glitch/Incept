import { prisma } from '@incept/db';

export async function readiness() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), 2_000); timer.unref(); }),
    ]);
    return Response.json({ status: 'ready' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error(JSON.stringify({ event: 'readiness_failed' }));
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  } finally { clearTimeout(timer); }
}
