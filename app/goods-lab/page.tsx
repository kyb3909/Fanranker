import type { Metadata } from "next"
import { FanClient } from "./fan-client"

/**
 * 팬 굿즈 공동제작 — 파트너 제안용 시연 화면 (2026-09-05).
 *
 * ⚠️ GNB·모바일탭에 링크를 넣지 않는다. 링크를 아는 사람만 들어오는 숨김 지면이다
 *    (`/snack`·`/transfer`·`/nba` 와 같은 저장소 관례 — 라우트는 살아있고 링크만 없다).
 *    은닉은 접근 통제가 아니다. 완전 차단이 필요해지면 `requireStaff()`(lib/admin/roles.ts)를
 *    여기 얹으면 되지만, 상대가 미팅 뒤 혼자 다시 열어볼 수 있어야 해서 지금은 열어둔다.
 *
 * 데이터는 전부 `fixtures.ts` 의 정적 값이다 — DB·API 를 건드리지 않는다.
 * 따라서 프로덕션 지표를 오염시키지 않고, 롤백은 이 디렉토리 삭제 하나다.
 *
 * ⚠️ 이 지면은 **팬 화면**이다. 세 구역뿐이다 — 벽 · 갖고 싶어요 · 진행 중.
 *    시나리오 토글 · 수요 보드 · 승인 카드 · MOQ · 배분표는 `/goods-lab/partner` 에 있다.
 *    청중이 다르다. 섞으면 둘 다 흐려진다.
 */
export const metadata: Metadata = {
  title: "팬 굿즈 공동제작 (시연)",
  description: "팬이 원하는 굿즈를 만들기 전에 확인하는 수요 검증 화면 — 시연용",
  robots: { index: false, follow: false },
}

export default async function GoodsLabPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[] }>
}) {
  const { tag } = await searchParams
  return <FanClient tag={typeof tag === "string" ? tag : "전체"} />
}
