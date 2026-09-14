/** Shared responses must expire before kickoff or the 23:00 KST daily rollover. */
export function gamesCacheControl(
  userId: string | null,
  games: ReadonlyArray<{ match_time?: unknown }>,
  generatedAt: number,
  now = Date.now()
): string {
  if (userId) return "private, no-store"
  const kstDate = new Date(generatedAt + 9 * 3600_000).toISOString().slice(0, 10)
  let rollover = Date.parse(`${kstDate}T23:00:00+09:00`)
  if (rollover <= generatedAt) rollover += 24 * 3600_000
  let boundary = rollover
  for (const game of games) {
    const kickoff = typeof game.match_time === "string" ? Date.parse(game.match_time) : NaN
    if (kickoff > generatedAt) boundary = Math.min(boundary, kickoff)
  }
  const seconds = Math.min(60, Math.floor((boundary - now) / 1000))
  if (seconds <= 0) return "no-store"
  return `public, max-age=0, s-maxage=${seconds}, must-revalidate`
}
