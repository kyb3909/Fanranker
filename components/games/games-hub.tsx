import Link from "next/link"
import Image from "next/image"
import { Crosshair, Zap, CircleDot, type LucideIcon } from "lucide-react"
import "./games-hub.css"

interface ArcadeGame {
  href: string
  name: string
  accent: string
  num: string
  desc: string
  Icon: LucideIcon
}

const ARCADE: ArcadeGame[] = [
  {
    href: "/games/corner-hero",
    name: "코너킥 히어로",
    accent: "var(--gh-marine)",
    num: "10",
    desc: "공이 올라오는 몇 초, 자리싸움과 타이밍으로 헤더골에 도전하는 코너킥 10회 챌린지.",
    Icon: Crosshair,
  },
  {
    href: "/games/pass-survivor",
    name: "패스 서바이버",
    accent: "var(--gh-amber)",
    num: "90'",
    desc: "몰려오는 수비 사이에서 패스로 버티는 90분 생존 챌린지. 빠른 패스가 곧 무기입니다.",
    Icon: Zap,
  },
  {
    href: "/games/rondo",
    name: "론도",
    accent: "var(--gh-emerald)",
    num: "∞",
    desc: "수비는 공을 쫓고, 패스는 길을 만듭니다. 한 번의 실수면 끝나는 론도 스코어 어택.",
    Icon: CircleDot,
  },
]

// 4-3-3 포메이션 점 좌표 (장식). fw=노란 점.
const FORMATION: { top: string; left: string; fw?: boolean }[] = [
  { top: "50%", left: "12%" }, // GK
  { top: "24%", left: "33%" }, // DF
  { top: "50%", left: "33%" }, // DF
  { top: "76%", left: "33%" }, // DF
  { top: "35%", left: "57%" }, // MF
  { top: "65%", left: "57%" }, // MF
  { top: "50%", left: "82%", fw: true }, // FW
]

export function GamesHub() {
  return (
    <div className="games-hub">
      <div className="gh-wrap">
        {/* 매스트헤드 */}
        <header className="gh-mast">
          <div>
            <div className="gh-kicker">GONGNORI ARCADE</div>
            <h1 className="gh-title">게임</h1>
            <p className="gh-sub">
              전략으로 팀을 꾸리고, 순발력으로 점수를 노린다. 골라서 바로 플레이하세요.
            </p>
          </div>
          <Image
            src="/mascot/hi.webp"
            alt=""
            width={88}
            height={88}
            className="gh-mascot"
            priority
          />
        </header>

        {/* 01 · 플래그십 */}
        <section className="gh-section">
          <div className="gh-sec-label">01 · 플래그십</div>
          <Link href="/games/draft" className="gh-flagship">
            <span className="gh-flag-stripe" aria-hidden />
            <div className="gh-flag-l">
              <div className="gh-badges">
                <span className="gh-badge gh-badge-hot">★ HOT</span>
                <span className="gh-badge gh-badge-soft">솔로 · 최대 4인</span>
              </div>
              <h3 className="gh-flag-title">드래프트 게임</h3>
              <p className="gh-flag-desc">
                한정된 예산으로 선수를 지명해 나만의 드림팀을 완성하는 스네이크 드래프트. AI와 혼자,
                친구와 실시간으로.
              </p>
              <div className="gh-meta">11인 로스터 │ 예산 $100 │ ~7분</div>
              <div className="gh-chips">
                <span className="gh-chip">
                  <span className="gh-dot" style={{ background: "var(--gh-arsenal)" }} />
                  아스널 드래프트
                </span>
                <span className="gh-chip gh-chip-soon">슬램덩크 드림팀 · SOON</span>
                <span className="gh-chip gh-chip-soon">삼국지 군단 · SOON</span>
              </div>
              <div className="gh-cta-row">
                <span className="gh-cta">플레이 →</span>
                <span className="gh-cta-note">기록 0판 · 첫 드래프트를 시작해보세요</span>
              </div>
            </div>
            <div className="gh-flag-r" aria-hidden>
              <div className="gh-pitch">
                <span className="gh-pitch-half" />
                <span className="gh-pitch-line" />
                {FORMATION.map((d, i) => (
                  <span
                    key={i}
                    className={d.fw ? "gh-pdot gh-pdot-fw" : "gh-pdot"}
                    style={{ top: d.top, left: d.left }}
                  />
                ))}
              </div>
              <span className="gh-formation-label">4-3-3 FORMATION</span>
            </div>
          </Link>
        </section>

        {/* 02 · 아케이드 */}
        <section className="gh-section">
          <div className="gh-sec-label">02 · 아케이드 · 한 판 챌린지</div>
          <div className="gh-arcade-grid">
            {ARCADE.map(({ href, name, accent, num, desc, Icon }) => (
              <Link
                key={href}
                href={href}
                className="gh-card"
                style={{ "--accent": accent } as React.CSSProperties}
              >
                <div className="gh-screen">
                  <Icon className="gh-screen-icon" size={34} strokeWidth={2} />
                  <span className="gh-screen-num">{num}</span>
                </div>
                <div className="gh-card-body">
                  <h3 className="gh-card-title">{name}</h3>
                  <p className="gh-card-desc">{desc}</p>
                  <div className="gh-card-foot">
                    <span className="gh-card-best">🏆 최고 —</span>
                    <span className="gh-arrow" aria-hidden>
                      →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 푸터 */}
        <div className="gh-footer">── 더 많은 미니게임이 곧 추가됩니다 ──</div>
      </div>
    </div>
  )
}
