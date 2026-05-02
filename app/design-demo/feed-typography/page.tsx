/* eslint-disable @next/next/no-page-custom-font */
import { ThumbsUp, MessageCircle, Bookmark, Share2 } from "lucide-react"

const POSTS = [
  {
    category: "EPL · 분석",
    title: "손흥민 EPL 5호골 분석 — 빌드업 패스 정확도가 경기를 갈랐다",
    body: "전반 23분 손흥민의 결승골 직전, 토트넘은 좌측에서 18연속 원터치 패스를 성공시켰다. 이는 시즌 최다 기록이며, 포스테코글루 부임 이후 처음으로 점유율 60% 이상을 기록한 경기였다.",
    author: "분석러김",
    time: "4시간 전",
    titleBadge: "전설의 분석러",
    flair: null,
    votes: 142,
    comments: 38,
    boardName: "축구",
  },
  {
    category: "이적시장",
    title: "[속보] 아스널, 1월 이적시장 미드필더 영입 검토",
    body: "디 아틀레틱 보도에 따르면 아스널이 겨울 이적시장에서 새로운 6번 영입을 적극 검토 중. 1순위 타겟은 마르틴 수비멘디.",
    author: "북런던워홀릭",
    time: "32분 전",
    titleBadge: null,
    flair: "구너",
    votes: 89,
    comments: 24,
    boardName: "아스날",
  },
  {
    category: "KBO",
    title: "LG 양석환, FA 잔류로 가닥 — 4년 78억 추정",
    body: "LG 트윈스 내야의 핵심 양석환이 4년 78억 규모로 원소속팀 잔류에 합의한 것으로 알려졌다. 정식 발표는 다음 주 초 예정.",
    author: "트윈스공기놀이",
    time: "7시간 전",
    titleBadge: null,
    flair: null,
    votes: 56,
    comments: 18,
    boardName: "LG트윈스",
  },
] as const

type Post = (typeof POSTS)[number]

