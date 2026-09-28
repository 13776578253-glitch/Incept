import { roadmapEndpoints } from '../endpoints';

// 客户端请求辅助函数：统一基于 roadmapEndpoints 发起内部 API 请求，非 2xx 响应抛出错误。
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
