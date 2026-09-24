import { NextResponse } from 'next/server';

import { libraryKeyForName } from '../application';
import type { AuthorizeOwner, MusicRepository } from '../ports';

function readBody(body: unknown): { name: string } | null {
  if (typeof body !== 'object' || body === null) return null;

  const name = (body as Record<string, unknown>).name;
  const trimmed = typeof name === 'string' ? name.trim() : '';

  return trimmed === '' ? null : { name: trimmed };
}

export function createMusicLibrariesRoute(deps: {
  authorizeOwner: AuthorizeOwner<Request>;
  repository: Pick<MusicRepository, 'listAllLibraries' | 'updateLibrary' | 'createLibrary'>;
}) {
  // 按名字建库，同名直接返回已有的那个；key 由服务端从名字派生，客户端不指定
  async function POST(request: Request) {
    if (!(await deps.authorizeOwner(request))) {
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
      const libraries = await deps.repository.listAllLibraries();
      const candidate = libraryKeyForName(input.name, []);
      const existing = libraries.find((library) => library.key === candidate);

      if (existing) {
        // 同名但停用的库：这次请求就是"要用它"，顺手恢复
        const library = existing.isActive
          ? existing
          : await deps.repository.updateLibrary({ key: existing.key, patch: { isActive: true } });

        return NextResponse.json({ library });
      }

      const library = await deps.repository.createLibrary({
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

  return { POST };
}
