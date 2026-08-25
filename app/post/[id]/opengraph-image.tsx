import { ImageResponse } from "next/og"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { BAND_BG, CREAM, Footer, loadOgFonts, titleSize } from "@/app/_og/shared"

export const alt = "공놀이 기사"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * 기사 공유 카드 (2026-08-25 운영자: "카톡 미리보기가 너무 구리다").
 *
 * ## 왜 우리가 그리는가
 * 종전엔 원문에서 긁어온 사진을 og:image 로 그대로 내보냈다. 그런데 그 사진이
 * **거의 전부 webp** 였고(최근 30일 851건 중 846건), **카카오톡은 미리보기에서 webp 를
 * 렌더하지 않는다.** 그래서 기사 링크를 공유하면 이미지가 아예 안 떴다.
 *
 * 카드를 우리가 그리면 한 번에 셋이 풀린다:
 *   · 형식을 우리가 정한다 (PNG — 어디서나 뜬다)
 *   · 사진이 없는 기사도 같은 품질로 나간다
 *   · 남의 사진을 우리 카드로 재배포하지 않는다
 *
 * ⚠️ 글자를 AI 이미지로 굽지 않는다 — 코드 렌더라 항상 선명하고 오타가 없다.
 * ⚠️ 이모지 금지 (감리).
 */
/**
 * 앞머리 출처 대괄호를 떼어낸다 — "[HandofArsenal] 마르티넬리…" → "마르티넬리…".
 *
 * 카드에서 독자가 볼 자리는 좁고, 거기서 가장 값진 건 **무슨 일이 있었나**다.
 * 출처는 글을 열면 본문 첫 줄에 있다. 대괄호가 앞에 있으면 제목 두 줄 중 반을 먹는다.
 * ⚠️ 본문 제목은 그대로 둔다 — 목록에서는 출처가 신뢰의 근거라 빼면 안 된다.
 */
function stripSource(t: string): string {
  return t.replace(/^\s*\[[^\]]{1,40}\]\s*/, "").trim() || t
}

export default async function PostOgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let title = "공놀이"
  let flair: string | null = null
  try {
    const { data } = await createServiceRoleClient()
      // ⚠️ post_flairs 임베드는 `!flair_id` 힌트 필수 — post_flair_map 추가 후 관계가
      //    모호해져 500 이 났다 (f15c802a)
      .from("posts")
      .select("title, post_flairs!flair_id ( name )")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle()
    if (data?.title) title = stripSource(String(data.title))
    const f = (data as { post_flairs?: { name?: string } | null } | null)?.post_flairs
    if (f?.name) flair = String(f.name)
  } catch {
    // fail-open — 제목을 못 읽어도 브랜드 카드는 나간다 (빈 미리보기보다 낫다)
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        ...BAND_BG,
      }}
    >
      {/* 피치 센터서클 — 사이트 기본 카드와 같은 장식 하나 */}
      <div
        style={{
          position: "absolute",
          right: -150,
          bottom: -200,
          width: 480,
          height: 480,
          borderRadius: 240,
          border: "2px solid rgba(245,239,231,0.12)",
          display: "flex",
        }}
      />

      {flair ? (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            fontFamily: "SUIT",
            fontSize: 28,
            fontWeight: 700,
            color: CREAM,
            background: "rgba(245,239,231,0.14)",
            borderRadius: 999,
            padding: "10px 26px",
          }}
        >
          {flair}
        </div>
      ) : (
        <div style={{ display: "flex" }} />
      )}

      <div
        style={{
          fontFamily: "SUIT",
          fontSize: titleSize(title),
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: "-0.02em",
          color: CREAM,
          display: "flex",
          // ⚠️ 넘치면 잘린다 (satori 는 되돌리지 못한다) — titleSize 가 그걸 막는다
          maxHeight: 330,
          overflow: "hidden",
        }}
      >
        {title}
      </div>

      <Footer />
    </div>,
    { ...size, fonts: await loadOgFonts() }
  )
}
