"use client"

import { useState } from "react"

/**
 * 갈드컵 댓글 공방 시각화 — 로컬 데모 (workspace/galdcup-ui-final.md §2 스펙, 정돈판).
 * 실서비스 코드와 완전 분리된 목업 — 데이터 전부 하드코딩, 어떤 API도 부르지 않음.
 *
 * 정돈 원칙 (2026-08-04 "너무 정신없지 않아?" 피드백):
 * - 색(틴트)은 공방 체인 안에서만 — 일반 댓글은 흰 배경 + 하단 구분선.
 * - 칩은 스탠스 하나만 기본. 반박 칩은 체인 안에서만, 지원 칩·→@닉은 삭제.
 * - 강조가 희소해야 강조다.
 */

const C = {
  goBg: "#FBF0F3",
  goText: "#961E37",
  goBar: "#9F2242",
  stayBg: "#F1F4F9",
  stayText: "#1E3A5F",
  stayBar: "#2B4C7E",
  grayBg: "#F4F4F5",
  grayText: "#71717A",
} as const

type Stance = "go" | "stay" | null
type DemoState = "cold" | "normal" | "hot"

interface DemoComment {
  id: number
  nick: string
  title?: string
  stance: Stance
  body: string
  time: string
  up: number
  replies?: DemoComment[]
  /** 부모와 스탠스가 다른 답글에만 "반박" 칩 (데모라 하드코딩) */
  rebuts?: boolean
}

/* ---------- 목데이터 ---------- */

const CHAIN: DemoComment = {
  id: 100,
  nick: "구너4년차",
  title: "구너",
  stance: "go",
  body: "레알이 바이아웃 그대로 지른다는 말 계속 나오는데 이건 막을 방법이 없음. 페레스가 음바페 때처럼 3년 공들였다는 거 보면 이미 결론 난 딜이라고 봄.",
  time: "14분 전",
  up: 12,
  replies: [
    {
      id: 101,
      nick: "에티하드북문",
      stance: "stay",
      body: "바이아웃이 있다는 것 자체가 루머임. 시티가 그런 조항을 넣었을 리가 없고, 실제로 로마노도 클라우스 없다고 두 번 정정했음.",
      time: "11분 전",
      up: 9,
      rebuts: true,
    },
    {
      id: 102,
      nick: "구너4년차",
      title: "구너",
      stance: "go",
      body: "로마노가 정정한 건 금액이지 존재 자체가 아님. 원문 다시 읽어봐라. 'not that figure'라고 했지 'no clause'라고 한 적 없음.",
      time: "9분 전",
      up: 15,
      rebuts: true,
    },
    {
      id: 103,
      nick: "하이버리유령",
      stance: "go",
      body: "이게 맞음. 심지어 아버지 쪽 인터뷰에서도 '특정 조건'이라는 표현을 썼는데 그게 클라우스 말고 뭐겠냐.",
      time: "7분 전",
      up: 4,
    },
    {
      id: 104,
      nick: "에티하드북문",
      stance: "stay",
      body: "아버지 인터뷰는 재계약 협상용 압박 카드로 보는 게 상식적임. 조건이 있으면 액수가 벌써 유출됐지. 3년째 액수가 제각각인 게 그 증거고.",
      time: "3분 전",
      up: 7,
      rebuts: true,
    },
  ],
}

const SOLO: DemoComment[] = [
  {
    id: 1,
    nick: "시즌권9년",
    stance: "stay",
    body: "펩이 나가는 순간까지는 절대 안 나간다. 본인 입으로 말한 게 벌써 세 번임.",
    time: "32분 전",
    up: 21,
  },
  {
    id: 2,
    nick: "베르나베우남문",
    stance: "go",
    body: "레알은 원하는 선수 결국 다 데려왔음. 시간 문제일 뿐.",
    time: "41분 전",
    up: 17,
  },
  {
    id: 3,
    nick: "중립기어",
    stance: null,
    body: "이적료 규모 생각하면 올여름은 힘들고 내년 여름이 현실적이지 않나.",
    time: "1시간 전",
    up: 6,
  },
  {
    id: 4,
    nick: "노스뱅크",
    title: "앙리",
    stance: "go",
    body: "구단 매출 구조상 한 번은 터뜨려야 하는 딜이고, 그 타이밍이 지금임.",
    time: "2시간 전",
    up: 9,
  },
]

const COLD_COMMENTS: DemoComment[] = [
  {
    id: 11,
    nick: "베르나베우남문",
    stance: "go",
    body: "레알은 원하는 선수 결국 다 데려왔음. 시간 문제일 뿐.",
    time: "1시간 전",
    up: 3,
  },
  {
    id: 12,
    nick: "중립기어",
    stance: null,
    body: "이적료 규모 생각하면 올여름은 힘들지 않나.",
    time: "2시간 전",
    up: 1,
  },
]

/* ---------- 소형 컴포넌트 ---------- */

