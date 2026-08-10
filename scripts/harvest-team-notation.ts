/**
 * 팀 뉴스에서 인물 표기 수확 → 팀 한정 검증 → 사전 등재 (2026-08-10 운영자 제안).
 *
 * ## 왜 이 방식인가
 * 운영자: "소속팀은 어쨌든 고정이니까 그 팀과 관련된 소식들을 점검해서 사전을 추가하는 형태로"
 *
 * 기존 검증은 **LLM 이 후보를 생성**했는데, 실측으로 후보 누락이 잦았다:
 *   '하비 알론소' → [샤비, 하비, 자비] — 정답 '사비'가 빠짐
 *   '카릭' → [카릭, 마이클 카릭, 미하엘 카릭] — 정답 '캐릭'이 빠짐
 * 한국 매체 기사에서 직접 긁으면 **실사용 표기**가 후보로 들어온다. 실측(레알 마드리드):
 * Mourinho 가 조제 무리뉴 / 조세 모리뉴 / 조제 모리뉴 세 형태로 수확됐다.
 *
 * ## ⚠️ 수확은 후보 공급이지 등재가 아니다
 * 그대로 넣으면 사전이 오염된다 — 실측에서 나온 노이즈:
 *   · 은퇴 레전드 (호베르토/로베르토 카를로스) ← 무인 사서를 폐지시킨 바로 그 오염
 *   · 모호한 단일 이름 ('호르헤' 단독 44,451건 — 누구인지 알 수 없음)
 *   · 같은 사람의 3~4가지 표기 (매체 자체가 갈려 있다)
 * 그래서 수확 → **변형 묶기** → **팀 한정 카운트** → 기존 pickWinner 규칙으로 판정한다.
 * 판정이 불명확하면 등재하지 않고 "확인 필요"로 내놓는다.
 *
 * ## 실행 (운영자가 시점·대상을 지정)
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/harvest-team-notation.ts --teams "레알 마드리드"
 *   (server-only 모듈을 쓰므로 --tsconfig 필수) ... --write 로 등재
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { chatParams } from "@/lib/llm/openai-params"
import { koSimilarity } from "@/lib/news/alias-suggest"
import { pickWinner } from "@/lib/naming/pick"
import { proposeCandidates } from "@/lib/naming/verify"
import { loadNotation, unknownPersonNames } from "@/lib/news/notation"

const NAVER_PAGES = 3 // 100건 × 3 = 최근 300건
const BATCH = 40 // LLM 1회당 기사 수
/** 변형 묶기 임계 — alias-suggest 의 흡수 하한과 같은 값 */
const CLUSTER_MIN = 0.75

async function naverNews(query: string, start: number): Promise<string[]> {
  const r = await fetch(
    `https://openapi.naver.com/v1/search/news.json?${new URLSearchParams({
      query,
      display: "100",
      start: String(start),
      sort: "date",
    })}`,
    {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
      },
    }
  )
  if (!r.ok) return []
  const j = (await r.json()) as { items?: { title: string; description: string }[] }
  return (j.items ?? []).map((i) =>
    `${i.title} ${i.description}`.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ")
  )
}

async function naverCount(name: string, team: string): Promise<number> {
  // ⚠️ 이름만 따옴표 — 전체를 묶으면 정확한 구절 검색이 되어 거의 0이 나온다
  const r = await fetch(
    `https://openapi.naver.com/v1/search/news.json?${new URLSearchParams({
      query: `"${name}" ${team}`,
      display: "1",
    })}`,
    {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
      },
    }
  )
  if (!r.ok) return 0
  return ((await r.json()) as { total?: number }).total ?? 0
}

async function extractNames(team: string, text: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      ...chatParams("gpt-4o-mini", { temperature: 0 }),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `한국 축구 기사 묶음에서 **${team}의 현역 선수·현 감독**의 한글 이름만 기사에 적힌 그대로 추출하라.
⛔ 제외: 다른 팀 소속, **은퇴 선수·레전드**, 기자·해설자·구단주·에이전트, 구단명·대회명·지명.
성씨만 나온 것도 그대로 포함한다 (기사가 그렇게 쓰면 그게 실사용 표기다).
JSON만: {"names": ["..."]}`,
        },
        { role: "user", content: text.slice(0, 12000) },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) return []
  const d = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const p = JSON.parse(d.choices?.[0]?.message?.content ?? "{}") as { names?: unknown[] }
  return Array.isArray(p.names)
    ? [...new Set(p.names.map(String).filter((s) => /^[가-힣][가-힣 ]{1,14}$/.test(s)))]
    : []
}

