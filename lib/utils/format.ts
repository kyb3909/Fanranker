/** Format large numbers with 'k' suffix (e.g., 1200 → "1.2k") */
export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** Format member count in Korean (e.g., 15000 → "1.5만명") */
export function formatMemberCount(count: number): string {
  if (count >= 10000) {
    const wan = count / 10000
    const formatted = wan % 1 === 0 ? wan.toFixed(0) : wan.toFixed(1)
    return `${formatted}만명`
  }
  return `${count.toLocaleString()}명`
}
