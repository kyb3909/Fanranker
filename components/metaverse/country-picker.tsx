"use client"

/**
 * CountryPicker — 메타버스 진입 랜딩. 국가/리그 선택 후 해당 월드맵으로 이동.
 *
 * 현재 활성: 영국 (EPL/EFL 권역). 향후 한국·미국·일본 리그 추가 예정 (비활성 카드로 placeholder).
 * dev 환경이면 Clerk 미초기화여도 열람 가능. 프로덕션에서는 Clerk 로그인 필요 가드는 각 월드맵 페이지에서 처리.
 */

import Link from "next/link"
import Image from "next/image"

interface CountryCard {
  id: string
  label: string
  subtitle: string
  thumb: string
  href: string | null
  active: boolean
  comingSoonNote?: string
}

const COUNTRIES: CountryCard[] = [
  {
    id: "uk",
    label: "영국",
    subtitle: "프리미어리그 · EFL",
    thumb: "/map/regions/england-thumb.webp",
    href: "/metaverse/uk",
    active: true,
  },
  {
    id: "kr",
    label: "한국",
    subtitle: "K리그 · KBO · KBL",
    thumb: "/map/regions/england-thumb.webp", // TODO: 한국 지도 에셋 생성 시 교체
    href: null,
    active: false,
    comingSoonNote: "준비 중",
  },
  {
    id: "us",
    label: "미국",
    subtitle: "NBA · MLB · NFL",
    thumb: "/map/regions/england-thumb.webp", // TODO: 미국 지도 에셋
    href: null,
    active: false,
    comingSoonNote: "준비 중",
  },
  {
    id: "jp",
    label: "일본",
    subtitle: "J리그 · NPB",
    thumb: "/map/regions/england-thumb.webp", // TODO: 일본 지도 에셋
    href: null,
    active: false,
    comingSoonNote: "준비 중",
  },
]

export function CountryPicker() {
  return (
    <div className="min-h-[calc(100svh-3.5rem)] bg-neutral-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-semibold tracking-[0.25em] text-white/40 uppercase">
            Stadium Metaverse
          </p>
          <h1 className="mt-3 text-2xl font-bold md:text-3xl">어느 리그로 떠나볼까요?</h1>
          <p className="mt-2 text-sm text-white/60">
            국가를 선택하면 해당 리그의 월드맵으로 이동해요.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COUNTRIES.map((country) => {
            const card = (
              <div
                className={`group relative overflow-hidden rounded-xl border transition-all ${
                  country.active
                    ? "border-white/20 bg-white/[0.04] hover:-translate-y-1 hover:border-emerald-500/60 hover:bg-emerald-500/5"
                    : "border-white/10 bg-white/[0.02] opacity-60"
                }`}
              >
                <div className="relative aspect-video w-full overflow-hidden bg-neutral-900">
                  <Image
                    src={country.thumb}
                    alt={`${country.label} 지도`}
                    fill
                    sizes="(max-width: 768px) 100vw, 25vw"
                    className={`object-cover ${country.active ? "" : "grayscale"}`}
                  />
                  {!country.active ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold backdrop-blur-sm">
                        {country.comingSoonNote ?? "준비 중"}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="p-4">
                  <p className="text-lg font-semibold">{country.label}</p>
                  <p className="mt-0.5 text-xs text-white/60">{country.subtitle}</p>
                </div>
              </div>
            )

            if (country.active && country.href) {
              return (
                <li key={country.id}>
                  <Link href={country.href} aria-label={`${country.label} 월드맵 입장`}>
                    {card}
                  </Link>
                </li>
              )
            }
            return (
              <li
                key={country.id}
                className="cursor-not-allowed"
                title={country.comingSoonNote ?? "준비 중"}
              >
                {card}
              </li>
            )
          })}
        </ul>

        <p className="mt-10 text-center text-[10px] text-white/40">
          내부 테스트 중 · 국가별 지도와 리그 데이터는 순차적으로 열릴 예정입니다.
        </p>
      </div>
    </div>
  )
}
