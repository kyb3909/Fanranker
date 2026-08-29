/**
 * 시안 — 목록 한 줄을 어떻게 그릴까 (담벼락 · 사가 목록 · 이적설 사가 · 시즌 문서)
 *
 * 개발 환경에서만 열린다 (app/design-demo/layout.tsx 가 프로덕션에서 404).
 * 실제 페이지는 건드리지 않는다 — 판정 받고 나서 옮긴다.
 *
 * 밴드(맨 위 다크 띠)는 2026-08-29 에 이적설 사가까지 붙어서 네 지면이 이미 같다.
 * 그래서 남은 차이는 **행(row) 하나**뿐이고, 이 페이지는 그것만 비교한다.
 *
 * 콘텐츠·사진은 전부 프로덕션 실물이다. 회색 네모로 비교하면 판단이 안 선다.
 */

const THUMB = "/storage/posts/user_bot_soccer_kr/1787985457066-45f8e65d.webp"

const card: React.CSSProperties = {
  background: "var(--wc-card, #fff)",
  boxShadow: "var(--wc-shadow-1)",
}

/* ── 공통 조각 ──────────────────────────────────────────────────────────── */

/** 등급·종류 칩 — 사가가 쓰는 채움 사다리 (잉크=오피셜, 버건디외곽=유력, 실선=루머) */
function Chip({ tone, children }: { tone: "ink" | "wine" | "line" | "soft"; children: string }) {
  const style: React.CSSProperties =
    tone === "ink"
      ? { background: "var(--wc-ink)", color: "var(--wc-card)" }
      : tone === "wine"
        ? { color: "var(--wc-burgundy)", boxShadow: "inset 0 0 0 1px var(--wc-burgundy)" }
        : tone === "line"
          ? { color: "var(--wc-mute-2)", boxShadow: "inset 0 0 0 1px var(--wc-line-2)" }
          : { background: "var(--wc-soft)", color: "var(--wc-mute)" }
  return (
    <span
      className="inline-block shrink-0 rounded-[4px] px-[7px] py-[2px] align-middle text-[12px] leading-[1.5] font-extrabold"
      style={style}
    >
      {children}
    </span>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
      {children}
    </p>
  )
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[16px] leading-[1.4] font-bold"
      style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
    >
      {children}
    </p>
  )
}

function Stage({ children }: { children: string }) {
  return (
    <span className="shrink-0 font-bold" style={{ color: "var(--wc-burgundy)" }}>
      {children}
    </span>
  )
}

function Thumb({ size = 72 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 시안 전용
    <img
      src={THUMB}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded"
      style={{ width: size, height: size, objectFit: "cover" }}
    />
  )
}

/** 어느 지면의 행인지 알려주는 꼬리표 — 시안 설명용, 실제 UI 아님 */
function Tag({ children }: { children: string }) {
  return (
    <p
      className="mb-1.5 text-[12px] font-extrabold"
      style={{ color: "var(--wc-mute-2)", letterSpacing: "0.04em" }}
    >
      {children}
    </p>
  )
}

function SectionTitle({ n, title, note }: { n: string; title: string; note: string }) {
  return (
    <div className="mt-12 mb-4">
      <div style={{ borderTop: "2px solid var(--wc-burgundy)" }} />
      <p
        className="mt-3 text-[12px] font-extrabold"
        style={{ color: "var(--wc-burgundy)", letterSpacing: "0.16em" }}
      >
        {n}
      </p>
      <h2 className="text-[20px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
        {title}
      </h2>
      <p
        className="mt-1.5 text-[13px]"
        style={{ color: "var(--wc-mute)", lineHeight: 1.7, wordBreak: "keep-all" }}
      >
        {note}
      </p>
    </div>
  )
}

/* ── 안 A: 카드 ─────────────────────────────────────────────────────────── */

function CardRow({
  chip,
  chipTone,
  head,
  meta,
  thumb,
}: {
  chip: string
  chipTone: "ink" | "wine" | "line" | "soft"
  head: string
  meta: React.ReactNode
  thumb?: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3.5" style={card}>
      <div className="min-w-0 flex-1">
        <Head>
          <span className="mr-1.5">
            <Chip tone={chipTone}>{chip}</Chip>
          </span>
          {head}
        </Head>
        <Meta>{meta}</Meta>
      </div>
      {thumb ? <Thumb /> : null}
    </div>
  )
}

/* ── 안 B: 헤어라인 ─────────────────────────────────────────────────────── */