export default function FeedTypographyDemo() {
  return (
    <>
      {/* Pretendard Variable */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
      />
      {/* SUIT Variable */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/sun-typeface/SUIT/fonts/variable/woff2/SUIT-Variable.css"
      />
      {/* Noto Serif KR */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700&display=swap"
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .ft-pret { font-family: "Pretendard Variable", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif; letter-spacing: -0.01em; }
            .ft-suit { font-family: "SUIT Variable", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif; }
            .ft-serif { font-family: "Noto Serif KR", "Nanum Myeongjo", serif; }
          `,
        }}
      />

      <main className="mx-auto max-w-[860px] space-y-14 px-4 py-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold tracking-widest text-rose-700 uppercase">
            Design Lab
          </p>
          <h1 className="text-3xl font-bold tracking-tight">피드 카드 타이포그래피 비교</h1>
          <p className="text-muted-foreground text-sm">
            같은 게시물 데이터를 4가지 다른 타이포그래피 스타일로 렌더링. 가장 마음에 드는 톤이
            무엇인지 확인.
          </p>
        </header>

        <Variant
          tag="A"
          label="현재 (Baseline)"
          description="시스템 폰트 (Windows = 맑은 고딕) · 제목 font-medium · 위계 약함 — 흔한 카페 톤."
          highlight={["시스템 폰트", "제목 medium 500", "본문 lh 1.6 / 80%", "전체 카드 + shadow"]}
        >
          <div className="space-y-3">
            {POSTS.map((p, i) => (
              <BaselineCard key={i} post={p} />
            ))}
          </div>
        </Variant>

        <Variant
          tag="B"
          label="Pretendard 단일 + 위계 정리"
          description="Pretendard Variable로 한글 톤 통일 + 제목 weight↑, 본문 dim↑, 닉네임 강화."
          highlight={[
            "Pretendard Variable",
            "제목 17px / bold / tracking-tight",
            "본문 14px / lh 1.65 / #4a4a4a",
            "닉네임 13px / semibold",
          ]}
        >
          <div className="space-y-3">
            {POSTS.map((p, i) => (
              <PretendardCard key={i} post={p} />
            ))}
          </div>
        </Variant>

        <Variant
          tag="C"
          label="SUIT × Pretendard 듀얼 + 카테고리 라벨"
          description="에디토리얼 듀얼 시스템. SUIT 700 제목 + Pretendard 본문 + 버건디 카테고리 라벨 + 헤어라인."
          highlight={[
            "제목 SUIT 700 / -0.01em",
            "본문 Pretendard / lh 1.65",
            "카테고리 11px / 600 / letter-spacing 0.06em / Burgundy",
            "border-bottom 헤어라인 only",
          ]}
        >
          <div className="border-border divide-border divide-y border-y bg-white">
            {POSTS.map((p, i) => (
              <DualCard key={i} post={p} />
            ))}
          </div>
        </Variant>

        <Variant
          tag="D"
          label="Serif 제목 (Noto Serif KR) — 매거진 톤"
          description="명조체 제목 + Pretendard 본문. NYT / Vox / Pitchfork 같은 에디토리얼 카드. 클래식한 무게감."
          highlight={[
            "제목 18px / Noto Serif KR 600 / lh 1.4",
            "본문 14.5px / Pretendard / lh 1.7 / #404040",
            "카테고리 11px / SUIT 600 / 0.08em / 올캡 / Burgundy",
            "닉네임 italic",
          ]}
        >
          <div className="border-border divide-border divide-y border-y bg-white">
            {POSTS.map((p, i) => (
              <SerifCard key={i} post={p} />
            ))}
          </div>
        </Variant>

        <footer className="border-t pt-6">
          <p className="text-muted-foreground text-xs">
            결정 후 알려주면 그 방향으로 layout.tsx + globals.css + post-card 컴포넌트에 적용.
          </p>
        </footer>
      </main>
    </>
  )
}

function Variant({
  tag,
  label,
  description,
  highlight,
  children,
}: {
  tag: string
  label: string
  description: string
  highlight: string[]
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-4">
        <span className="bg-primary text-primary-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold">
          {tag}
        </span>
        <div className="flex-1 space-y-1">
          <h2 className="text-lg font-bold">{label}</h2>
          <p className="text-muted-foreground text-xs">{description}</p>
          <ul className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {highlight.map((h) => (
              <li key={h} className="bg-muted rounded px-1.5 py-0.5">
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div>{children}</div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────
   Variant A — Baseline (현재)
   ───────────────────────────────────────────────────────── */
function BaselineCard({ post }: { post: Post }) {
  return (
    <article className="border-border bg-card hover:bg-muted/30 overflow-hidden rounded-lg border p-4 shadow-sm sm:p-5">
      <header className="mb-3 flex items-center gap-3">
        <Avatar />
        <div>
          <p className="text-foreground text-[13px] font-medium">{post.author}</p>
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            {post.titleBadge && (
              <>
                <span className="rounded bg-emerald-500/10 px-1.5 py-px text-[10px] font-semibold text-emerald-700">
                  {post.titleBadge}
                </span>
                <span>·</span>
              </>
            )}
            {post.flair && (
              <>
                <span className="rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                  {post.flair}
                </span>
                <span>·</span>
              </>
            )}
            <span>{post.time}</span>
          </div>
        </div>
      </header>

      <h3 className="text-foreground line-clamp-2 text-[15px] leading-[1.4] font-medium sm:text-[16px]">
        {post.title}
      </h3>
      <p className="text-foreground/80 mt-2 line-clamp-2 text-[14px] leading-[1.6]">{post.body}</p>

      <footer className="border-border text-muted-foreground mt-3 flex items-center gap-4 border-t pt-3 text-[12px]">
        <Vote count={post.votes} />
        <Stat icon={<MessageCircle className="h-3.5 w-3.5" />} value={post.comments} />
        <span className="bg-muted ml-auto rounded px-2 py-0.5 text-[10px] font-medium">
          {post.boardName}
        </span>
      </footer>
    </article>
  )
}

/* ─────────────────────────────────────────────────────────
   Variant B — Pretendard 단일 + 위계 정리
   ───────────────────────────────────────────────────────── */
function PretendardCard({ post }: { post: Post }) {
  return (
    <article className="ft-pret bg-card overflow-hidden rounded-lg border border-neutral-200 p-4 shadow-sm sm:p-5">
      <header className="mb-3 flex items-center gap-3">
        <Avatar />
        <div>
          <p className="text-[13px] font-semibold text-neutral-900">{post.author}</p>
          <div className="flex items-center gap-1.5 text-[12px] text-neutral-500">
            {post.titleBadge && (
              <>
                <span className="rounded bg-emerald-500/10 px-1.5 py-px text-[10px] font-semibold text-emerald-700">
                  {post.titleBadge}
                </span>
                <span>·</span>
              </>
            )}
            {post.flair && (
              <>
                <span className="rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                  {post.flair}
                </span>
                <span>·</span>
              </>
            )}
            <span>{post.time}</span>
          </div>
        </div>
      </header>

      <h3 className="line-clamp-2 text-[17px] leading-[1.35] font-bold tracking-tight text-neutral-900">
        {post.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-[14px] leading-[1.65] text-neutral-600">{post.body}</p>

      <footer className="mt-3 flex items-center gap-4 border-t border-neutral-200 pt-3 text-[12px] text-neutral-500">
        <Vote count={post.votes} />
        <Stat icon={<MessageCircle className="h-3.5 w-3.5" />} value={post.comments} />
        <span className="ml-auto rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-medium">
          {post.boardName}
        </span>
      </footer>
    </article>
  )
}

/* ─────────────────────────────────────────────────────────
   Variant C — SUIT × Pretendard 듀얼 + 카테고리 라벨
   ───────────────────────────────────────────────────────── */
function DualCard({ post }: { post: Post }) {
  return (
    <article className="ft-pret bg-white p-5 transition-colors hover:bg-neutral-50/60">
      <p
        className="ft-suit mb-1.5 text-[11px] font-semibold text-rose-800"
        style={{ letterSpacing: "0.06em" }}
      >
        {post.category}
      </p>

      <h3
        className="ft-suit line-clamp-2 text-[17px] leading-[1.35] font-bold text-neutral-900"
        style={{ letterSpacing: "-0.01em" }}
      >
        {post.title}
      </h3>

      <p className="mt-2 line-clamp-2 text-[14px] leading-[1.65] text-neutral-600">{post.body}</p>

      <div className="mt-3.5 flex items-center gap-3 text-[12px] text-neutral-500">
        <Avatar size={20} />
        <span className="font-semibold text-neutral-900">{post.author}</span>
        {post.titleBadge && (
          <>
            <Hairline />
            <span className="text-emerald-700">{post.titleBadge}</span>
          </>
        )}
        {post.flair && (
          <>
            <Hairline />
            <span className="text-amber-600">{post.flair}</span>
          </>
        )}
        <Hairline />
        <span className="text-neutral-400">{post.time}</span>
        <span className="ml-auto flex items-center gap-3 text-neutral-400">
          <Stat icon={<ThumbsUp className="h-3.5 w-3.5" />} value={post.votes} />
          <Stat icon={<MessageCircle className="h-3.5 w-3.5" />} value={post.comments} />
        </span>
      </div>
    </article>
  )
}

/* ─────────────────────────────────────────────────────────
   Variant D — Serif 매거진 톤
   ───────────────────────────────────────────────────────── */
function SerifCard({ post }: { post: Post }) {
  return (
    <article className="ft-pret bg-white p-6 transition-colors hover:bg-neutral-50/60">
      <p className="ft-suit mb-2 text-[10px] font-semibold tracking-[0.12em] text-rose-800 uppercase">
        {post.category}
      </p>

      <h3 className="ft-serif line-clamp-2 text-[19px] leading-[1.4] font-semibold text-neutral-900">
        {post.title}
      </h3>

      <p className="mt-2.5 line-clamp-3 text-[14.5px] leading-[1.7] text-neutral-700">
        {post.body}
      </p>

      <div className="mt-4 flex items-center gap-3 text-[12px] text-neutral-500">
        <Avatar size={22} />
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold text-neutral-900 italic">{post.author}</span>
          {(post.titleBadge || post.flair) && (
            <span className="text-[11px] text-neutral-400">· {post.titleBadge || post.flair}</span>
          )}
        </div>
        <span className="text-neutral-400">· {post.time}</span>
        <span className="ml-auto flex items-center gap-4 text-neutral-400">
          <Stat icon={<ThumbsUp className="h-3.5 w-3.5" />} value={post.votes} />
          <Stat icon={<MessageCircle className="h-3.5 w-3.5" />} value={post.comments} />
          <Bookmark className="h-3.5 w-3.5" />
          <Share2 className="h-3.5 w-3.5" />
        </span>
      </div>
    </article>
  )
}

/* ─── 공용 helper ─── */

function Avatar({ size = 36 }: { size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-400"
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}

function Vote({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <ThumbsUp className="h-3.5 w-3.5" />
      <span className="tabular-nums">{count}</span>
    </span>
  )
}

function Stat({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      <span className="tabular-nums">{value}</span>
    </span>
  )
}

function Hairline() {
  return <span className="text-neutral-300">·</span>
}
