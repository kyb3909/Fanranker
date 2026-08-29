import Link from "next/link"
import { ChevronLeft, MessageSquare, Share2, ThumbsUp } from "lucide-react"

/**
 * 시안 ② — 봇 기사 상세 (읽는 지면)
 *
 * 증명할 것 (UX 판정): 타이틀 블록 독점 · 640px 읽기 폭 · 글 끝 재순환 3종.
 * "언론사에 보여줄 지표가 사실상 이 페이지에서 나온다."
 *
 * 실제 프로덕션 기사 하나를 그대로 옮겨 조판만 바꿨다. 비교 대상:
 * https://gongnori.fan/post/f07dd10e-a436-4a66-acbe-e96d1e943a4e
 *
 * ⚠️ 사진은 전부 프로덕션 실물이다(`/storage/*` 는 next.config 리라이트라 로컬에서도 뜬다).
 *    1차 시안이 회색 네모를 깔았다가 반려됐다 — 시안에 플레이스홀더를 쓰지 말 것.
 */

// 실제 기사에 붙어 있는 사진 (posts.image)
const HERO = "/storage/posts/user_bot_soccer_kr/1787929636974-ba472aaa.webp"

const BODY = [
  "유벤투스와 일디즈는 주초 수술을 진행하기로 했으며, 구단은 11라운드 뒤 예정된 11월 A매치 휴식기 이후 그의 복귀를 목표로 하고 있습니다.",
  "일디즈는 파르마, 밀란, 사수올로, 아탈란타, 칼리아리, 라치오, 피오렌티나전을 포함해 유로파리그 리그 페이즈 초반 4경기 이상을 놓칠 것으로 전해집니다.",
]

const RELATED = [
  {
    title: "[풋 메르카토] 우나히, 아약스 등 네덜란드 구단과 협상 허가",
    meta: "2시간 전 · 댓글 6",
    image: "/storage/posts/user_bot_soccer_kr/1787938646798-99e28b9e.webp",
  },
  {
    title: "[Nogomania] 츠르베나 즈베즈다, 마켈리 주심 판정 UEFA에 공식 제소",
    meta: "5시간 전 · 댓글 8",
    image: "/storage/posts/user_bot_soccer_kr/1787918839213-6c6825db.webp",
  },
  {
    title: "[Trabzonspor] 파티흐 테케 감독 사임 반려…아메드스포르전 지휘",
    meta: "어제 · 댓글 22",
    image: "/storage/posts/user_bot_soccer_kr/1787917045004-3638d79f.webp",
  },
]

const COMMENTS = [
  { who: "북런던워홀릭", when: "12시간 전", text: "3개월이면 겨울 이적시장까지 영향 있겠네요." },
  { who: "세리에덕후", when: "9시간 전", text: "하필 인테르전 앞두고… 라인 어떻게 짜려나" },
]

