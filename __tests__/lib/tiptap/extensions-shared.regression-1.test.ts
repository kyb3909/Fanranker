// Regression: ISSUE-001 — TipTap Underline extension 중복 등록
// Found by /qa on 2026-04-18
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-18.md
//
// StarterKit 3.15+가 underline mark를 기본 포함하는데, 이전엔 별도
// @tiptap/extension-underline도 추가해 "Duplicate extension names: [underline]"
// 경고가 발생했다. 재발 방지: 공용 extension 배열의 이름 중복이 없어야 한다.

import { describe, it, expect } from "vitest"
import { createSharedTipTapExtensions } from "@/lib/tiptap/extensions/shared"

describe("createSharedTipTapExtensions — no duplicate extension names", () => {
  it("extension 배열에 동일 이름이 두 번 이상 나타나지 않아야 한다", () => {
    const extensions = createSharedTipTapExtensions()

    // StarterKit은 하위에 여러 extension을 재귀로 전개하므로,
    // 최상위 이름만 비교해도 중복 여부를 드러낸다.
    const names: string[] = extensions.map((ext) => {
      // Extension/Mark/Node 공통 속성: name
      return (ext as { name?: string }).name ?? "(unknown)"
    })

    const counts = new Map<string, number>()
    for (const n of names) {
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }

    const duplicates = [...counts.entries()].filter(([, c]) => c > 1)
    expect(duplicates, `중복된 extension: ${JSON.stringify(duplicates)}`).toEqual([])
  })

  it("underline은 별도 extension으로 등록되지 않아야 한다 (StarterKit 기본 포함)", () => {
    const extensions = createSharedTipTapExtensions()
    const names = extensions.map((ext) => (ext as { name?: string }).name ?? "")
    expect(names).not.toContain("underline")
  })
})
