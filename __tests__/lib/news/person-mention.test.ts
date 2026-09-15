// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  applyNamingPairs,
  buildNamingPairs,
  buildNotationHints,
  findNotationViolations,
  unknownPersonNames,
  type NotationEntry,
} from "@/lib/news/notation/rules"
import { selectNotationHints } from "@/lib/news/notation/select-hints"
import { buildNamingHints } from "@/scripts/vps-news-scanner/news-scanner.mjs"

const person = (values: Partial<NotationEntry>): NotationEntry => ({
  id: "person",
  category: "player",
  preferred_ko: "부카요 사카",
  romanized: "Bukayo Saka",
  surfaces: [],
  hangul_alts: [],
  given_name_ko: "",
  family_name_ko: "",
  short_name_ko: "",
  ...values,
})
const saka = person({
  given_name_ko: "부카요",
  family_name_ko: "사카",
  short_name_ko: "사카",
  hangul_alts: ["사카", "부카요 싸카"],
})

describe("explicit Korean first and subsequent person mentions", () => {
  it("carries Bukayo Saka's full first mention and short later mention into both writers", () => {
    const hints = buildNotationHints([saka])
    expect(selectNotationHints(hints, "Bukayo Saka spoke after the match.")[0]).toMatchObject({
      ko: "부카요 사카",
      first_mention_ko: "부카요 사카",
      subsequent_mention_ko: "사카",
      given_name_ko: "부카요",
      family_name_ko: "사카",
    })
    expect(buildNamingHints(hints, "Bukayo Saka spoke after the match.")).toContain(
      "본문 첫 언급: 부카요 사카 · 이후: 사카"
    )
    const text = "부카요 사카가 인터뷰했다. 사카는 동료들을 칭찬했다."
    expect(applyNamingPairs(text, buildNamingPairs([saka]))).toBe(text)
    expect(applyNamingPairs("부카요 싸카가 말했다.", buildNamingPairs([saka]))).toBe(
      "부카요 사카가 말했다."
    )
    expect(findNotationViolations(text, [saka])).toEqual([])
  })

  it("never derives a surname or Western name order for Son Heung-min", () => {
    const son = person({
      preferred_ko: "손흥민",
      romanized: "Son Heung-min",
      given_name_ko: "흥민",
      family_name_ko: "손",
    })
    const hints = buildNotationHints([son])
    const selected = selectNotationHints(hints, "Son Heung-min spoke after the match.")[0]
    expect(selected.first_mention_ko).toBe("손흥민")
    expect(selected.subsequent_mention_ko).toBe("손흥민")
    expect(selected.short_name_ko).toBeUndefined()
    const scanner = buildNamingHints(hints, "Son Heung-min spoke after the match.")
    expect(scanner).toContain("본문 첫 언급: 손흥민 · 이후: 손흥민")
    expect(scanner).not.toContain("흥민 손")
  })

  it("keeps full names when a source names two people sharing a family name, including before budget truncation", () => {
    const reece = person({
      id: "reece",
      preferred_ko: "리스 제임스",
      romanized: "Reece James",
      given_name_ko: "리스",
      family_name_ko: "제임스",
      short_name_ko: "제임스",
    })
    const daniel = person({
      id: "daniel",
      preferred_ko: "다니엘 제임스",
      romanized: "Daniel James",
      given_name_ko: "다니엘",
      family_name_ko: "제임스",
      short_name_ko: "제임스",
    })
    const hints = buildNotationHints([reece, daniel])
    const source = "Reece James defended against Daniel James."
    for (const selected of selectNotationHints(hints, source)) {
      expect(selected.short_name_ambiguous).toBe(true)
      expect(selected.subsequent_mention_ko).toBe(selected.first_mention_ko)
    }
    expect(selectNotationHints(hints, source, 1)[0].short_name_ambiguous).toBe(true)
    const scanner = buildNamingHints(hints, source)
    expect(scanner).toContain("본문 첫 언급: 리스 제임스 · 이후: 리스 제임스")
    expect(scanner).toContain("본문 첫 언급: 다니엘 제임스 · 이후: 다니엘 제임스")
    expect(selectNotationHints(hints, "Reece James spoke.")[0].subsequent_mention_ko).toBe("제임스")
  })

  it("recognizes explicit non-substring short names without expanding them as spelling errors", () => {
    const nicknamed = person({
      preferred_ko: "하비에르 에르난데스",
      romanized: "Javier Hernandez",
      short_name_ko: "치차리토",
      hangul_alts: ["치차리토"],
    })
    expect(buildNamingPairs([nicknamed])).toEqual([])
    expect(unknownPersonNames(["치차리토"], [nicknamed])).toEqual([])
    expect(findNotationViolations("치차리토가 말했다.", [nicknamed])).toEqual([])
  })

  it("preserves the existing dictionary contract when all new fields are blank", () => {
    expect(buildNotationHints([person({})])).toEqual([
      { ko: "부카요 사카", kind: "person", en: ["bukayo saka"] },
    ])
    expect(selectNotationHints(buildNotationHints([person({})]), "Bukayo Saka spoke.")).toEqual([
      { ko: "부카요 사카", kind: "person", en: ["bukayo saka"] },
    ])
  })
})
