export function pathRecord<T>(
  from?: Readonly<Record<string, T>>,
): Record<string, T> {
  const out = Object.create(null) as Record<string, T>;
  return from ? Object.assign(out, from) : out;
}

export function ownValue<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
