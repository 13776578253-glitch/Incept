import 'server-only';

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    // 比较请求头中的 Origin 与当前 URL 的 Origin 是否一致
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
