import "dotenv/config"
import { verifySpelling } from "@/lib/naming/verify"

/** 실제로 게이트에 갇혀 있던 이름들 — 접기 수정 후 승자가 나오는지 실측 */
const BLOCKED = ["로날드 아라우호", "에딘 제코", "비니시우스 주니어", "프렌키 데용", "라파엘 레앙"]

async function main() {
  for (const name of BLOCKED) {
    const v = await verifySpelling(name, `${name} 이적설`)
    const counts = (v.counts ?? [])
      .map((c) => `${c.candidate} ${c.total.toLocaleString()}`)
      .join(" / ")
    console.log(`\n■ "${name}"`)
    console.log(`  ${v.winner ? `✅ 승자: ${v.winner}` : `❌ ${v.reason}`}`)
    console.log(`  네이버: ${counts || "(없음)"}`)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
