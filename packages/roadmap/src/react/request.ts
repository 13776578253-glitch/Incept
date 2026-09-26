import { roadmapEndpoints } from '../endpoints';

// 客户端请求小助手（admin panel 的 api() 同款）：统一走 roadmapEndpoints 常量，失败抛错。
// 反自动派生红线：请求只面向 /api/internal/roadmap/*，不读取任何仓库文件。
export async function roadmapRequest<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `The request failed (${response.status}).`);
  }

  return payload as T;
}

export function entryEndpoint(key: string): string {
  return roadmapEndpoints.entry(key);
}
