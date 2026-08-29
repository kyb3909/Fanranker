import Link from "next/link"

/**
 * 시안 ① — 담벼락 피드 (고르는 지면)
 *
 * 증명할 것 (UX 판정): **피드는 넓어지지 않는다.**
 * 브런치가 조용해 보이는 이유는 여백이 아니라 화면에 등장하는 요소 종류가 적어서다.
 * 카드당 요소를 줄여(12 → 5) 높이를 유지한 채 정적인 인상을 만든다.
 *
 * 합격 기준: iPhone 세로 1화면(667px)에 카드 5.5개 이상.
 * 이 수치를 못 맞추면 시안 반려.
 *
 * ⚠️ 2차에서 바뀐 것: 맨 위 한 건만 큰 사진으로 세운다(리드).
 *    1차는 전부 같은 높이라 훑을 때 눈이 멈출 곳이 없었다. 리드 하나가
 *    "지면"의 시작점 역할을 하고, 그 아래는 원래대로 조용한 헤어라인 목록이다.
 *    사진은 전부 프로덕션 실물 — 회색 플레이스홀더 금지.
 */

type Item = {
  chip: string
  chipTone: "team" | "news"
  title: string
  who: string
  when: string
  comments: number
  votes: number
  image?: string
  hot?: boolean
}

// 리드 — 하루에 한 건, 큰 사진으로 세운다
const LEAD = {
  chip: "소식",
  title: "맨시티, 크리스털 팰리스 원정 4-1 대승",
  who: "공놀이봇",
  when: "4시간 전",
  comments: 11,
  votes: 31,
  image: "/storage/posts/user_bot_soccer_kr/1787908039273-ab8b8499.webp",
}

const ITEMS: Item[] = [
  {
    chip: "소식",
    chipTone: "news",
    title: "유벤투스 케난 일디즈, 왼발 부상으로 약 3개월 결장 전망",
    who: "공놀이봇",
    when: "15시간 전",
    comments: 3,
    votes: 12,
    image: "/storage/posts/user_bot_soccer_kr/1787929636974-ba472aaa.webp",
  },
  {
    chip: "아스날",
    chipTone: "team",
    title: "존스 발표 언제 뜰까 나만 계속 확인하나",
    who: "인테르",
    when: "2시간 전",
    comments: 3,
    votes: 0,
  },
  {
    chip: "소식",
    chipTone: "news",
    title: "[첼시] 리즈와 카라바오컵 3라운드, 9월 9일 홈에서 개최",
    who: "공놀이봇",
    when: "3시간 전",
    comments: 7,
    votes: 24,
    image: "/storage/posts/user_bot_soccer_kr/1787938634719-cfb05a75.webp",
    hot: true,
  },
  {
    chip: "도르트문트",
    chipTone: "team",
    title: "책 감독 영입 스타일 빠르고 깔끔하네",
    who: "도르트문트",
    when: "3시간 전",
    comments: 3,
    votes: 4,
  },
  {
    chip: "소식",
    chipTone: "news",
    title: "[BBC] 리버풀 전설 밥 페이즐리 옛 자택에 기념 명판 제막",
    who: "공놀이봇",
    when: "5시간 전",
    comments: 5,
    votes: 18,
    image: "/storage/posts/user_bot_soccer_kr/1787917037390-bed534fc.webp",
  },
  {
    chip: "아틀레티코",
    chipTone: "team",
    title: "알바레스 이야기 또 나오네 ㅋㅋ",
    who: "아틀레티코",
    when: "5시간 전",
    comments: 3,
    votes: 0,
  },
  {
    chip: "소식",
    chipTone: "news",
    title: "[풋 메르카토] 토트넘, 에버턴 윙어 은디아예 영입 관심",
    who: "공놀이봇",
    when: "6시간 전",
    comments: 9,
    votes: 6,
    image: "/storage/posts/user_bot_soccer_kr/1787924236510-a550ca4e.webp",
  },
  {
    chip: "바르셀로나",
    chipTone: "team",
    title: "로드리 영입, 진짜 이번 시즌 기대해도 되나",
    who: "바르셀로나",
    when: "6시간 전",
    comments: 3,
    votes: 8,
  },
]

