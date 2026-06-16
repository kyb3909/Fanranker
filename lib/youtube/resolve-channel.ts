/**
 * @handle → channelId(UC...) 리졸버. 신규 크리에이터 보드 생성 시 1회 호출용.
 *
 * ⚠️ 서버 전용 (유튜브 채널 페이지 HTML 을 직접 fetch). 클라이언트에서 호출 금지.
 * 테스트 단계에선 CREATORS 상수의 channelId 를 그대로 쓰므로 런타임에 호출하지 않는다.
 */
export async function resolveChannelId(handle: string): Promise<string> {
  const clean = handle.replace(/^@/, "")
  const res = await fetch(`https://www.youtube.com/@${clean}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`채널 페이지 로드 실패: ${handle} (${res.status})`)
  const html = await res.text()
  const m = html.match(/"channelId":"(UC[\w-]+)"/) ?? html.match(/channel\/(UC[\w-]+)/)
  if (!m) throw new Error(`channel_id를 찾을 수 없음: ${handle}`)
  return m[1]
}
