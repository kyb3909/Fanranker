/** Cup finals may finish after extra time or penalties. A live shootout is not FT. */
export function isLfaFinishedStatus(
  status?: { state?: string; display?: string; is_live?: boolean } | null
): boolean {
  if (!status || status.is_live === true) return false
  return (
    status.state === "postGame" ||
    ["FT", "AET", "PEN"].includes(status.display?.trim().toUpperCase() ?? "")
  )
}