const BOARDS = ["전체", "아스날", "첼시", "맨유", "리버풀", "맨시티", "토트넘", "해외축구"]

// 오른쪽 레일 — 데스크톱에서만. 목록을 늘려서 폭을 채우는 대신,
// 실제 사이트에 이미 있는 가구(오늘의 경기·설문)를 제자리에 놓아 채운다.
const TODAY_MATCHES = [
  { home: "아스날", away: "리즈", when: "23:00" },
  { home: "첼시", away: "브렌트포드", when: "01:30" },
  { home: "유벤투스", away: "인테르", when: "04:45" },
]

export default function EditorialFeedDemo() {
  return (
    <main className="ed-page">
      <div
        style={{
          maxWidth: 904,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 600px) 280px",
          gap: 24,
          alignItems: "start",
        }}
        className="ed-feed-grid"
      >
        <div>
          <header
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--ed-hairline)" }}
          >
            <span className="text-[20px] font-bold" style={{ color: "var(--wc-ink)" }}>
              담벼락
            </span>
            <Link
              href="/design-demo/editorial"
              className="text-[13px] font-medium"
              style={{ color: "var(--wc-mute)" }}
            >
              시안 목록
            </Link>
          </header>

          {/* 보드 전환은 탭바가 아니라 이 칩 행이 맡는다 — 우리에겐 이게 진짜 네비게이션 */}
          <nav
            className="flex gap-1.5 overflow-x-auto px-5 py-3"
            style={{ borderBottom: "1px solid var(--ed-hairline)", scrollbarWidth: "none" }}
          >
            {BOARDS.map((board, index) => (
              <span
                key={board}
                className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium"
                style={
                  index === 0
                    ? { background: "var(--wc-burgundy)", color: "#fff" }
                    : { background: "var(--ed-cream-deep)", color: "var(--wc-mute)" }
                }
              >
                {board}
              </span>
            ))}
          </nav>

          {/* ── 리드 ─────────────────────────────────────────────────────── */}
          <section className="px-5 pt-5 pb-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- 시안 전용. 승격 시 next/image */}
            <img
              src={LEAD.image}
              alt=""
              width={1200}
              height={674}
              className="rounded"
              style={{ width: "100%", height: 232, objectFit: "cover", display: "block" }}
            />
            <span className="ed-kicker" style={{ marginTop: 14 }}>
              TODAY
            </span>
            <p
              className="text-[20px] font-bold"
              style={{ color: "var(--wc-ink)", lineHeight: 1.3, wordBreak: "keep-all" }}
            >
              {LEAD.title}
            </p>
            <p className="mt-2 text-[12px]" style={{ color: "var(--wc-mute)" }}>
              {LEAD.who} · {LEAD.when} · 댓글 <span className="gn-num">{LEAD.comments}</span> ·{" "}
              <span style={{ color: "var(--wc-ink)", fontWeight: 600 }}>
                추천 <span className="gn-num">{LEAD.votes}</span>
              </span>
            </p>
          </section>

          <div className="px-5">
            <div className="ed-rule ed-rule--strong" style={{ margin: "20px 0 0" }} />
          </div>

          {/* ── 목록 ─────────────────────────────────────────────────────── */}
          {/* 카드 박스·그림자·라운드 없음. 사이는 1px hairline 만 —
            리스트가 카드 더미가 아니라 하나의 지면으로 읽힌다. */}
          <ul>
            {ITEMS.map((item, index) => (
              <li
                key={item.title}
                className="flex items-start gap-3 px-5 py-3.5"
                style={{
                  borderTop: index === 0 ? "none" : "1px solid var(--ed-hairline)",
                  // 인기 글은 배경 틴트로만 (한쪽 면 액센트 보더 영구 금지)
                  background: item.hot ? "var(--ed-cream-deep)" : "transparent",
                }}
              >
                <div className="min-w-0 flex-1">
                  {/* 1행 — 칩 하나만 */}
                  <span
                    className="inline-flex items-center rounded px-1.5 text-[12px] font-medium"
                    style={{
                      height: 20,
                      background:
                        item.chipTone === "news" ? "var(--wc-burgundy)" : "var(--ed-hairline)",
                      color: item.chipTone === "news" ? "#fff" : "var(--wc-mute)",
                    }}
                  >
                    {item.chip}
                  </span>

                  {/* 2행 — 카드에서 유일하게 큰 글자 */}
                  <p
                    className="mt-1.5 text-[16px] font-bold"
                    style={{
                      color: "var(--wc-ink)",
                      lineHeight: 1.35,
                      wordBreak: "keep-all",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {item.title}
                  </p>

                  {/* 3행 — 메타 한 줄. 본문 프리뷰·조회수·아바타 없음 */}
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                    {item.who} · {item.when} · 댓글 <span className="gn-num">{item.comments}</span>
                    {/* 추천은 0이면 숨기고, 10 이상이면 굵기·색으로 승격 */}
                    {item.votes > 0 ? (
                      <>
                        {" · "}
                        <span
                          style={
                            item.votes >= 10
                              ? { color: "var(--wc-ink)", fontWeight: 600 }
                              : undefined
                          }
                        >
                          추천 <span className="gn-num">{item.votes}</span>
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>

                {/* 썸네일 72px 고정. 없으면 슬롯 자체를 없앤다 — 플레이스홀더 금지 */}
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 시안 전용
                  <img
                    src={item.image}
                    alt=""
                    width={72}
                    height={72}
                    className="shrink-0 rounded"
                    style={{ width: 72, height: 72, objectFit: "cover" }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {/* ── 오른쪽 레일 (데스크톱 전용) ───────────────────────────────── */}
        <aside className="ed-rail" style={{ position: "sticky", top: 24, paddingTop: 20 }}>
          <section>
            <span className="ed-kicker">TODAY</span>
            <h2 className="ed-h2" style={{ fontSize: 16, marginBottom: 10 }}>
              오늘의 경기
            </h2>
            <ul>
              {TODAY_MATCHES.map((m, index) => (
                <li
                  key={`${m.home}-${m.away}`}
                  className="flex items-center justify-between py-2.5"
                  style={{
                    borderTop: index === 0 ? "none" : "1px solid var(--ed-hairline)",
                  }}
                >
                  <span className="text-[13px] font-semibold" style={{ color: "var(--wc-ink)" }}>
                    {m.home} <span style={{ color: "var(--wc-mute-2)" }}>vs</span> {m.away}
                  </span>
                  <span className="gn-num text-[12px]" style={{ color: "var(--wc-mute)" }}>
                    {m.when}
                  </span>
                </li>
              ))}
            </ul>
            <div
              className="mt-3 rounded-lg px-3 py-2.5 text-center text-[13px] font-semibold text-white"
              style={{ background: "var(--wc-burgundy)" }}
            >
              오늘 경기 예측하기
            </div>
          </section>

          <div className="ed-rule" style={{ margin: "28px 0 18px" }} />

          <section>
            <span className="ed-kicker">POLL</span>
            <h2 className="ed-h2" style={{ fontSize: 16, marginBottom: 10 }}>
              이번 시즌 우승은?
            </h2>
            <ul className="space-y-2">
              {[
                { label: "아스날", pct: 42 },
                { label: "맨시티", pct: 33 },
                { label: "리버풀", pct: 25 },
              ].map((opt) => (
                <li key={opt.label}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span style={{ color: "var(--wc-ink)" }}>{opt.label}</span>
                    <span className="gn-num" style={{ color: "var(--wc-mute)" }}>
                      {opt.pct}%
                    </span>
                  </div>
                  {/* 막대는 배경 틴트 위에 버건디 — 한쪽 면 보더 대신 이런 식으로 색을 쓴다 */}
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full"
                    style={{ background: "var(--ed-cream-deep)" }}
                  >
                    <div
                      style={{
                        width: `${opt.pct}%`,
                        height: "100%",
                        background: "var(--wc-burgundy)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  )
}
