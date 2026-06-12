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
          // 에셋 갱신 시 gandalf-avatar.ts 의 ?v= 버전을 올려서 무효화
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      })
    }
    return new NextResponse(null, { status: 404 })
  })
}
