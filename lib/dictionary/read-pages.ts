/** Stable ordering is the caller's responsibility. Never return a partial successful read. */
export async function readPages<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = 100000
): Promise<T[]> {
  const rows: T[] = []
  const size = 500
  for (let from = 0; from <= maxRows; from += size) {
    const { data, error } = await page(from, Math.min(from + size - 1, maxRows))
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error("Dictionary query returned no row data")
    rows.push(...data)
    if (rows.length > maxRows) throw new Error(`Query exceeds ${maxRows} rows`)
    if (data.length < size) return rows
  }
  throw new Error("Query limit reached without an end boundary")
}
