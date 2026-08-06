/**
 * 팀 사전 시드 (실록 단계 2, 2026-08-07)
 *
 * 두 갈래로 채운다:
 *  1. HARVESTED — 2026-08-07 soccerway 실측(정적 페이지 seoFooter·next_round 크럼,
 *     구 URL 리다이렉트)에서 확보한 해시. name_en 은 soccerway 표시명 그대로
 *     (홈/원정 대조가 title 표시명 기준이라 표시명이 정본).
 *  2. OLD_URL_PROBES — 구 soccerway URL(/teams/{country}/{slug}/{id}/)을 fetch 해
 *     301 최종 URL 에서 해시를 수확. id 가 틀리면 홈페이지로 soft-fail (감지·스킵).
 *
 * 한글 표기(name_kr·aliases_kr)는 betman_games 실표기(2026-08-07 조회)를 붙였다.
 * 전부 status='proposed' — 오너 확정(confirmed)은 admin 화면(슬라이스 B)에서.
 *
 * 기본 드라이런. 실제 반영은 --apply (단계 0-3 규율).
 * 실행: pnpm exec tsx scripts/seed-team-dictionary.ts [--apply] [--skip-probe]
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")
const SKIP_PROBE = process.argv.includes("--skip-probe")

interface SeedTeam {
  soccerway_team_id: string
  slug: string
  name_en: string
  name_kr: string | null
  aliases_kr: string[]
  source: string
  note?: string
}

/** 2026-08-07 정적 크럼·리다이렉트 실측으로 확보한 해시 (검증된 값만) */
const HARVESTED: SeedTeam[] = [
  // EPL
  {
    soccerway_team_id: "hA1Zm19f",
    slug: "arsenal",
    name_en: "Arsenal",
    name_kr: "아스널",
    aliases_kr: ["아스날"],
    source: "seed",
  },
  {
    soccerway_team_id: "lId4TMwf",
    slug: "liverpool",
    name_en: "Liverpool",
    name_kr: "리버풀",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "4fGZN2oK",
    slug: "chelsea",
    name_en: "Chelsea",
    name_kr: "첼시",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "ppjDR086",
    slug: "manchester-united",
    name_en: "Manchester United",
    name_kr: "맨체스터 유나이티드",
    aliases_kr: ["맨유"],
    source: "seed",
  },
  {
    soccerway_team_id: "W00wmLO0",
    slug: "aston-villa",
    name_en: "Aston Villa",
    name_kr: "애스턴 빌라",
    aliases_kr: ["아스톤 빌라"],
    source: "seed",
  },
  {
    soccerway_team_id: "AovF1Mia",
    slug: "crystal-palace",
    name_en: "Crystal Palace",
    name_kr: "크리스탈 팰리스",
    aliases_kr: ["크리스탈 팔레스"],
    source: "seed",
  },
  {
    soccerway_team_id: "69ZiU2Om",
    slug: "fulham",
    name_en: "Fulham",
    name_kr: "풀럼",
    aliases_kr: ["풀햄"],
    source: "seed",
  },
  {
    soccerway_team_id: "2XrRecc3",
    slug: "brighton",
    name_en: "Brighton",
    name_kr: "브라이턴",
    aliases_kr: ["브라이튼"],
    source: "seed",
  },
  {
    soccerway_team_id: "UsushcZr",
    slug: "nottingham",
    name_en: "Nottingham",
    name_kr: "노팅엄 포레스트",
    aliases_kr: ["노팅엄"],
    source: "seed",
  },
  {
    soccerway_team_id: "p6ahwuwJ",
    slug: "newcastle-utd",
    name_en: "Newcastle Utd",
    name_kr: "뉴캐슬 유나이티드",
    aliases_kr: ["뉴캐슬"],
    source: "seed",
  },
  {
    soccerway_team_id: "KluSTr9s",
    slug: "everton",
    name_en: "Everton",
    name_kr: "에버턴",
    aliases_kr: ["에버튼"],
    source: "seed",
  },
  // 유럽 빅클럽 (betman 축클럽친·UCL 등장)
  {
    soccerway_team_id: "nVp0wiqd",
    slug: "bayern-munich",
    name_en: "Bayern Munich",
    name_kr: "바이에른 뮌헨",
    aliases_kr: ["바이에른"],
    source: "seed",
  },
  {
    soccerway_team_id: "nP1i5US1",
    slug: "dortmund",
    name_en: "Dortmund",
    name_kr: "보루시아 도르트문트",
    aliases_kr: ["도르트문트"],
    source: "seed",
  },
  {
    soccerway_team_id: "KbS1suSm",
    slug: "rb-leipzig",
    name_en: "RB Leipzig",
    name_kr: "RB라이프치히",
    aliases_kr: ["라이프치히"],
    source: "seed",
  },
  {
    soccerway_team_id: "nJQmYp1B",
    slug: "vfb-stuttgart",
    name_en: "VfB Stuttgart",
    name_kr: "슈투트가르트",
    aliases_kr: ["VfB슈투트가르트"],
    source: "seed",
  },
  {
    soccerway_team_id: "CjhkPw0k",
    slug: "psg",
    name_en: "PSG",
    name_kr: "파리 생제르맹",
    aliases_kr: ["PSG", "파리생제르맹"],
    source: "seed",
  },
  {
    soccerway_team_id: "2akflumR",
    slug: "lyon",
    name_en: "Lyon",
    name_kr: "올랭피크 리옹",
    aliases_kr: ["리옹"],
    source: "seed",
  },
  {
    soccerway_team_id: "W8mj7MDD",
    slug: "real-madrid",
    name_en: "Real Madrid",
    name_kr: "레알 마드리드",
    aliases_kr: ["레알"],
    source: "seed",
  },
  {
    soccerway_team_id: "CQeaytrD",
    slug: "valencia",
    name_en: "Valencia",
    name_kr: "발렌시아",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "8pvUZFhf",
    slug: "celta-vigo",
    name_en: "Celta Vigo",
    name_kr: "셀타 비고",
    aliases_kr: ["셀타비고"],
    source: "seed",
  },
  {
    soccerway_team_id: "Iw7eKK25",
    slug: "inter",
    name_en: "Inter",
    name_kr: "인테르나치오날레 밀라노",
    aliases_kr: ["인테르", "인터 밀란"],
    source: "seed",
  },
  {
    soccerway_team_id: "C06aJvIB",
    slug: "juventus",
    name_en: "Juventus",
    name_kr: "유벤투스",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "8Sa8HInO",
    slug: "ac-milan",
    name_en: "AC Milan",
    name_kr: "AC밀란",
    aliases_kr: ["AC 밀란", "밀란"],
    source: "seed",
  },
  {
    soccerway_team_id: "zVqqL0ma",
    slug: "as-roma",
    name_en: "AS Roma",
    name_kr: "AS로마",
    aliases_kr: ["로마"],
    source: "seed",
  },
  {
    soccerway_team_id: "69Dxbc61",
    slug: "napoli",
    name_en: "Napoli",
    name_kr: "나폴리",
    aliases_kr: ["SSC나폴리"],
    source: "seed",
  },
  {
    soccerway_team_id: "rXw8YKDE",
    slug: "udinese",
    name_en: "Udinese",
    name_kr: "우디네세",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "M9UEHJWi",
    slug: "psv",
    name_en: "PSV",
    name_kr: "PSV에인트호번",
    aliases_kr: ["PSV", "에인트호번"],
    source: "seed",
  },
  {
    soccerway_team_id: "8UOvIwnb",
    slug: "ajax",
    name_en: "Ajax",
    name_kr: "아약스",
    aliases_kr: [],
    source: "seed",
  },
  // UCL 예선·기타 (betman UCL 등장 팀)
  {
    soccerway_team_id: "S0WZMUNG",
    slug: "bodo-glimt",
    name_en: "Bodo/Glimt",
    name_kr: "FK보되 글림트",
    aliases_kr: ["보되 글림트", "보되글림트"],
    source: "seed",
  },
  {
    soccerway_team_id: "407h8Ird",
    slug: "royale-union-sg",
    name_en: "Royale Union SG",
    name_kr: "루아얄 위니옹 생질루아즈",
    aliases_kr: ["위니옹 생질루아즈"],
    source: "seed",
  },
  {
    soccerway_team_id: "hnzvnHPS",
    slug: "olympiacos-piraeus",
    name_en: "Olympiacos Piraeus",
    name_kr: "올림피아코스",
    aliases_kr: ["올림피아코스 피레우스"],
    source: "seed",
  },
  {
    soccerway_team_id: "nRluRF0T",
    slug: "nijmegen",
    name_en: "Nijmegen",
    name_kr: "NEC네이메헌",
    aliases_kr: ["네이메헌", "NEC"],
    source: "seed",
  },
  {
    soccerway_team_id: "6qA358jH",
    slug: "sparta-prague",
    name_en: "Sparta Prague",
    name_kr: "스파르타 프라하",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "MsbmracL",
    slug: "fenerbahce",
    name_en: "Fenerbahce",
    name_kr: "페네르바흐체SK",
    aliases_kr: ["페네르바흐체"],
    source: "seed",
  },
  {
    soccerway_team_id: "zsktjfsD",
    slug: "sturm-graz",
    name_en: "Sturm Graz",
    name_kr: "슈투름 그라츠",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "QFKRRD8M",
    slug: "celtic",
    name_en: "Celtic",
    name_kr: "셀틱",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "QRaWdwQf",
    slug: "slovan-bratislava",
    name_en: "Slovan Bratislava",
    name_kr: "슬로반 브라티슬라바",
    aliases_kr: [],
    source: "seed",
  },
  {
    soccerway_team_id: "0AheRyBg",
    slug: "inter-miami",
    name_en: "Inter Miami",
    name_kr: "인터 마이애미CF",
    aliases_kr: ["인터 마이애미"],
    source: "seed",
  },
]

