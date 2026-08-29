import Link from "next/link"

/**
 * 에디토리얼 시안 목록 — 개발 환경에서만 열린다 (app/design-demo/layout.tsx).
 *
 * 방향: 색은 지금 것을 그대로 두고, **구조와 읽는 맛만** 브런치식으로 옮긴다.
 * 원본 지면과 나란히 놓고 보라고 만든 것이므로 각 항목에 비교 링크를 붙였다.
 */

const PILOTS = [
  {
    href: "/design-demo/editorial/post",
    ordinal: "01",
    kicker: "READING",
    title: "봇 기사 상세",
    why: "가장 중요한 시안. 타이틀 블록이 첫 화면을 독점하고, 읽기 폭을 880px에서 640px로 좁혔다. 대신 사진은 글줄보다 넓게 빼서 넓은 사진 / 좁은 글 리듬을 만들었다. 글 끝에 재순환 3종(다음 경기·같은 말머리·댓글)을 붙여 소식에서 게임 참여로 넘어가는 통로를 만들었다.",
    compare: "https://gongnori.fan/post/f07dd10e-a436-4a66-acbe-e96d1e943a4e",
  },
  {
    href: "/design-demo/editorial/feed",
    ordinal: "02",
    kicker: "SCANNING",
    title: "담벼락 피드",
    why: "피드는 일부러 넓히지 않았다. 여백이 아니라 요소를 줄여(카드당 12개 → 5개) 조용하게 만든다. 카드 박스를 없애고 1px 선으로만 나눠 목록이 하나의 지면으로 읽히게 했다. 맨 위 한 건만 큰 사진으로 세워(리드) 훑을 때 눈이 멈출 자리를 만들었다.",
    compare: "https://gongnori.fan/",
  },
]

export default function EditorialDemoIndex() {
  return (
    <main className="ed-page">
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "56px 20px 96px" }}>
        <span className="ed-kicker">DESIGN PILOT</span>
        <h1
          style={{
            margin: "0 0 16px",
            fontSize: 31,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.025em",
            color: "var(--wc-ink)",
            textWrap: "balance",
          }}
        >
          에디토리얼 개편 시안
        </h1>
        <div className="ed-prose" style={{ maxWidth: "none" }}>
          <p>
            브랜드 색(잉크·버건디)은 그대로 두고, 지면 바탕만 크림으로 낮췄습니다. 바꾼 것은{" "}
            <strong>구조와 읽는 맛</strong>입니다. 명조는 게시글 본문 한 곳에만 켰고, 제목·카드·
            댓글·버튼은 지금처럼 Pretendard 그대로입니다.
          </p>
        </div>

        <div className="ed-rule ed-rule--strong" style={{ marginTop: 40 }} />

        <ul className="space-y-10">
          {PILOTS.map((pilot) => (
            <li key={pilot.href}>
              {/* 서수는 제목 왼쪽이 아니라 위 — 왼쪽에 세우면 그게 좌측 액센트가 된다 */}
              <span className="ed-ordinal">{pilot.ordinal}</span>
              <span className="ed-kicker">{pilot.kicker}</span>
              <h2 className="ed-h2">
                <Link href={pilot.href} style={{ color: "var(--wc-burgundy)" }}>
                  {pilot.title} →
                </Link>
              </h2>
              <p
                className="text-[14px]"
                style={{ color: "var(--wc-mute)", lineHeight: 1.7, wordBreak: "keep-all" }}
              >
                {pilot.why}
              </p>
              <a
                href={pilot.compare}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[13px] font-medium"
                style={{ color: "var(--wc-mute-2)" }}
              >
                지금 지면과 비교 ↗
              </a>
            </li>
          ))}
        </ul>

        <div className="ed-rule" style={{ marginTop: 48 }} />
        <p className="text-[13px]" style={{ color: "var(--wc-mute-2)", lineHeight: 1.7 }}>
          매치센터(읽는 지면과 고르는 지면이 한 화면에 공존하는 유일한 페이지)는 위 둘이 통과한 뒤에
          만듭니다.
        </p>
      </div>
    </main>
  )
}
