import Link from "@/components/ui/app-link"

/**
 * 경기 허브 탭 — 일정 / 순위 (2026-08-19 운영자: "순위표만 GNB 에 넣기는 좀 그래").
 *
 * 순위표 하나는 GNB 한 칸의 무게가 안 된다. 대신 **일정 + 순위**를 한 허브로 묶으면
 * 무게가 맞고, 마침 `/matches` 는 만들어 놓고 입구가 홈 밴드 링크 하나뿐이라 사실상
 * 죽어 있었다. 이 탭이 둘을 잇는다.
 *
 * 링크는 각자 **자기 URL**을 갖는다 (탭 상태를 쿼리로 숨기지 않는다) — "프리미어리그
 * 순위" 같은 검색 유입이 순위 페이지로 직접 떨어져야 하기 때문이다.
 */
export function MatchHubTabs({ active }: { active: "fixtures" | "standings" }) {
  const items = [
    { key: "fixtures" as const, label: "일정", href: "/matches" },
    { key: "standings" as const, label: "순위", href: "/standings" },
  ]
  return (
    <nav className="wc-underline-tabs" aria-label="경기 정보">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={active === it.key ? "page" : undefined}
          className={`no-underline ${active === it.key ? "on" : ""}`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  )
}
