import { ImageResponse } from "next/og"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { STAGE_LABEL } from "@/lib/saga/stages"
import { BAND_BG, CREAM, Footer, loadOgFonts, titleSize } from "@/app/_og/shared"

export const alt = "사가"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * 사가 공유 카드 (2026-08-25).
 *
 * ## 왜 필요한가
 * 외부 감사 지적 — 사가 링크를 공유하면 og:title 이 사이트 공통 문구
 * ("그깟 공놀이에 진심인 팬들의 놀이터")로 나갔다. **어떤 사가를 보내도 카드가 똑같았다.**
 * 원인은 Next 의 metadata 규칙이다: 페이지의 `title` 은 og:title 로 자동 전파되지 않고,
 * 루트 layout 의 `openGraph` 가 이긴다. 그래서 페이지에서 `openGraph` 를 명시해야 한다
 * (page.tsx 에서 같이 고쳤다).
 *
 * ## 사가 카드의 주인공은 단계다
 * 사가는 "지금 어디까지 왔나"가 재방문 이유다(PRD §7). 그래서 카드에도 단계 칩을
 * 크게 세운다 — 링크를 다시 보낼 때마다 카드가 달라지는 것이 이 문서의 성질이다.
 */
export default async function SagaOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let title = "이적 사가"
  let stage: string | null = null
  let entries = 0
  let confirmed = false
  try {
    const { data } = await createServiceRoleClient()
      .from("sagas")
      .select("title, stage, status, outcome, entry_count, is_confirmed")
      .eq("slug", slug)
      .maybeSingle()
    if (data) {
      title = String(data.title ?? title)
      const closed = data.status === "closed"
      const key = closed ? String(data.outcome ?? "") : String(data.stage ?? "")
      stage = STAGE_LABEL[key] ?? (closed ? "종결" : null)
      entries = Number(data.entry_count ?? 0)
      confirmed = data.is_confirmed === true
    }
  } catch {
    // fail-open — 브랜드 카드라도 나가는 편이 빈 미리보기보다 낫다
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

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Aggro",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "0.22em",
            color: "rgba(245,239,231,0.55)",
          }}
        >
          SAGA
        </div>
        {stage ? (
          <div
            style={{
              display: "flex",
              fontFamily: "SUIT",
              fontSize: 28,
              fontWeight: 700,
              color: CREAM,
              background: "rgba(245,239,231,0.14)",
              borderRadius: 999,
              padding: "10px 26px",
            }}
          >
            {stage}
          </div>
        ) : null}
        {/* ⚠️ 미확정 루머는 카드에도 적는다 — 공유된 카드만 보고 확정으로 읽으면 안 된다 (PRD D7) */}
        {!confirmed ? (
          <div
            style={{
              display: "flex",
              fontFamily: "SUIT",
              fontSize: 24,
              fontWeight: 700,
              color: "rgba(245,239,231,0.55)",
            }}
          >
            미확인 루머
          </div>
        ) : null}
      </div>

      <div
        style={{
          fontFamily: "SUIT",
          fontSize: titleSize(title),
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: "-0.02em",
          color: CREAM,
          display: "flex",
          maxHeight: 330,
          overflow: "hidden",
        }}
      >
        {title}
      </div>

      <Footer right={entries > 0 ? `기록 ${entries}건` : undefined} />
    </div>,
    { ...size, fonts: await loadOgFonts() }
  )
}
