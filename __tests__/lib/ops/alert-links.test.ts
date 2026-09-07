import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  OPS_SCREENS,
  screenForIssue,
  screensForIssues,
  type OpsScreen,
} from "@/lib/ops/alert-links"
import {
  INVARIANT_CATALOG,
  adminScreenLabel,
  adminScreenOf,
  formatFindingField,
  toParticle,
} from "@/lib/ops/invariant-catalog"
import { buildOpsFields, buildOpsLinks } from "@/lib/discord-notify"

/**
 * 디스코드 알림 → 처리 화면 바로가기 (2026-09-08).
 *
 * 운영자: "해야 할 일이 디코로 날아오면 관리자 페이지 거기로 이동하게끔."
 * 여기서 잠그는 것: **모든 운영 점검 항목이 갈 곳을 안다**, 링크가 실제로 눌리는 절대 URL 이다,
 * 같은 곳을 여러 번 찍지 않는다.
 */

const OPS_MONITOR = resolve(process.cwd(), "app/api/cron/ops-monitor/route.ts")

describe("운영 점검 항목 → 처리 화면", () => {
  it("ops-monitor 가 실제로 만드는 항목 이름이 전부 갈 곳을 안다", () => {
    const src = readFileSync(OPS_MONITOR, "utf8")
    // issues.push({ name: "…" }) 의 리터럴을 전수로 읽는다 — 새 항목을 추가해도 여기서 걸린다
    const names = [...src.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThanOrEqual(10)
    const unmapped = names.filter((n) => screenForIssue(n).path === OPS_SCREENS.controlCenter.path)
    expect(unmapped, "관제 센터로만 떨어지는 항목 — alert-links 에 규칙을 추가할 것").toEqual([])
  })

  it("돈이 걸린 항목은 해당 화면으로, 필터까지 붙어서 간다", () => {
    expect(screenForIssue("💰 미해결 환불 큐").path).toBe(OPS_SCREENS.refunds.path)
    expect(screenForIssue("💸 미정산(고아) 예측").path).toBe(OPS_SCREENS.settlements.path)
    // 알림이 왔다는 건 이미 밀렸다는 뜻 — 첫 쪽이 아니라 오래된 것부터 열린다
    expect(OPS_SCREENS.refunds.path).toContain("sort=oldest")
    expect(OPS_SCREENS.reportsOldest.path).toContain("sort=oldest")
  })

  it("모르는 항목도 링크는 나간다 — 관제 센터", () => {
    expect(screenForIssue("🛸 처음 보는 항목").path).toBe("/admin")
  })

  it("여러 항목이 같은 화면이면 한 번만 남는다", () => {
    const screens = screensForIssues([
      "💰 미해결 환불 큐",
      "💰 미해결 환불 큐",
      "💸 미정산(고아) 예측",
    ])
    expect(screens.map((s: OpsScreen) => s.path)).toEqual([
      OPS_SCREENS.refunds.path,
      OPS_SCREENS.settlements.path,
    ])
  })
})

describe("불변식 → 처리 화면 이름", () => {
  it("카탈로그의 모든 경로가 사람이 읽는 이름을 갖는다", () => {
    const nameless = Object.entries(INVARIANT_CATALOG)
      .filter(([, info]) => adminScreenLabel(info.adminPath) === "관리자")
      .map(([id]) => id)
    expect(nameless, "ADMIN_SCREEN_LABEL 에 화면 이름을 추가할 것").toEqual([])
  })

  it("알림 필드의 링크 글자가 목적지 이름이다 — 전부 '관제실'이면 구별이 안 된다", () => {
    const field = formatFindingField(
      { invariant: "betman_status_regression", summary: "요약" },
      "https://gongnori.fan"
    )
    expect(field.value).toContain("[경기 관리로 가기](https://gongnori.fan/admin/matches)")
  })

  it("불변식 하나면 그 화면을 그대로 돌려준다", () => {
    expect(adminScreenOf("dict_alias_poisoned")).toEqual({
      label: "팀 사전",
      path: "/admin/team-dictionary",
    })
  })
})

describe("바로가기 필드", () => {
  it("상대경로를 절대 URL 로 만들고 마크다운 링크로 낸다", () => {
    const line = buildOpsLinks([{ label: "환불 큐", path: "/admin/refunds?status=pending" }])
    expect(line).toBe("[환불 큐](https://gongnori.fan/admin/refunds?status=pending)")
  })

  it("같은 곳은 접고 여섯 개까지만 낸다", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      label: `화면 ${i}`,
      path: `/admin/x${i}`,
    }))
    const line = buildOpsLinks([...many, { label: "중복", path: "/admin/x0" }]) ?? ""
    expect(line.split(" · ")).toHaveLength(6)
    expect(line).not.toContain("중복")
  })

  it("링크가 없으면 필드를 만들지 않는다", () => {
    expect(buildOpsLinks(undefined)).toBeNull()
    expect(buildOpsLinks([])).toBeNull()
  })

  it("조치 바로 아래에 바로가기가 온다 — 읽고 나서 누를 자리", () => {
    const fields = buildOpsFields({
      where: "여기",
      impact: "영향",
      action: "이렇게 하세요",
      links: [OPS_SCREENS.refunds],
      fields: [{ name: "기타", value: "값" }],
    })
    expect(fields.map((f) => f.name)).toEqual([
      "📍 어디서",
      "💥 영향",
      "🔧 지금 할 일",
      "🔗 바로 가기",
      "기타",
    ])
    expect(fields[3].value).toContain("https://gongnori.fan/admin/refunds")
  })
})

describe("링크 문구의 조사", () => {
  it("받침에 따라 로/으로를 고른다 — '팀 사전로 가기'는 사람이 쓴 문장이 아니다", () => {
    expect(toParticle("팀 사전")).toBe("으로")
    expect(toParticle("운영 모니터링")).toBe("으로")
    expect(toParticle("경기 관리")).toBe("로")
    expect(toParticle("뉴스 검수")).toBe("로")
    // ㄹ 받침은 "로"
    expect(toParticle("서울")).toBe("로")
    // 한글이 아니면 기본값
    expect(toParticle("admin")).toBe("로")
  })

  it("사전 화면 링크가 '팀 사전으로 가기'로 나온다", () => {
    const f = formatFindingField(
      { invariant: "dict_alias_poisoned", summary: "요약" },
      "https://gongnori.fan"
    )
    expect(f.value).toContain("[팀 사전으로 가기](https://gongnori.fan/admin/team-dictionary)")
  })
})
