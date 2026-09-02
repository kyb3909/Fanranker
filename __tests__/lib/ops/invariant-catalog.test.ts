import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  INVARIANT_CATALOG,
  describeInvariant,
  formatFindingField,
} from "@/lib/ops/invariant-catalog"
import { buildOpsFields, opsUrl } from "@/lib/discord-notify"

/**
 * 불변식 카탈로그 커버리지 (2026-09-02). 감사관 라우트가 밀어 넣는 `invariant: "…"` 리터럴을 전수로
 * 읽어, 카탈로그에 없는 코드가 알림에 영문 그대로 나가는 일을 막는다 — 사람이 주석을 안 읽어도 걸린다.
 */

const ROUTE = resolve(process.cwd(), "app/api/cron/invariant-audit/route.ts")

describe("INVARIANT_CATALOG — 감사관의 모든 불변식을 사람 말로 안다", () => {
  it("라우트의 invariant 리터럴 전부가 카탈로그에 있다", () => {
    const src = readFileSync(ROUTE, "utf8")
    const ids = [...src.matchAll(/invariant:\s*"([a-z_]+)"/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThanOrEqual(12)
    const missing = [...new Set(ids)].filter((id) => !INVARIANT_CATALOG[id])
    expect(missing).toEqual([])
  })

  it("항목마다 label·impact·action·adminPath 가 비어 있지 않고 관제실 경로다", () => {
    for (const [id, info] of Object.entries(INVARIANT_CATALOG)) {
      expect(info.label, id).not.toMatch(/^[a-z_]+$/)
      expect(info.impact.length, id).toBeGreaterThan(5)
      expect(info.action.length, id).toBeGreaterThan(5)
      expect(info.adminPath, id).toMatch(/^\/admin\//)
    }
  })

  it("모르는 코드도 알림은 나간다 — 코드 그대로 + 관제실", () => {
    const d = describeInvariant("something_new")
    expect(d.label).toBe("something_new")
    expect(d.adminPath).toBe("/admin/operations")
  })
})

describe("formatFindingField — 근거 → 영향 → 조치 → 링크", () => {
  it("영문 코드 대신 사람 말이 제목이고, 조치와 절대 링크가 본문에 있다", () => {
    const f = formatFindingField(
      {
        invariant: "notation_alt_in_title",
        summary: `발행물이 옛/오 표기 사용 — "래시퍼드" (대표: "래시포드") in "래시퍼드 복귀골"`,
      },
      "https://gongnori.fan"
    )
    expect(f.name).toBe("발행 제목이 옛/오 표기를 씀 (notation_alt_in_title)")
    expect(f.value).toContain("래시퍼드")
    expect(f.value).toContain("🔧")
    expect(f.value).toContain("[관제실](https://gongnori.fan/admin/news-review)")
  })

  it("summary 는 180자가 아니라 700자까지 — 조치 문장이 잘리지 않는다", () => {
    const long = "x".repeat(650) + " — 라인업 소스의 응답 모양(필드명)을 의심할 것"
    const f = formatFindingField({ invariant: "lineup_bench_empty", summary: long }, "https://s")
    expect(f.value).toContain("의심할 것")
  })
})

describe("discord-notify 구조화 필드", () => {
  it("상대경로는 사이트 도메인이 붙는다 — 디스코드 임베드는 절대 URL 만 링크가 된다", () => {
    expect(opsUrl("/admin/matches")).toMatch(/^https?:\/\/.+\/admin\/matches$/)
    expect(opsUrl("https://example.com/x")).toBe("https://example.com/x")
    expect(opsUrl(undefined)).toBeUndefined()
  })

  it("어디·영향·조치가 발신처 필드보다 먼저, 순서 고정", () => {
    const fields = buildOpsFields({
      where: "첼시 v 브라이턴",
      impact: "정산이 뒤바뀜",
      action: "관제실에서 정정",
      fields: [{ name: "베트맨", value: "4-3" }],
    })
    expect(fields.map((f) => f.name)).toEqual(["📍 어디서", "💥 영향", "🔧 지금 할 일", "베트맨"])
  })

  it("구조화 필드가 없으면 종전과 같다 (기존 발신처 무변경)", () => {
    const fields = buildOpsFields({ fields: [{ name: "a", value: "b", inline: true }] })
    expect(fields).toEqual([{ name: "a", value: "b", inline: true }])
  })
})