function HairRow({
  date,
  weekday,
  chip,
  chipTone,
  head,
  meta,
  thumb,
  first,
}: {
  date?: string
  weekday?: string
  chip: string
  chipTone: "ink" | "wine" | "line" | "soft"
  head: string
  meta: React.ReactNode
  thumb?: boolean
  first?: boolean
}) {
  return (
    <div className="grid grid-cols-[62px_1fr] sm:grid-cols-[76px_1fr]">
      <div className="pt-3.5 pr-3">
        {date && (
          <>
            <p
              className="gn-num text-[20px] leading-none font-bold"
              style={{ color: "var(--wc-ink)" }}
            >
              {date}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
              {weekday}
            </p>
          </>
        )}
      </div>
      <div
        className="flex items-start gap-3 py-3.5 pl-4 sm:pl-5"
        style={{
          borderLeft: "1px solid var(--wc-line-2)",
          borderTop: first ? "none" : "1px solid var(--wc-line)",
        }}
      >
        <div className="min-w-0 flex-1">
          <Head>
            <span className="mr-1.5">
              <Chip tone={chipTone}>{chip}</Chip>
            </span>
            {head}
          </Head>
          <Meta>{meta}</Meta>
        </div>
        {thumb ? <Thumb size={64} /> : null}
      </div>
    </div>
  )
}

/* ── 페이지 ─────────────────────────────────────────────────────────────── */