/**
 * 구 URL 리다이렉트로 해시를 수확할 팀.
 *
 * ⚠️ 2026-08-07 드라이런 실측: 리다이렉트는 **숫자 id 만 보고 슬러그를 무시한다**.
 * 틀린 id 는 홈페이지가 아니라 **엉뚱한 팀**에 착지한다 (666→bolton, 2013→somalia).
 * 그래서 expectedSlugs 로 최종 URL 슬러그를 검증하고, 불일치는 무조건 버린다.
 * id 를 모르는 팀은 여기 넣지 않는다 — team_unresolved 원장을 보고 admin 에서 수동 등재.
 */
const OLD_URL_PROBES: {
  country: string
  oldSlug: string
  oldId: number
  /** 최종 신 URL 의 슬러그가 이 중 하나가 아니면 폐기 (오염 방지 가드) */
  expectedSlugs: string[]
  name_kr: string
  aliases_kr: string[]
}[] = [
  {
    country: "england",
    oldSlug: "manchester-city-fc",
    oldId: 676,
    expectedSlugs: ["manchester-city", "man-city"],
    name_kr: "맨체스터 시티",
    aliases_kr: ["맨시티"],
  },
  {
    country: "england",
    oldSlug: "tottenham-hotspur-fc",
    oldId: 675,
    expectedSlugs: ["tottenham", "tottenham-hotspur"],
    name_kr: "토트넘 홋스퍼",
    aliases_kr: ["토트넘"],
  },
  {
    country: "england",
    oldSlug: "afc-bournemouth",
    oldId: 679,
    expectedSlugs: ["bournemouth", "afc-bournemouth"],
    name_kr: "본머스",
    aliases_kr: ["AFC본머스"],
  },
  {
    country: "spain",
    oldSlug: "fc-barcelona",
    oldId: 2017,
    expectedSlugs: ["barcelona", "fc-barcelona"],
    name_kr: "바르셀로나",
    aliases_kr: ["FC바르셀로나", "바르사"],
  },
  {
    country: "spain",
    oldSlug: "real-betis-balompie",
    oldId: 2033,
    expectedSlugs: ["real-betis", "betis"],
    name_kr: "레알 베티스",
    aliases_kr: ["베티스"],
  },
]

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** 구 URL → 신 /team/{slug}/{hash}/ 리다이렉트에서 해시 수확. 실패 시 null */
async function probeOldUrl(p: (typeof OLD_URL_PROBES)[number]): Promise<SeedTeam | null> {
  const url = `https://www.soccerway.com/teams/${p.country}/${p.oldSlug}/${p.oldId}/`
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" })
    const final = res.url || ""
    const m = final.match(/\/team\/([a-z0-9-]+)\/([A-Za-z0-9]{8})\/?$/)
    if (!res.ok || !m) {
      console.log(`  [probe-fail] ${p.oldSlug}/${p.oldId} → ${final || res.status} (스킵)`)
      return null
    }
    const [, slug, hash] = m
    if (!p.expectedSlugs.includes(slug)) {
      // 리다이렉트가 id 만 보고 딴 팀에 착지 — 오염 방지를 위해 무조건 폐기
      console.log(
        `  [probe-MISMATCH] ${p.oldSlug}/${p.oldId} → ${slug} (기대: ${p.expectedSlugs.join("|")}) — 폐기`
      )
      return null
    }
    // 표시명은 슬러그에서 복원(대조는 title 표시명 기준이라 첫 fetch 후 갱신될 수 있음)
    const nameEn = slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
    console.log(`  [probe-ok] ${p.oldSlug} → ${slug}/${hash}`)
    return {
      soccerway_team_id: hash,
      slug,
      name_en: nameEn,
      name_kr: p.name_kr,
      aliases_kr: p.aliases_kr,
      source: "redirect_harvest",
      note: `old:${p.country}/${p.oldSlug}/${p.oldId}`,
    }
  } catch (e) {
    console.log(`  [probe-error] ${p.oldSlug}: ${(e as Error).message}`)
    return null
  }
}

