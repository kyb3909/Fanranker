import "dotenv/config"
import { verifySpelling } from "@/lib/naming/verify"
import { extractClubName } from "@/lib/naming/pick"

/** 실제 기사 제목을 맥락으로 주고 전체 파이프라인 확인 (운영자 제안: 팀으로 좁혀 검증) */
const CASES: [name: string, title: string, 기대: string][] = [
  ["라파엘 레앙", "[가제타] AC 밀란, 라파엘 레앙 매각 검토", "하파엘 레앙 계열"],
  ["아라우조", "[더 타임스] 리버풀, 바르셀로나 아라우조 영입 후보로 고려", "아라우호"],
  ["카릭", "[맨체스터 이브닝 뉴스] 카릭, 래시포드 복귀 확인", "캐릭"],
  ["하비 알론소", "[BBC] 레알 마드리드 하비 알론소 감독 발언", "사비 알론소"],
]

async function main() {
  for (const [name, title, 기대] of CASES) {
    const scope = extractClubName(title)
    const v = await verifySpelling(name, title)
    const ok =
      v.winner && 기대.includes(v.winner.replace(/ 계열$/, "")) ? "✅" : v.winner ? "❓" : "❌"
    console.log(`\n■ "${name}"  (기대: ${기대})`)
    console.log(`  뽑힌 구단: ${scope ?? "(없음)"}`)
    console.log(`  ${ok} 승자: ${v.winner ?? "(없음)"}   ${v.reason}`)
    console.log(
      `  ${(v.counts ?? []).map((c) => `${c.candidate} ${c.total.toLocaleString()}`).join(" / ")}`
    )
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