export default function EditorialPostDemo() {
  return (
    <main className="ed-page">
      <article style={{ maxWidth: 640, margin: "0 auto", padding: "0 20px 96px" }}>
        {/* 사이트 헤더가 이미 sticky 다 — 시안이 또 고정 바를 얹으면 두 개가 겹친다.
            읽는 지면의 크롬 축소는 "되돌아가기 한 줄"로 충분하다. */}
        <div style={{ paddingTop: 24 }}>
          <Link
            href="/design-demo/editorial"
            className="inline-flex items-center gap-1 text-[13px] font-medium"
            style={{ color: "var(--wc-mute)" }}
          >
            <ChevronLeft size={16} /> 시안 목록
          </Link>
        </div>

        {/* 타이틀 블록이 첫 화면을 독점한다 — 제목만 크고 메타는 아래에 얌전히 */}
        <header style={{ padding: "36px 0 0" }}>
          <span className="ed-kicker">JUVENTUS · 소식</span>
          <h1
            style={{
              margin: "6px 0 0",
              fontSize: 31,
              fontWeight: 700,
              lineHeight: 1.32,
              letterSpacing: "-0.025em",
              color: "var(--wc-ink)",
              textWrap: "balance",
              wordBreak: "keep-all",
            }}
          >
            유벤투스 케난 일디즈, 왼발 부상으로 약 3개월 결장 전망
          </h1>
          <p
            className="text-[13px]"
            style={{ margin: "18px 0 0", color: "var(--wc-mute)", fontWeight: 500 }}
          >
            공놀이봇 · 15시간 전 · 출처 sport.sky.it
          </p>
        </header>

        {/* 히어로 — 글줄보다 넓게. 데스크톱에서 지면이 비어 보이던 문제를 이게 푼다 */}
        <figure className="ed-figure ed-bleed" style={{ margin: "32px 0 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 시안 전용. 승격 시 next/image 로 교체 */}
          <img src={HERO} alt="케난 일디즈" width={1200} height={751} />
          <figcaption className="ed-caption">
            <b>FIG 1</b>
            <span>일디즈는 프로시노네전에서 왼발을 다쳤다. 사진 sport.sky.it</span>
          </figcaption>
        </figure>

        {/* 본문 — 이 페이지에서 명조가 쓰이는 유일한 자리 */}
        <div className="ed-prose" style={{ marginTop: 40 }}>
          <p className="ed-lead">
            스카이 스포츠 보도에 따르면, 케난 일디즈는 프로시노네전에서 입은 왼발 부상으로 약 2개월
            반에서 3개월간 결장할 전망입니다.
          </p>
          {BODY.map((line) => (
            <p key={line.slice(0, 12)}>{line}</p>
          ))}
          <blockquote>
            <p>
              구단은 11월 A매치 휴식기 이후 복귀를 목표로 하고 있으나, 수술 경과에 따라 일정은
              달라질 수 있습니다.
            </p>
          </blockquote>
        </div>

        {/* 액션은 본문이 끝난 자리에 얇게 — 카드에서 뺀 것을 여기서 회수한다 */}
        <div
          className="mt-10 flex items-center gap-2 pt-5"
          style={{ borderTop: "1px solid var(--ed-hairline)" }}
        >
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white"
            style={{ background: "var(--wc-burgundy)" }}
          >
            <ThumbsUp size={15} /> 추천 <span className="gn-num">12</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"
            style={{ background: "var(--ed-cream-deep)", color: "var(--wc-ink)" }}
          >
            <MessageSquare size={15} /> 댓글 <span className="gn-num">3</span>
          </button>
          <button
            type="button"
            className="ml-auto flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"
            style={{ background: "var(--ed-cream-deep)", color: "var(--wc-mute)" }}
          >
            <Share2 size={15} /> 공유
          </button>
        </div>

        {/* ── 글 끝 재순환 — 이번 개편의 최대 레버 ─────────────────────── */}

        {/* ① 다음 경기로 (소식 → 게임 참여를 잇는 유일한 물리적 통로) */}
        <section className="mt-14">
          <div className="ed-rule ed-rule--strong" style={{ marginBottom: 20 }} />
          <span className="ed-kicker">NEXT MATCH</span>
          <h2 className="ed-h2">이 팀의 다음 경기, 예측해 보시겠어요?</h2>
          <div
            className="flex items-center justify-between rounded-xl p-4"
            style={{ background: "var(--ed-cream-deep)" }}
          >
            <div>
              <p className="text-[16px] font-bold" style={{ color: "var(--wc-ink)" }}>
                유벤투스 <span style={{ color: "var(--wc-mute)" }}>vs</span> 인테르
              </p>
              <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                9월 14일 (일) 04:45 · 세리에 A
              </p>
            </div>
            <span
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--wc-burgundy)" }}
            >
              예측하기
            </span>
          </div>
        </section>

        {/* ② 같은 말머리의 최근 글 — 여기도 실물 썸네일 */}
        <section className="mt-12">
          <div className="ed-rule" style={{ marginBottom: 20 }} />
          <span className="ed-kicker">MORE FROM</span>
          <h2 className="ed-h2">유럽 축구 소식 더 보기</h2>
          <ul>
            {RELATED.map((item, index) => (
              <li
                key={item.title}
                className="flex items-start gap-3 py-3.5"
                style={{ borderTop: index === 0 ? "none" : "1px solid var(--ed-hairline)" }}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[16px] font-bold"
                    style={{ color: "var(--wc-ink)", lineHeight: 1.35, wordBreak: "keep-all" }}
                  >
                    {item.title}
                  </p>
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                    {item.meta}
                  </p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- 시안 전용 */}
                <img
                  src={item.image}
                  alt=""
                  width={64}
                  height={64}
                  className="shrink-0 rounded"
                  style={{ width: 64, height: 64, objectFit: "cover" }}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* ③ 댓글 — 접지 않고 열어 둔다 (액션 경로 회수) */}
        <section className="mt-12">
          <div className="ed-rule" style={{ marginBottom: 20 }} />
          <span className="ed-kicker">COMMENTS</span>
          <h2 className="ed-h2">
            댓글 <span className="gn-num">3</span>
          </h2>
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--ed-cream-deep)", color: "var(--wc-mute)" }}
          >
            <p className="text-[14px]">댓글을 입력하세요…</p>
          </div>
          {/* 댓글은 명조를 쓰지 않는다 — 밀도가 곧 대화감이다 */}
          <ul className="mt-6 space-y-5">
            {COMMENTS.map((c) => (
              <li key={c.who}>
                <p className="text-[13px] font-bold" style={{ color: "var(--wc-ink)" }}>
                  {c.who}{" "}
                  <span className="ml-1 font-medium" style={{ color: "var(--wc-mute-2)" }}>
                    {c.when}
                  </span>
                </p>
                <p
                  className="mt-1 text-[14px]"
                  style={{ color: "var(--wc-ink)", lineHeight: 1.55, wordBreak: "keep-all" }}
                >
                  {c.text}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  )
}