async function main() {
  console.log(`[seed-team-dictionary] mode=${APPLY ? "apply" : "dry-run"}`)

  const teams: SeedTeam[] = [...HARVESTED]

  if (!SKIP_PROBE) {
    console.log(`[probe] 구 URL 리다이렉트 수확 ${OLD_URL_PROBES.length}건`)
    for (const p of OLD_URL_PROBES) {
      const t = await probeOldUrl(p)
      if (t) teams.push(t)
      await new Promise((r) => setTimeout(r, 400))
    }
  }

  // 해시 중복 방지 (수확이 기존 시드와 같은 팀을 가리킬 수 있음)
  const byId = new Map<string, SeedTeam>()
  for (const t of teams) {
    const prev = byId.get(t.soccerway_team_id)
    if (prev) {
      prev.aliases_kr = Array.from(new Set([...prev.aliases_kr, ...t.aliases_kr]))
    } else {
      byId.set(t.soccerway_team_id, t)
    }
  }
  const finalTeams = [...byId.values()]
  console.log(`[seed] 대상 ${finalTeams.length}팀`)

  if (!APPLY) {
    for (const t of finalTeams) {
      console.log(
        `  (dry) ${t.soccerway_team_id} ${t.slug} | ${t.name_kr} | alias=[${t.aliases_kr.join(", ")}]`
      )
    }
    console.log("[done] 드라이런 — 반영하려면 --apply")
    return
  }

  const supabase = createServiceClient()
  let ok = 0
  const errors: string[] = []
  for (const t of finalTeams) {
    // 재실행 안전: 있으면 alias 만 합치고 name/status 는 건드리지 않는다 (오너 확정 보호)
    const { data: existing } = await supabase
      .from("team_dictionary")
      .select("soccerway_team_id, aliases_kr")
      .eq("soccerway_team_id", t.soccerway_team_id)
      .maybeSingle()

    if (existing) {
      const merged = Array.from(new Set([...(existing.aliases_kr || []), ...t.aliases_kr]))
      const { error } = await supabase
        .from("team_dictionary")
        .update({ aliases_kr: merged, updated_at: new Date().toISOString() })
        .eq("soccerway_team_id", t.soccerway_team_id)
      if (error) errors.push(`${t.slug}: ${error.message}`)
      else ok++
    } else {
      const { error } = await supabase.from("team_dictionary").insert({
        soccerway_team_id: t.soccerway_team_id,
        slug: t.slug,
        name_en: t.name_en,
        name_kr: t.name_kr,
        aliases_kr: t.aliases_kr,
        status: "proposed",
        source: t.source,
        note: t.note ?? null,
      })
      if (error) errors.push(`${t.slug}: ${error.message}`)
      else ok++
    }
  }

  console.log(
    `[done] 반영 ${ok}/${finalTeams.length}${errors.length ? `, 오류 ${errors.length}` : ""}`
  )
  for (const e of errors) console.error("  " + e)
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})
