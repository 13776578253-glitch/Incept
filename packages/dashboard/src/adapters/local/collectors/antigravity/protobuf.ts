import 'server-only';

export type Field = { number: number; value: number | Buffer; wire: number };
function varint(data: Buffer, start: number) {
  let value = 0, offset = start, shift = 0;
  while (offset < data.length && offset - start < 10) {
    const byte = data[offset++];
    value += (byte & 127) * 2 ** shift;
    if (!(byte & 128)) return { value, offset };
    shift += 7;
  }
  throw new Error('Invalid protobuf varint');
}
export function fields(data: Uint8Array): Field[] {
  const buffer = Buffer.from(data), result: Field[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const tag = varint(buffer, offset), number = Math.floor(tag.value / 8), wire = tag.value % 8;
    if (!number) throw new Error('Invalid protobuf field');
    offset = tag.offset;
    if (wire === 0) {
      const parsed = varint(buffer, offset);
      result.push({ number, wire, value: parsed.value }); offset = parsed.offset;
    } else {
      let end: number;
      if (wire === 2) { const size = varint(buffer, offset); offset = size.offset; end = offset + size.value; }
      else if (wire === 1 || wire === 5) end = offset + (wire === 1 ? 8 : 4);
      else throw new Error('Unsupported protobuf wire type');
      if (end > buffer.length) throw new Error('Truncated protobuf field');
      result.push({ number, wire, value: buffer.subarray(offset, end) }); offset = end;
    }
  }
  return result;
}
export const messages = (data: Field[], number: number) => data.filter(field => field.number === number && field.wire === 2)
  .map(field => fields(field.value as Buffer));
export const message = (data: Field[], number: number) => messages(data, number)[0] ?? [];
export const integer = (data: Field[], number: number): number | undefined => data.find(field => field.number === number && field.wire === 0)?.value as number | undefined;
export function string(data: Field[], ...numbers: number[]) {
  for (const number of numbers) {
    const value = data.find(field => field.number === number && field.wire === 2)?.value;
    if (Buffer.isBuffer(value)) { const text = value.toString('utf8').trim(); if (text) return text; }
  }
}
export function integers(data: Field[], number: number) {
  const result: number[] = [];
  for (const field of data.filter(field => field.number === number)) {
    if (typeof field.value === 'number') result.push(field.value);
    else if (field.wire === 2) {
      let offset = 0;
      while (offset < field.value.length) { const parsed = varint(field.value, offset); result.push(parsed.value); offset = parsed.offset; }
    }
  }
  return result;
}
export function timestamp(data: Field[]): number | undefined {
  const seconds = integer(data, 1);
  return seconds && seconds > 0 ? seconds * 1000 + Math.floor(Math.min(integer(data, 2) ?? 0, 999_999_999) / 1_000_000) : undefined;
}
