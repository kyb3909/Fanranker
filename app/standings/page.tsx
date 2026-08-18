import { redirect } from "next/navigation"

/** `/standings` → 기본 리그. 리그마다 자기 URL 을 갖는 것이 이 페이지의 핵심이라 여기서는 넘긴다. */
export default function StandingsIndex() {
  redirect("/standings/epl")
}