export default function SagaRowsDemo() {
  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <main className="mx-auto max-w-[760px] px-4 pt-8 pb-24 sm:px-6">
        <p
          className="text-[12px] font-extrabold"
          style={{ color: "var(--wc-burgundy)", letterSpacing: "0.16em" }}
        >
          DESIGN PILOT
        </p>
        <h1 className="text-[31px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
          목록 한 줄, 어떻게 그릴까
        </h1>
        <p
          className="mt-3 text-[14px]"
          style={{ color: "var(--wc-mute)", lineHeight: 1.75, wordBreak: "keep-all" }}
        >
          맨 위 다크 밴드는 네 지면이 이미 같습니다. 남은 차이는 <b>목록 한 줄</b>뿐이라 그것만
          비교합니다. 같은 내용을 세 가지로 그렸으니 위아래로 훑어보세요.
        </p>

        {/* ── 지금 ─────────────────────────────────────────────────────── */}
        <SectionTitle
          n="NOW"
          title="지금 — 네 지면이 네 가지"
          note="같은 종류의 정보인데 배치가 다 다릅니다. 담벼락은 출처·시각이 제목 위에, 사가 쪽은 아래에 있습니다. 사가 목록은 전부 한 줄에 욱여넣고, 시즌 문서만 카드 없이 선으로 나뉩니다."
        />

        <div className="flex flex-col gap-4">
          <div>
            <Tag>담벼락</Tag>
            <div className="flex items-start gap-3 rounded-xl px-4 py-3.5" style={card}>
              <div className="min-w-0 flex-1">
                {/* 메타가 제목 '위' — 사가와 반대 */}
                <p className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
                  <b style={{ color: "var(--wc-ink)" }}>Sky Sport</b>
                  <span style={{ color: "var(--wc-burgundy)" }}> · 뉴스</span> · 1시간 전
                </p>
                <p
                  className="mt-1 text-[16px] leading-[1.4] font-bold"
                  style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                >
                  클롭, 비르츠 향한 비판에 인내 필요 강조
                </p>
              </div>
              <Thumb />
            </div>
          </div>

          <div>
            <Tag>사가 목록</Tag>
            <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={card}>
              <span
                className="w-10 shrink-0 text-[12px] font-bold"
                style={{ color: "var(--wc-mute)" }}
              >
                8.29
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[14px] font-bold"
                style={{ color: "var(--wc-ink)" }}
              >
                크리스털 팰리스 <span style={{ color: "var(--wc-mute-2)" }}>vs</span> 맨체스터 시티
              </span>
              <span
                className="gn-num text-[16px] font-extrabold"
                style={{ color: "var(--wc-ink)" }}
              >
                1<span style={{ color: "var(--wc-mute-2)" }}>:</span>4
              </span>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-extrabold"
                style={{ background: "rgba(150,30,55,.08)", color: "var(--wc-burgundy)" }}
              >
                리포트
              </span>
              <span className="shrink-0 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                ▶
              </span>
            </div>
          </div>

          <div>
            <Tag>이적설 사가</Tag>
            <div className="rounded-xl px-4 py-3.5" style={card}>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5">
                  <Chip tone="line">루머</Chip>
                </span>
                <p
                  className="min-w-0 flex-1 text-[14px] leading-snug font-bold"
                  style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                >
                  맨시티, 알바레스 영입 논의 시작
                </p>
                <span
                  className="shrink-0 text-[12px] font-bold whitespace-nowrap"
                  style={{ color: "var(--wc-mute)" }}
                >
                  Marca ↗
                </span>
              </div>
              <div
                className="mt-1.5 flex items-center gap-2 text-[12px] font-bold"
                style={{ color: "var(--wc-mute)" }}
              >
                <span
                  className="rounded px-1 py-px"
                  style={{ background: "rgba(150,30,55,.07)", color: "var(--wc-burgundy)" }}
                >
                  → 접촉
                </span>
                <span>11시간 전</span>
              </div>
            </div>
          </div>

          <div>
            <Tag>시즌 문서</Tag>
            <div className="grid grid-cols-[62px_1fr]">
              <div className="pt-3 pr-3">
                <p
                  className="gn-num text-[20px] leading-none font-bold"
                  style={{ color: "var(--wc-ink)" }}
                >
                  8.3
                </p>
                <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
                  월
                </p>
              </div>
              <div
                className="py-3 pl-4"
                style={{
                  borderLeft: "1px solid var(--wc-line-2)",
                  borderBottom: "1px solid var(--wc-line)",
                }}
              >
                <div className="flex min-w-0 items-center gap-2 text-[12px]">
                  <Chip tone="line">이적설</Chip>
                  <Stage>제안</Stage>
                  <span className="min-w-0 truncate" style={{ color: "var(--wc-mute-2)" }}>
                    브루노 기마랑이스 이적 사가
                  </span>
                </div>
                <p
                  className="mt-1 text-[16px] leading-[1.45] font-bold"
                  style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                >
                  뉴캐슬, 아스널의 기마랑이스 영입 제안 거절
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── 안 A ─────────────────────────────────────────────────────── */}
        <SectionTitle
          n="안 A"
          title="카드로 통일"
          note="흰 카드와 그림자는 지금 그대로 두고, 배치만 맞춥니다. 첫 줄은 항상 [칩] + 제목, 둘째 줄은 항상 메타. 담벼락의 출처·시각이 제목 위에서 아래로 내려옵니다. 변화가 작고 되돌리기 쉽습니다."
        />

        <div className="flex flex-col gap-2">
          <div>
            <Tag>담벼락</Tag>
            <CardRow
              chip="뉴스"
              chipTone="soft"
              head="클롭, 비르츠 향한 비판에 인내 필요 강조"
              meta="Sky Sport · 1시간 전 · 댓글 4"
              thumb
            />
          </div>
          <div>
            <Tag>사가 목록</Tag>
            <CardRow
              chip="리포트"
              chipTone="wine"
              head="크리스털 팰리스 1–4 맨체스터 시티"
              meta="8.29 (금) · 프리미어리그"
            />
          </div>
          <div>
            <Tag>이적설 사가</Tag>
            <CardRow
              chip="루머"
              chipTone="line"
              head="맨시티, 알바레스 영입 논의 시작"
              meta={
                <>
                  <Stage>접촉</Stage> · 11시간 전 · Marca ↗
                </>
              }
            />
          </div>
          <div>
            <Tag>시즌 문서</Tag>
            <CardRow
              chip="이적설"
              chipTone="line"
              head="뉴캐슬, 아스널의 기마랑이스 영입 제안 거절"
              meta={
                <>
                  <Stage>제안</Stage> · 8.3 (월) · 브루노 기마랑이스 이적 사가
                </>
              }
            />
          </div>
        </div>

        {/* ── 안 B ─────────────────────────────────────────────────────── */}
        <SectionTitle
          n="안 B"
          title="헤어라인으로 통일"
          note="카드 껍데기를 걷어내고 1px 선으로만 나눕니다. 목록이 카드 더미가 아니라 하나의 지면으로 읽히고, 날짜가 왼쪽 레일에 한 번만 찍혀 그룹이 생깁니다. 밀도가 올라가는 대신 담벼락 인상이 꽤 달라집니다."
        />

        <div>
          <Tag>네 지면의 행을 한자리에 모아 본 것 — 껍데기 없이 지면 위에 바로</Tag>
          <div>
            <HairRow
              first
              date="8.29"
              weekday="금"
              chip="뉴스"
              chipTone="soft"
              head="클롭, 비르츠 향한 비판에 인내 필요 강조"
              meta="Sky Sport · 1시간 전 · 댓글 4"
              thumb
            />
            <HairRow
              chip="리포트"
              chipTone="wine"
              head="크리스털 팰리스 1–4 맨체스터 시티"
              meta="프리미어리그"
            />
            <HairRow
              chip="루머"
              chipTone="line"
              head="맨시티, 알바레스 영입 논의 시작"
              meta={
                <>
                  <Stage>접촉</Stage> · 11시간 전 · Marca ↗
                </>
              }
            />
            <HairRow
              date="8.3"
              weekday="월"
              chip="이적설"
              chipTone="line"
              head="뉴캐슬, 아스널의 기마랑이스 영입 제안 거절"
              meta={
                <>
                  <Stage>제안</Stage> · 브루노 기마랑이스 이적 사가
                </>
              }
            />
          </div>
        </div>

        <div className="mt-12" style={{ borderTop: "1px solid var(--wc-line)" }} />
        <p
          className="mt-4 text-[13px]"
          style={{ color: "var(--wc-mute-2)", lineHeight: 1.75, wordBreak: "keep-all" }}
        >
          두 안 다 첫 줄은 [칩] + 제목, 둘째 줄은 메타로 같습니다. 다른 건 껍데기뿐입니다 — 카드로
          띄울 것이냐, 선으로만 나눌 것이냐.
        </p>
      </main>
    </div>
  )
}
