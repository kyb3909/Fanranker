import { expect, it } from "vitest"
import { resolveTeamName } from "@/lib/match/team-name-resolution"
const dict = [
  { id: "a", nameKr: "브라이턴", aliases: ["브라이턴 앤 호브"] },
  { id: "b", nameKr: "스타드 렌", aliases: [] },
  { id: "c", nameKr: "스타드 브레스투아29", aliases: [] },
]
it("정확한 이름·별칭·유일한 포함 관계를 공유한다", () => {
  expect(resolveTeamName(dict, "브라이턴")).toBe("a")
  expect(resolveTeamName(dict, "브라이턴 앤 호브")).toBe("a")
  expect(resolveTeamName(dict, "브라이턴&호브 앨비언")).toBe("a")
})
it("공통 토큰으로 다른 팀을 선택하지 않는다", () => {
  expect(resolveTeamName(dict, "스타드 렌")).toBe("b")
  expect(resolveTeamName(dict, "스타드")).toBeNull()
  expect(resolveTeamName(dict, "렌")).toBeNull()
})
it("정확한 이름이나 별칭이 다른 팀과 충돌해도 첫 행을 고르지 않는다", () => {
  expect(
    resolveTeamName([...dict, { id: "d", nameKr: "브라이턴", aliases: [] }], "브라이턴")
  ).toBeNull()
  expect(
    resolveTeamName([...dict, { id: "d", nameKr: "기타", aliases: ["브라이턴"] }], "브라이턴")
  ).toBeNull()
})
