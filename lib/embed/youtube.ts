/**
 * YouTube URL → video ID 추출
 *
 * watch, youtu.be, embed, shorts 네 형식 지원.
 */

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/

export function extractYouTubeId(url: string): string | null {
  const m = url.match(YOUTUBE_ID_RE)
  return m ? m[1] : null
}
