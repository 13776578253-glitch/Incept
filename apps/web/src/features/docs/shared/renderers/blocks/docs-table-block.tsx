import type { DocsTableBlockModel } from '@/features/docs/block-system';
import { DocsInlineContent } from '../docs-inline-content';

export function DocsTableBlock({ id, header, rows, align }: DocsTableBlockModel) {
  const cellClass = 'px-3 py-2 align-top sm:px-4';

  return (
    <div id={id} className="w-full min-w-0 max-w-full overflow-x-auto">
      <table className="mx-auto max-w-full border-collapse text-sm leading-6 text-[var(--color-text-muted)]">
        <thead className="border-b border-[var(--color-border)] text-[var(--color-text)]">
          <tr>
            {header.map((cell, index) => (
              <th key={index} scope="col" className={cellClass} style={{ textAlign: align[index] ?? 'center' }}>
                <DocsInlineContent content={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[var(--color-border)] last:border-b-0">
              {row.map((cell, columnIndex) => (
                <td key={columnIndex} className={cellClass} style={{ textAlign: align[columnIndex] ?? 'center' }}>
                  <DocsInlineContent content={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