/** 댓글 한 개 — 진영 표시·판정 칩 전부 없음(운영자 피드백: 심플하게). 평범한 댓글. */
function CommentCard({ c, depth = 0 }: { c: DemoComment; depth?: number }) {
  return (
    <div className="py-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[12px] font-semibold text-zinc-800">{c.nick}</span>
        {c.title && (
          <span
            className="shrink-0 rounded px-1 py-0.5 text-[10px] font-bold"
            style={{ background: "#FEF3C7", color: "#92400E" }}
          >
            {c.title}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11px]" style={{ color: C.grayText }}>
          {c.time}
        </span>
      </div>
      <p className="mt-1.5 text-[14px] leading-[1.55] text-zinc-800">{c.body}</p>
      <div className="mt-1.5 flex h-7 items-center gap-3 text-[12px]" style={{ color: C.grayText }}>
        <button className="flex items-center gap-1">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          공감 {c.up}
        </button>
        <button className="flex items-center">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
        {depth < 2 && <button>답글</button>}
      </div>
    </div>
  )
}

/* ---------- 페이지 ---------- */

export default function GaldcupDemoPage() {
  const [demo, setDemo] = useState<DemoState>("hot")

  const commentCount = demo === "cold" ? 2 : demo === "normal" ? 12 : 60
  const comments: DemoComment[] =
    demo === "cold"
      ? COLD_COMMENTS
      : demo === "normal"
        ? [SOLO[0], CHAIN, SOLO[2]]
        : [CHAIN, ...SOLO]

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[420px] px-4 pb-10">
        {/* [0] 데모 상태 토글 — 실제 페이지엔 없음 */}
        <div
          className="sticky top-0 z-10 -mx-4 mb-5 flex h-10 items-center gap-1 px-4"
          style={{ background: C.grayBg }}
        >
          {(
            [
              ["cold", "콜드스타트(댓글 2)"],
              ["normal", "보통(댓글 12)"],
              ["hot", "격전(댓글 60)"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setDemo(k)}
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={
                demo === k ? { background: "#FFFFFF", color: "#18181B" } : { color: C.grayText }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* [1] 사가 헤더 */}
        <h1 className="line-clamp-2 text-[18px] leading-snug font-bold text-zinc-900">
          홀란드, 레알 이적설
        </h1>
        <div className="mt-2 flex gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: C.grayBg, color: C.grayText }}
          >
            이적설
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: C.grayBg, color: C.grayText }}
          >
            D-28
          </span>
        </div>

        {/* [2] 여론 게이지 */}
        <div className="mt-6">
          <div className="flex justify-between text-[12px] font-bold">
            <span style={{ color: C.goText }}>나간다 62%</span>
            <span style={{ color: C.stayText }}>남는다 38%</span>
          </div>
          <div className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            <div style={{ width: "62%", background: C.goBar }} />
            <div style={{ flex: 1, background: C.stayBar }} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[11px]" style={{ color: C.grayText }}>
              2,481명 참여
            </p>
            <div className="flex gap-1.5">
              <button
                className="rounded-full px-3 py-1 text-[12px] font-bold"
                style={{ background: C.goBg, color: C.goText }}
              >
                나간다
              </button>
              <button
                className="rounded-full px-3 py-1 text-[12px] font-bold"
                style={{ background: C.stayBg, color: C.stayText }}
              >
                남는다
              </button>
            </div>
          </div>
        </div>

        {/* [4] 정렬 + 댓글 수 */}
        <div className="mt-7 flex h-11 items-center justify-between border-b border-zinc-100">
          <div className="flex gap-1">
            <button
              className="rounded-full px-3 py-1.5 text-[12px] font-bold"
              style={{ background: C.grayBg, color: "#18181B" }}
            >
              최신순
            </button>
            <button className="px-2 py-1.5 text-[12px]" style={{ color: C.grayText }}>
              공감순
            </button>
          </div>
          <span className="text-[12px]" style={{ color: C.grayText }}>
            댓글 {commentCount}
          </span>
        </div>

        {/* [5] 댓글 폼 — 진영 선택 없음. 투표한 유저의 댓글에만 칩이 자동으로 붙는다 */}
        <div className="mt-4">
          <textarea
            placeholder="의견을 남겨보세요"
            className="mt-2 h-16 w-full resize-none rounded-xl border border-zinc-200 p-3 text-[14px] outline-none focus:border-zinc-400"
          />
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: C.grayText }}>
            의견 대립은 환영합니다. 특정인·구단 관계자에 대한 명예훼손, 허위사실, 욕설·신상 노출은
            삭제 및 이용 제한 대상입니다.
          </p>
        </div>

        {/* [6] 댓글 리스트 — 전부 평범한 플랫 + 답글 들여쓰기. 장치 없음 */}
        <div className="mt-3">
          {comments.map((c) => (
            <div key={c.id} className="border-b border-zinc-100">
              <CommentCard c={c} />
              {c.replies && c.replies.length > 0 && (
                <div className="mb-2 space-y-0 border-t border-zinc-50 pl-4">
                  {c.replies.map((r) => (
                    <CommentCard key={r.id} c={r} depth={1} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {demo === "hot" && (
            <p className="pt-4 text-center text-[12px]" style={{ color: C.grayText }}>
              댓글 55개 더 보기
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
