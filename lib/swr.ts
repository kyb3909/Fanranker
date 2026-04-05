export const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) {
    const error = new Error("API 요청 실패") as Error & { status: number }
    error.status = r.status
    throw error
  }
  return r.json()
}
