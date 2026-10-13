import 'server-only';

// The production proxy overwrites both headers and is the only exposed application ingress.
export function getRequestOrigin(request: Request) {
  if (process.env.INCEPT_TRUST_PROXY === '1') {
    const host = request.headers.get('x-forwarded-host');
    const protocol = request.headers.get('x-forwarded-proto');
    if (host && protocol) {
      if (!/^(https|http)$/.test(protocol) || /[\s,/@\\]/.test(host)) throw new Error('Invalid proxy origin.');
      return new URL(`${protocol}://${host}`).origin;
    }
  }
  return new URL(request.url).origin;
}

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    // 比较请求头中的 Origin 与当前 URL 的 Origin 是否一致
    return new URL(origin).origin === getRequestOrigin(request);
  } catch {
    return false;
  }
}
