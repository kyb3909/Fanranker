/**
 * 기존 게시글의 외부 핫링크 이미지를 우리 Storage 로 백필 재호스팅한다.
 *
 * 배경: 봇 뉴스 글이 출처 원본 해상도 이미지를 핫링크해 홈 무게 5.2MB(907KB 절감 여지),
 * 캐시 헤더 부재 354KB, 서드파티 쿠키(FIFA CDN → 구글 광고 쿠키 5종)까지 실어 날랐다.
 * 발행 파이프라인은 lib/news/publish.ts 에서 자동 재호스팅하므로 이 스크립트는 과거분 정리용.
 *
 * 사용법:
 *   pnpm exec tsx scripts/rehost-post-images.ts          # dry-run: 대상 목록만 출력
 *   pnpm exec tsx scripts/rehost-post-images.ts --apply  # 실제 다운로드→변환→업로드→DB 갱신
 *
 * 개별 실패는 해당 글만 건너뛴다(원본 유지). before→after 매핑은 stdout 에 남는다.
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { resolve } from "path"
import sharp from "sharp"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const APPLY = process.argv.includes("--apply")

/** 이미 우리 Storage — 프록시 경로 또는 Supabase 도메인 (lib/images/rehost 와 동일 기준) */
function isSelfHosted(url: string): boolean {
  return url.startsWith("/storage/") || /:\/\/[^/]+\.supabase\.co\//.test(url)
}

function isExternal(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url) && !isSelfHosted(url)
}

type TipTapNode = { type?: string; attrs?: { src?: string }; content?: TipTapNode[] }

function collectImageSrcs(node: TipTapNode | null | undefined, out: Set<string>) {
  if (!node || typeof node !== "object") return
  if (node.type === "image" && isExternal(node.attrs?.src)) out.add(node.attrs!.src!)
  for (const child of node.content ?? []) collectImageSrcs(child, out)
}

function replaceImageSrcs(node: TipTapNode | null | undefined, map: Map<string, string>) {
  if (!node || typeof node !== "object") return
  if (node.type === "image" && node.attrs?.src && map.has(node.attrs.src)) {
    node.attrs.src = map.get(node.attrs.src)!
  }
  for (const child of node.content ?? []) replaceImageSrcs(child, map)
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)")
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  // 대상: 삭제 안 된 글 중 대표 이미지가 외부 URL 인 것 (본문 이미지도 함께 교체)
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, user_id, title, image, content")
    .is("deleted_at", null)
    .like("image", "http%")
    .order("created_at", { ascending: false })
  if (error) {
    console.error("posts 조회 실패:", error.message)
    process.exit(1)
  }

  const targets = (posts ?? []).filter((p) => isExternal(p.image))
  console.log(`대상 ${targets.length}건 (image 컬럼이 외부 URL)`)
  if (!APPLY) {
    for (const p of targets) console.log(` - ${p.id} | ${p.title?.slice(0, 40)} | ${p.image}`)
    console.log("\ndry-run 종료. 실제 적용은 --apply")
    return
  }

  let ok = 0
  let fail = 0
  for (const p of targets) {
    const srcs = new Set<string>()
    if (isExternal(p.image)) srcs.add(p.image)
    collectImageSrcs(p.content as TipTapNode, srcs)

    const map = new Map<string, string>()
    for (const src of srcs) {
      try {
        const res = await fetch(src, {
          signal: AbortSignal.timeout(15000),
          headers: {
            "User-Agent":
              "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            Accept: "image/*",
          },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const contentType = res.headers.get("content-type") || ""
        if (!contentType.startsWith("image/")) throw new Error(`not image: ${contentType}`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.byteLength > 10 * 1024 * 1024) throw new Error("10MB 초과")

        const isGif = contentType.includes("gif")
        const input = isGif ? sharp(buf, { animated: true, pages: -1 }) : sharp(buf)
        const webp = await input
          .resize(1200, undefined, { withoutEnlargement: true, fit: "inside" })
          .webp({ quality: 80 })
          .toBuffer()

        const fileName = `${p.user_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`
        const { data: up, error: upErr } = await supabase.storage
          .from("posts")
          .upload(fileName, webp, { contentType: "image/webp", upsert: false })
        if (upErr || !up) throw new Error(upErr?.message ?? "upload 실패")
        map.set(src, `/storage/posts/${up.path}`)
      } catch (e) {
        console.error(` ✗ ${p.id} 이미지 실패(원본 유지): ${src} — ${(e as Error).message}`)
      }
    }
    if (map.size === 0) {
      fail++
      continue
    }

    const newContent = structuredClone(p.content) as TipTapNode
    replaceImageSrcs(newContent, map)
    const newImage = map.get(p.image as string) ?? p.image
    const { error: updErr } = await supabase
      .from("posts")
      .update({ image: newImage, content: newContent })
      .eq("id", p.id)
    if (updErr) {
      console.error(` ✗ ${p.id} DB 갱신 실패: ${updErr.message}`)
      fail++
      continue
    }
    ok++
    for (const [from, to] of map) console.log(` ✓ ${p.id} | ${from} → ${to}`)
  }
  console.log(`\n완료: ${ok}건 갱신, ${fail}건 실패/스킵`)
}

main()
