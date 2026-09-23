import { createMusicLibrary, listAllMusicLibraries, updateMusicLibrary } from '@incept/music/adapters';
import { NextResponse } from 'next/server';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';
import { libraryKeyForName } from '@incept/music/application';

export const runtime = 'nodejs';

function readBody(body: unknown): { name: string } | null {
  if (typeof body !== 'object' || body === null) return null;

  const name = (body as Record<string, unknown>).name;
  const trimmed = typeof name === 'string' ? name.trim() : '';

  return trimmed === '' ? null : { name: trimmed };
}

// 按名字建库，同名直接返回已有的那个；key 由服务端从名字派生，客户端不指定
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const input = readBody(body);

  if (input === null) {
    return NextResponse.json({ error: 'A library name is required.' }, { status: 400 });
  }

  try {
    const libraries = await listAllMusicLibraries();
    const candidate = libraryKeyForName(input.name, []);
    const existing = libraries.find((library) => library.key === candidate);

    if (existing) {
      // 同名但停用的库：这次请求就是"要用它"，顺手恢复
      const library = existing.isActive
        ? existing
        : await updateMusicLibrary({ key: existing.key, patch: { isActive: true } });

      return NextResponse.json({ library });
    }

    const library = await createMusicLibrary({
      key: libraryKeyForName(
        input.name,
        libraries.map((entry) => entry.key),
      ),
      title: input.name,
    });

    return NextResponse.json({ library }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The library could not be created.' },
      { status: 400 },
    );
  }
}
