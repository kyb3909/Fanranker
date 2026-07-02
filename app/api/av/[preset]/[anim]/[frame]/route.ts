import { NextRequest, NextResponse } from "next/server"
import { readFileSync } from "fs"
import { join } from "path"

export function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ preset: string; anim: string; frame: string }> }
) {
  return params.then(({ preset, anim, frame }) => {
    const base = join(process.cwd(), "public", "metaverse", "avatars", preset, anim)
    // PNG 우선 (Aseprite export 기준 alpha 보장), WebP fallback
    const candidates: [string, string][] = [
      [join(base, `frame_${frame}.png`), "image/png"],
      [join(base, `frame_${frame}.webp`), "image/webp"],
    ]
    for (const [filePath, mime] of candidates) {
      let data: Buffer
      try {
        data = readFileSync(filePath)
      } catch {
        continue
      }
      return new NextResponse(new Uint8Array(data), {
        status: 200,
        headers: {
          "Content-Type": mime,
          // 에셋 갱신 시 gandalf-avatar.ts 의 ?v= 버전을 올려서 무효화.
          // s-maxage 필수 — 없으면 Vercel CDN 이 함수 응답을 캐시하지 않아 프레임
          // 270개가 유저·첫방문마다 전부 서버리스 함수를 때림 (스타디움 로딩 병목,
          // 2026-07-02 실측: 프레임 완료까지 7.5s 중 상당분).
          "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        },
      })
    }
    return new NextResponse(null, { status: 404 })
  })
}
