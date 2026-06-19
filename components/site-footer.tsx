/**
 * 사이트 공통 푸터 — 회색 캔버스 하단에 손글씨 태그라인을 둔다.
 * (담벼락 상단에 있던 태그라인을 이리로 이동.)
 * app-shell 에서 chrome 노출 페이지에만 렌더 (admin·풀스크린 다크 페이지 제외).
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 w-full" style={{ borderTop: "1px solid var(--wc-line)" }}>
      <div className="mx-auto max-w-[1280px] px-4 py-9 text-center">
        <p
          className="leading-snug"
          style={{
            fontFamily: "var(--font-pen, 'Nanum Pen Script', cursive)",
            fontSize: 20,
            color: "var(--wc-mute)",
          }}
        >
          그깟 공놀이에 진심인 팬들의 놀이터
        </p>
      </div>
    </footer>
  )
}