/** 같은 사람의 표기 변형끼리 묶는다 — 포함 관계 또는 자모 유사도 */
function cluster(names: string[]): string[][] {
  const out: string[][] = []
  for (const n of names) {
    const c = n.replace(/\s+/g, "")
    const hit = out.find((g) =>
      g.some((m) => {
        const mc = m.replace(/\s+/g, "")
        return mc.includes(c) || c.includes(mc) || koSimilarity(m, n) >= CLUSTER_MIN
      })
    )
    if (hit) hit.push(n)
    else out.push([n])
  }
  return out
}

async function main() {
  const write = process.argv.includes("--write")
  const ti = process.argv.indexOf("--teams")
  if (ti < 0) throw new Error('--teams "레알 마드리드,바르셀로나" 형태로 대상을 지정할 것')
  const teams = process.argv[ti + 1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const notation = await loadNotation(supabase)
  const 등재: { team: string; name: string; counts: string }[] = []
  const 확인필요: { team: string; forms: string; reason: string }[] = []

  for (const team of teams) {
    const texts: string[] = []
    for (let p = 0; p < NAVER_PAGES; p++) texts.push(...(await naverNews(team, p * 100 + 1)))

    const names = new Set<string>()
    for (let i = 0; i < texts.length; i += BATCH) {
      for (const n of await extractNames(team, texts.slice(i, i + BATCH).join("\n"))) names.add(n)
    }
    // 이미 사전이 아는 이름은 건드리지 않는다 — 이 도구는 **채우는** 용도다
    const fresh = [...names].filter((n) => unknownPersonNames([n], notation.persons).length > 0)
    console.log(
      `■ ${team} — 기사 ${texts.length}건, 추출 ${names.size}명, 미등재 ${fresh.length}명`
    )

    for (const group of cluster(fresh)) {
      // ⚠️ 수확만으로 판정하면 안 된다. 실측: Mourinho 클러스터가 이번 실행에서
      // [조제 모리뉴, 조세 모리뉴] 만 잡혀 '조제 모리뉴'(2,612)가 이겼는데, 실제 1위는
      // 수확되지 않은 **'주제 무리뉴'(7,438)** 였다. 수확도 LLM 도 각자 후보를 빠뜨린다.
      // → 둘을 **합쳐야** 후보가 충분해진다. 이게 이 도구의 핵심이다.
      const proposed = (await proposeCandidates(group[0], `${team} 소속`)).candidates
      const candidates = [...new Set([...group, ...proposed])]
      const counts: { candidate: string; total: number }[] = []
      for (const f of candidates) {
        counts.push({ candidate: f, total: await naverCount(f, team) })
        await new Promise((r) => setTimeout(r, 150))
      }
      const v = pickWinner(counts)
      const detail = counts
        .sort((a, b) => b.total - a.total)
        .map((c) => `${c.candidate} ${c.total.toLocaleString()}`)
        .join(" / ")
      if (v.winner) 등재.push({ team, name: v.winner, counts: detail })
      else 확인필요.push({ team, forms: detail, reason: v.reason })
    }
  }

  console.log(`\n[등재 가능 ${등재.length}건 — 팀 한정 판정 명확]`)
  for (const r of 등재) console.log(`  ${r.name}  (${r.team})   ${r.counts}`)
  console.log(`\n[확인 필요 ${확인필요.length}건 — 사람이 판단]`)
  for (const r of 확인필요) console.log(`  ${r.forms}   (${r.team}) — ${r.reason}`)

  if (!write) {
    console.log(
      `\n(--write 를 주면 '등재 가능' ${등재.length}건만 넣는다. 확인 필요는 안 건드린다)`
    )
    return
  }
  let ok = 0
  for (const r of 등재) {
    const { error } = await supabase.from("news_alias_dictionary").insert({
      id: `player_harvest_${r.name.replace(/\s+/g, "_")}`.slice(0, 60),
      category: "player",
      preferred_ko: r.name,
      romanized: "",
      surfaces: [r.name],
      hangul_alts: [],
      confidence: 0.8,
      notes: `팀 뉴스 수확 ${new Date().toISOString().slice(0, 10)} — ${r.team} 한정: ${r.counts}`,
    })
    if (!error) ok++
    else console.error(`  실패 ${r.name}: ${error.message}`)
  }
  console.log(`\n등재 완료 ${ok}/${등재.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
