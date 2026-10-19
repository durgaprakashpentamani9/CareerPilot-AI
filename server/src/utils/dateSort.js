function timestamp(value) {
  if (value instanceof Date) {
    const result = value.getTime();
    return Number.isFinite(result) ? result : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : null;
  }
  if (value && typeof value === 'object') {
    if ('$date' in value) return timestamp(value.$date);
    if ('$numberLong' in value) return timestamp(Number(value.$numberLong));
  }
  return null;
}

export function newestFirst(a, b) {
  const aTime = timestamp(a?.createdAt);
  const bTime = timestamp(b?.createdAt);
  if (aTime === null) return bTime === null ? 0 : 1;
  if (bTime === null) return -1;
  return bTime - aTime;
}
