export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calendarMonth(month: string) {
  const first = new Date(month + '-01T00:00:00Z');
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(1 - offset + index);
    return { date, key: dateKey(date), inMonth: date.getUTCMonth() === first.getUTCMonth() };
  });
}

export function adjacentMonth(month: string, offset: number) {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return dateKey(date).slice(0, 7);
}
