import Link from "@/components/ui/app-link"
import {
  BUSINESS_INFO,
  isBusinessInfoConfigured,
  isContactEmailConfigured,
} from "@/lib/site-config"

/**
 * 사이트 공통 푸터 — 시안 A 의 다크 브랜드 블록 (다크 3존 중 마지막).
 * 라이트 본문이 여기서 끝난다는 신호 + 브랜드/정책 링크 정리.
 * app-shell 에서 chrome 노출 페이지에만 렌더 (admin·풀스크린 다크 페이지 제외).
 */

const LINKS = [
  { href: "/about", label: "회사 소개" },
  { href: "/terms", label: "이용약관" },
  { href: "/content-policy", label: "게시물 운영정책" },
  { href: "/privacy", label: "개인정보처리방침" },
]

export function SiteFooter() {
  return (
    <footer
      className="gn-band mt-12 w-full"
      style={{
        background:
          "radial-gradient(800px 300px at 50% 130%, rgba(150,30,55,.22), transparent 65%), var(--gn-night)",
      }}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-12 text-center sm:px-6">
        <span
          className="inline-block leading-none"
          style={{
            // 어그로체 Bold(700) 단일 — 더 굵은 값을 얹으면 합성 볼드가 된다
            fontFamily: "var(--font-display-ko), var(--font-title)",
            fontWeight: 700,
            fontSize: 40,
            letterSpacing: "-0.04em",
            color: "var(--gn-cream)",
          }}
        >
          그깟 공놀이
        </span>
        <div
          className="gn-num mt-2 text-[13px] font-bold"
          style={{ letterSpacing: "0.2em", color: "var(--gn-bg-100)" }}
        >
          GONGNORI.FAN
        </div>
        <p className="mt-3.5 text-[14px]" style={{ color: "var(--gn-cream-dim)" }}>
          그깟 공놀이에 진심인 팬들의 놀이터
        </p>

        <nav className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-[12.5px] font-semibold transition-colors hover:text-[var(--gn-cream)]"
              style={{ color: "#8d8794" }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* 사업자 표시 (전자상거래법) — 운영자가 BUSINESS_INFO 실값을 채우면 노출된다.
            플레이스홀더 상태로 내보내면 허위 표시라 미기재보다 나쁘다 → 게이트. */}
        {isBusinessInfoConfigured() && (
          <div className="mt-6 text-[11.5px] leading-relaxed" style={{ color: "#5b5565" }}>
            <p>
              상호: {BUSINESS_INFO.company} | 대표자: {BUSINESS_INFO.ceo} | 사업자등록번호:{" "}
              {BUSINESS_INFO.regNo}
            </p>
            <p>
              주소: {BUSINESS_INFO.address}
              {isContactEmailConfigured() && <> | 문의: {BUSINESS_INFO.contactEmail}</>}
            </p>
            {BUSINESS_INFO.mailOrderNo && <p>통신판매업 신고번호: {BUSINESS_INFO.mailOrderNo}</p>}
          </div>
        )}

        <p className="gn-num mt-5 text-[12px]" style={{ letterSpacing: "0.1em", color: "#5b5565" }}>
          © {new Date().getFullYear()} GONGNORI.FAN — SEE YOU AT KICKOFF
        </p>
      </div>
    </footer>
  )
}
