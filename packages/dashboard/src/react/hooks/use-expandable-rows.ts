import { useEffect, useState } from 'react';

export function useExpandableRows<T>(items: T[], limit: number, scope: string) {
  const [selection, setSelection] = useState({ scope, expanded: false });
  useEffect(() => {
    setSelection(previous => previous.scope === scope ? previous : { scope, expanded: false });
  }, [scope]);
  const expanded = selection.scope === scope && selection.expanded;
  return {
    expanded,
    visibleRows: expanded ? items : items.slice(0, limit),
    toggle: () => setSelection({ scope, expanded: !expanded }),
  };
}
