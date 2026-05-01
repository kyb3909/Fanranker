import { redirect } from "next/navigation"

// /community 인덱스는 의도된 페이지가 아니지만, 사용자가 우연히 도달했을 때
// 404 대신 /explore (둘러보기)로 보낸다. 안전망 역할.
export default function CommunityIndex() {
  redirect("/explore")
}
