/** UTC timestamp at midnight of the KST day containing now. No database or writer dependencies. */
export function kstDayStart(now = Date.now()) {
  const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10)
  return new Date(day + "T00:00:00+09:00").toISOString()
}
