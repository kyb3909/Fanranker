import type { Metadata } from "next"
import Image from "next/image"
import Link from "@/components/ui/app-link"

/**
 * 빅4 4파전 프로모션 (2026-08-13, 오너: "혹시 몰라서 준비") — 대기용 티저.
 *
 * 현행 시즌 이벤트(/season)는 3파전(아스널·리버풀·첼시)이고, 맨유 합류가 성사되면
 * 이 페이지가 예고장이 된다. **GNB 미노출·noindex — 직접 URL 전용** (/transfer 관례).
 * 실전 전환 시 할 일: ① noindex 해제 ② event_groups 에 devils 시드 ③ 등록 API
 * z.enum 에 devils 추가 (94e0158a 가 경계한 "화면엔 보이는데 등록은 실패" 방지).
 *
 * 비주얼 문법은 /season 히어로(다크 선언 존 + 팀 컬러 패널 + 어그로체 타이포)를 따른다.
 * 크레스트는 기존 3팀과 같은 Wikimedia 공식 원본 래스터 (운영 판단 2026-07-31 준용).
 */

export const metadata: Metadata = {
  title: "빅4 팬덤 대항전 — 예고",
  description: "아스널 · 리버풀 · 첼시 · 맨유. 프리미어리그 빅4 팬덤이 한 판에 모입니다.",
  robots: { index: false, follow: false },
}

const DISPLAY = "var(--font-display-ko), var(--font-title)"

const TEAMS = [
  {
    slug: "gooner",
    club: "아스널",
    fandom: "Gooner",
    color: "#EF0107",
    motto: "Victoria Concordia Crescit",
    crest: "/season/crest-arsenal.png",
    player: "/season/player-gooner.webp",
  },
  {
    slug: "kop",
    club: "리버풀",
    fandom: "Kopite",
    color: "#C8102E",
    motto: "You'll Never Walk Alone",
    crest: "/season/crest-liverpool.png",
    player: "/season/player-kop.webp",
  },
  {
    slug: "blues",
    club: "첼시",
    fandom: "Blues",
    color: "#034694",
    motto: "Pride of London",
    crest: "/season/crest-chelsea.png",
    player: "/season/player-blues.webp",
  },
  {
    slug: "devils",
    club: "맨유",
    fandom: "Red Devils",
    color: "#DA291C",
    motto: "Youth, Courage, Greatness",
    crest: "/season/crest-manutd.png",
    player: "/season/player-devils.webp",
  },
] as const

export default function Big4PromoPage() {
  return (
    <div className="min-h-[100dvh] bg-[#faf7f2]">
      {/* ── 다크 선언 존 — 히어로 ── */}
      <section className="relative overflow-hidden bg-[#17090d] text-white">
        <div className="mx-auto max-w-[1100px] px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
          <p className="text-[12px] font-extrabold tracking-[0.3em] text-[#e8c9a0]">
            COMING SOON · PREMIER LEAGUE BIG 4
          </p>
          <h1
            className="mt-3 text-[42px] leading-[1.05] font-bold sm:text-[64px]"
            style={{ fontFamily: DISPLAY }}
          >
            네 팬덤이
            <br />한 판에 모인다
          </h1>
          <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-white/70">
            아스널 · 리버풀 · 첼시, 그리고 맨유까지. 프리미어리그 빅4 팬덤이 시즌 승부예측
            대항전에서 자존심을 겨룹니다. 팀을 고르고, 예측하고, 팬덤의 이름으로 이기세요.
          </p>
        </div>

        {/* 4색 팀 패널 — 콜라주 애셋 없이 컬러 패널 + 크레스트 오버레이 */}
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {TEAMS.map((t) => (
            <div
              key={t.slug}
              className="relative flex h-[150px] items-center justify-center sm:h-[190px]"
              style={{
                background: `linear-gradient(160deg, ${t.color} 0%, ${t.color}cc 55%, #17090d 140%)`,
              }}
            >
              <Image
                src={t.crest}
                alt={`${t.club} 크레스트`}
                width={84}
                height={84}
                className="h-[72px] w-auto drop-shadow-[0_4px_14px_rgba(0,0,0,.45)] sm:h-[84px]"
              />
              <span className="absolute bottom-2 left-0 w-full text-center text-[12px] font-extrabold tracking-[0.2em] text-white/80">
                {t.fandom.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 팀 카드 4종 ── */}
      <section className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6">
        <h2 className="text-[20px] font-bold text-[#1f1216]" style={{ fontFamily: DISPLAY }}>
          어느 팬덤으로 참전할 것인가
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAMS.map((t) => (
            <div
              key={t.slug}
              className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_14px_rgba(31,18,22,.08)]"
            >
              <div className="relative h-[220px]">
                <Image
                  src={t.player}
                  alt={`${t.club} 팬덤 포스터`}
                  fill
                  sizes="(max-width: 640px) 100vw, 25vw"
                  className="object-cover object-top"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(to top, ${t.color}e6 0%, transparent 55%)`,
                  }}
                />
                <Image
                  src={t.crest}
                  alt=""
                  width={44}
                  height={44}
                  className="absolute bottom-3 left-3 h-[44px] w-auto drop-shadow"
                />
              </div>
              <div className="p-4">
                <p className="text-[12px] font-extrabold" style={{ color: t.color }}>
                  {t.club}
                </p>
                <p className="text-[20px] font-bold text-[#1f1216]" style={{ fontFamily: DISPLAY }}>
                  {t.fandom}
                </p>
                <p className="mt-1 text-[12px] text-[#8a7a7f] italic">“{t.motto}”</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 방식 요약 + CTA ── */}
      <section className="mx-auto max-w-[1100px] px-4 pb-16 sm:px-6">
        <div className="rounded-2xl bg-white p-6 shadow-[0_2px_14px_rgba(31,18,22,.08)] sm:p-8">
          <h2 className="text-[20px] font-bold text-[#1f1216]" style={{ fontFamily: DISPLAY }}>
            방식은 간단합니다
          </h2>
          <ol className="mt-4 grid gap-4 text-[14px] leading-relaxed text-[#4a3a3f] sm:grid-cols-3">
            <li>
              <b className="text-[#8b1e3f]">01 · 팀 선택</b>
              <br />네 팬덤 중 하나를 골라 등록합니다. 한 번 고르면 시즌 끝까지.
            </li>
            <li>
              <b className="text-[#8b1e3f]">02 · 승부예측</b>
              <br />매 라운드 경기를 예측합니다. 내 적중이 곧 팬덤의 성적.
            </li>
            <li>
              <b className="text-[#8b1e3f]">03 · 팬덤 대항</b>
              <br />
              활동하면 경품 추첨 자격이 생깁니다. 순위는 팬덤의 자존심으로.
            </li>
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/season"
              className="rounded-full bg-[#8b1e3f] px-5 py-2.5 text-[14px] font-bold text-white"
            >
              지금 열려 있는 대항전 보기 →
            </Link>
            <span className="text-[12px] text-[#8a7a7f]">
              빅4 4파전은 준비 중 — 오픈 시점은 추후 공지됩니다.
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
