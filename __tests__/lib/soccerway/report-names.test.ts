import { describe, expect, it } from "vitest"
import { createReportNameEditor, reportLatinRemainders } from "@/lib/soccerway/report-names"

const persons = [
  { romanized: "Martin Ødegaard", preferred_ko: "마르틴 외데고르", surfaces: ["Martin Odegaard"] },
  { romanized: "Bukayo Saka", preferred_ko: "부카요 사카" },
  { romanized: "Kai Havertz", preferred_ko: "카이 하베르츠" },
  { romanized: "Enzo Fernandez", preferred_ko: "엔소 페르난데스" },
  { romanized: "Bruno Fernandez", preferred_ko: "브루노 페르난데스" },
]
describe("report dictionary editing", () => {
  it("uses canonical Korean spelling even when the lineup label is English", () => {
    const editor = createReportNameEditor(persons, [
      { roman: "Martin Odegaard", label: "Martin Odegaard" },
    ])
    expect(editor.resolve("Martin Odegaard")).toBe("마르틴 외데고르")
    expect(editor.edit("Martin Odegaard가 Saka에게 연결했다.", ["Saka"])).toBe(
      "마르틴 외데고르가 부카요 사카에게 연결했다."
    )
  })
  it("corrects English names in event descriptions and final prose", () => {
    const editor = createReportNameEditor(persons, [])
    expect(
      editor.edit("Kai Havertz scored from Bukayo Saka's cross.", ["Havertz", "Saka"])
    ).toContain("카이 하베르츠 scored from 부카요 사카's cross")
    expect(editor.edit("Havertz가 마무리했다.", ["Havertz"])).toBe("카이 하베르츠가 마무리했다.")
  })
  it("uses dictionary aliases and canonical names before a shorter roster label", () => {
    const editor = createReportNameEditor(persons, [
      { roman: "Martin Odegaard", label: "외데고르" },
    ])
    expect(editor.resolve("Odegaard")).toBe("마르틴 외데고르")
  })
  it("keeps an ambiguous surname unresolved and checks feed initials", () => {
    const editor = createReportNameEditor(persons, [])
    expect(editor.resolve("Fernandez")).toBeNull()
    expect(editor.resolve("Fernandez E.")).toBe("엔소 페르난데스")
    expect(editor.resolve("J. Fernandez")).toBeNull()
  })
  it("lets a match roster disambiguate a surname", () => {
    const editor = createReportNameEditor(persons, [
      { roman: "Enzo Fernandez", label: "Enzo Fernandez" },
    ])
    expect(editor.resolve("Fernandez")).toBe("엔소 페르난데스")
  })
  it("allows football abbreviations but flags unresolved names and English prose", () => {
    expect(
      reportLatinRemainders({
        title: "VAR 판정",
        paragraphs: ["xG 1.2, AS로마와 PSG", "Unknown Player가 loose ball을 잡았다."],
      })
    ).toEqual(["Unknown Player", "loose ball"])
  })
  it("allows abbreviations from the actual clubs without allowing unknown player names", () => {
    const report = {
      title: "VfB슈투트가르트 패배",
      paragraphs: ["Unknown Player가 AFC본머스로 이적했다."],
    }
    expect(reportLatinRemainders(report, ["바이에른 뮌헨", "VfB슈투트가르트"])).toEqual([
      "Unknown Player",
      "AFC",
    ])
  })
  it("resolves a full name containing the dictionary's two-token name", () => {
    const editor = createReportNameEditor(
      [{ romanized: "Anguissa Frank", preferred_ko: "앙드레프랑크 잠보 앙귀사" }],
      []
    )
    expect(editor.resolve("Frank Zambo Anguissa")).toBe("앙드레프랑크 잠보 앙귀사")
  })
  it("adjusts Korean particles after dictionary name replacement", () => {
    const editor = createReportNameEditor(
      [
        { romanized: "Troy Parrott", preferred_ko: "트로이 패럿" },
        { romanized: "Bukayo Saka", preferred_ko: "부카요 사카" },
      ],
      []
    )
    expect(editor.edit("Troy Parrott가 Bukayo Saka을 막았다.")).toBe(
      "트로이 패럿이 부카요 사카를 막았다."
    )
  })
})
