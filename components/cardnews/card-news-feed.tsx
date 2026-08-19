"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import { PollWidget } from "@/components/sidebar/poll-widget"
import { DiscordInviteBanner } from "@/components/discord-invite-banner"
import { suggestTarot } from "@/lib/tarot/suggest"
import { TarotModal } from "@/components/tarot/tarot-modal"
import { CardVsVote } from "@/components/vs/card-vs-vote"
import {
  MessageCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  Star,
  Loader2,
  Youtube,
  Instagram,
  Play,
} from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"
import { trackEvent } from "@/lib/analytics/events"
import type { CardNewsItem } from "@/lib/feed/cardnews"

/**
 * 카드뉴스 홈 피드 — 전면 오버레이 카드 (사진 위 제목).
 *
 * 이전에는 히어로(오버레이) 1장 → 미디엄(흰 프레임) 2장 → 컴팩트 리스트의 3단
 * 위계였으나, 오늘의 떡밥 전체를 오버레이 카드로 통일했다(2026-07-28).
 * 시각 자료가 없는 글만 컴팩트 행으로 떨어진다 — 회색 판때기를 300px 높이로
 * 세우는 건 카드뉴스가 아니라 빈 자리다.
 * (흰 프레임 카드 FramedCard 는 같은 커밋에서 제거 — 필요하면 git history 참조)
 *
 * 좋아요는 떡밥 피드와 동일한 비로그인 로컬 반응 (서버 반영 없음).
 */

const BURGUNDY = "var(--wc-burgundy)"
const TIER1_SOURCES = ["로마노", "온스테인", "romano", "ornstein", "파브리지오", "fabrizio"]

type BadgeTier = "official" | "tier1" | "media"

function badgeTier(source: string): BadgeTier {
  const s = source.toLowerCase()
  if (s.includes("오피셜") || s.includes("official")) return "official"
  if (TIER1_SOURCES.some((t) => s.includes(t))) return "tier1"
  return "media"
}

/* ---------- 이미지 위 태그 칩 (히어로/미디엄 이미지 영역 공용) ---------- */

const chipStyle: React.CSSProperties = {
  height: 24,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.02em",
  background: "rgba(12,11,15,.5)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,.16)",
  color: "rgba(255,255,255,.94)",
}

function SourceChip({ source }: { source: string }) {
  const tier = badgeTier(source)
  if (tier === "official") {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{
          ...chipStyle,
          background: "color-mix(in srgb, var(--wc-burgundy) 88%, transparent)",
          border: "1px solid rgba(255,255,255,.24)",
        }}
      >
        <Check className="h-3 w-3" strokeWidth={3.5} />
        오피셜
      </span>
    )
  }
  if (tier === "tier1") {
    return (
      <span className="inline-flex items-center gap-1" style={chipStyle}>
        <Star className="h-2.5 w-2.5 fill-current" style={{ color: "#FFD96B" }} />
        {source}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center"
      style={{ ...chipStyle, color: "rgba(255,255,255,.78)" }}
    >
      {source}
    </span>
  )
}

type MediaProvider = "youtube" | "instagram" | "x"

/** 썸네일 없는 미디어 글의 배경 — 은은한 브랜드 톤 + 대형 아이콘 */
function MediaPlaceholder({ provider }: { provider: MediaProvider }) {
  if (provider === "instagram") {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #4F3B78 0%, #8E3B60 55%, #B85C38 100%)" }}
      >
        <Instagram className="h-12 w-12 text-white/35" />
      </div>
    )
  }
  if (provider === "x") {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: "#15181C" }}
      >
        <span className="text-6xl font-black text-white/25">𝕏</span>
      </div>
    )
  }
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: "#1A1416" }}
    >
      <Youtube className="h-12 w-12 text-white/30" />
    </div>
  )
}

function FlairChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={chipStyle}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color || BURGUNDY }}
      />
      {name}
    </span>
  )
}

/** 컴팩트 행 키커 — 흰 표면 위 텍스트 레이블 */
function CompactKicker({ card }: { card: CardNewsItem }) {
  const parts: React.ReactNode[] = []
  if (card.source) {
    const tier = badgeTier(card.source)
    parts.push(
      tier === "official" ? (
        <span key="src" className="inline-flex items-center gap-0.5" style={{ color: BURGUNDY }}>
          <Check className="h-3 w-3" strokeWidth={3.5} />
          오피셜
        </span>
      ) : tier === "tier1" ? (
        <span
          key="src"
          className="inline-flex items-center gap-0.5"
          style={{ color: "var(--wc-ink)" }}
        >
          <Star className="h-2.5 w-2.5 fill-current" style={{ color: "#E3A82B" }} />
          {card.source}
        </span>
      ) : (
        <span key="src" style={{ color: "var(--wc-mute)" }}>
          {card.source}
        </span>
      )
    )
  }
  if (card.flair) {
    parts.push(
      <span
        key="flair"
        className="inline-flex items-center gap-1"
        style={{ color: "var(--wc-mute)" }}
      >
        <span
          aria-hidden
          className="h-1 w-1 shrink-0 rounded-full"
          style={{ background: card.flair.color || BURGUNDY }}
        />
        {card.flair.name}
      </span>
    )
  }
  if (card.media) {
    parts.push(
      card.media.provider === "youtube" ? (
        <Youtube key="media" className="h-3.5 w-3.5" style={{ color: "#E53E3E" }} />
      ) : card.media.provider === "instagram" ? (
        <Instagram key="media" className="h-3 w-3" style={{ color: "#C13584" }} />
      ) : (
        <span
          key="media"
          className="text-[11px] leading-none font-black"
          style={{ color: "var(--wc-ink)" }}
        >
          𝕏
        </span>
      )
    )
  }
  // 시간·댓글수는 원래 제목 아래 별도 줄(작성자·좋아요와 함께)에 있었다.
  // 그 줄을 통째로 없애면서 살아남을 값 둘만 키커로 올렸다 (2026-08-12 디자인 패널):
  //  · 작성자 — 최근 60장 전부 "공놀이봇" 단일값. 정보량 0비트라 삭제
  //  · 좋아요 — 아래 CompactCard 주석 참조
  parts.push(
    <span key="time" style={{ color: "var(--wc-mute)" }} suppressHydrationWarning>
      {formatRelativeTime(new Date(card.createdAt))}
    </span>
  )
  if (card.commentCount > 0) {
    parts.push(
      <span
        key="cmt"
        className="inline-flex items-center gap-1"
        style={{ color: "var(--wc-mute)" }}
      >
        <MessageCircle className="h-3 w-3" />
        <span className="tabular-nums">{card.commentCount}</span>
      </span>
    )
  }

  return (
    <div
      className="mb-1.5 flex items-center gap-2 text-[11px] font-bold"
      style={{ letterSpacing: "0.03em" }}
    >
      {parts}
    </div>
  )
}

/* ---------- 공용 훅/스타일 ---------- */

/** eased scrim — 투명→어두움 9스톱 (하드 엣지 없음) */
const SCRIM =
  "linear-gradient(to top, rgba(9,8,11,.86) 0%, rgba(9,8,11,.83) 8%, rgba(9,8,11,.76) 18%, rgba(9,8,11,.63) 32%, rgba(9,8,11,.46) 46%, rgba(9,8,11,.28) 62%, rgba(9,8,11,.12) 78%, rgba(9,8,11,.03) 90%, rgba(9,8,11,0) 100%)"

/** 이적시장 상황판 진입 카드 — 라이트 존 규칙(카드 다크 금지) 준수, 배경 틴트로만 구분 */
function TransferPromoCard() {
  return (
    <Link
      href="/transfer?utm_source=home_cardnews"
      className="block rounded-2xl px-4 py-3.5 no-underline transition-opacity hover:opacity-90"
      style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
      onClick={() => trackEvent({ name: "board_view", params: { board: "transfer_promo" } })}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px]"
          style={{
            background: "color-mix(in srgb, var(--wc-burgundy) 9%, transparent)",
          }}
        >
          🔁
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-[14.5px] font-extrabold"
            style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
          >
            이적시장 상황판
          </span>
          <span
            className="mt-0.5 block text-[12.5px]"
            style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
          >
            오피셜 · Here we go · 루머를 신뢰 등급으로 — 실시간 타임라인
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--wc-mute)" }}
          aria-hidden
        />
      </div>
    </Link>
  )
}

/* 브라우저 네이티브 FaceDetector (Chromium 계열) — 없거나 실패하면 상단 30% 크롭 fallback */
interface DetectedFaceBox {
  boundingBox: { x: number; y: number; width: number; height: number }
}
type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect: (el: HTMLImageElement) => Promise<DetectedFaceBox[]>
}

const clampPct = (v: number) => Math.min(80, Math.max(20, v))

function useFaceFocus(imageUrl: string | null): string | null {
  const [pos, setPos] = useState<string | null>(null)

  useEffect(() => {
    if (!imageUrl) return
    const FD = (window as { FaceDetector?: FaceDetectorCtor }).FaceDetector
    if (!FD) return
    let cancelled = false
    // 화면 <img>에 crossOrigin 을 걸면 CORS 미허용 호스트에서 이미지가 깨짐
    // → 별도 프로브 이미지로만 감지 (실패해도 화면 무영향)
    // ⚠️ window.Image 로 명시 — 이 파일은 next/image 를 Image 로 import 하므로
    //    그냥 `new Image()` 를 쓰면 컴포넌트를 생성자로 부르는 꼴이 된다
    const probe = new window.Image()
    probe.crossOrigin = "anonymous"
    probe.src = imageUrl
    probe.onload = async () => {
      try {
        const faces = await new FD({ fastMode: true, maxDetectedFaces: 4 }).detect(probe)
        if (cancelled || faces.length === 0 || !probe.naturalWidth) return
        const cx =
          faces.reduce((s, f) => s + f.boundingBox.x + f.boundingBox.width / 2, 0) / faces.length
        const cy =
          faces.reduce((s, f) => s + f.boundingBox.y + f.boundingBox.height / 2, 0) / faces.length
        setPos(
          `${clampPct((cx / probe.naturalWidth) * 100)}% ${clampPct((cy / probe.naturalHeight) * 100)}%`
        )
      } catch {
        // CORS/감지 실패 — fallback 유지
      }
    }
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  return pos
}

function openPost(id: string, destination: "post" | "saga" = "post") {
  trackEvent({ name: "cardnews_card_open_post", params: { post_id: id, destination } })
}

/**
 * 댓글 미리보기 (흰 표면 카드용) — 접힘: BEST 한 줄, 탭하면 상위 3개 인라인 펼침.
 * 공방을 카드 안에서 맛보고 "모두 보기"로 상세 진입하는 참여 사다리.
 */
/**
 * 카드 액션 — **카드 하나에 액션은 항상 하나** (2026-08-12 운영자 결정).
 *
 * 우선순위: 투표 > 타로.
 *   · VS 쟁점이 붙은 기사는 이미 논쟁거리라 투표가 자연스럽고, 타로가 굳이 필요 없다
 *   · 폴이 없는 이적설엔 타로가 딱 맞는다
 * 실측(최근 60장): 투표 37 / 나머지 23 — 서로 겹치지 않고 62:38 로 갈린다.
 * 둘 다 붙이면 카드당 CTA 가 셋(기사·투표·타로)이 되고, 고를 게 많으면 아무것도 안 누른다.
 *
 * 투표 데이터는 이미 서버가 카드에 실어 보내고 있었다(lib/feed/cardnews.ts `card.vs`) —
 * 폴 조회·집계까지 다 하고 화면만 없던 상태였다.
 */
/**
 * 액션 띠 — 카드 하단 전폭 44px 슬롯 (2026-08-12 디자인 패널 채택안 I-1 + 같은 날 개정).
 *
 * ## 왜 띠인가
 * 액션이 본문 안에 있으면 세 가지가 동시에 깨진다: 투표 위젯이 자기 테두리를 가져
 * "카드 안에 또 카드"가 되고, 투표 유무로 카드 높이가 2배 갈리고, 투표(사각 박스)와
 * 타로(둥근 pill)의 톤이 따로 논다. 셋 다 "액션이 자기 집을 못 가진 것"이 원인이라
 * 집을 하나 주면 한꺼번에 사라진다.
 *
 * ## 개정: "항상 렌더"를 버렸다
 * 처음엔 폴도 타로도 없는 카드에 "기사 읽기 →"를 넣어 슬롯을 무조건 채웠다 —
 * 높이를 상수로 만들려면 슬롯이 조건부면 안 된다는 논리였다. 실측이 그 논리를 뒤집었다:
 * 피드 49장 중 **45장(92%)이 질문성 띠**를 달고 있었고, 전부가 물으면 묻는 게 신호가
 * 아니게 된다(눈이 배너로 학습해 건너뛴다). "기사 읽기 →"는 카드 전체가 이미 하는 말을
 * 한 번 더 하는 것이라 그 92%에 순수 노이즈로 기여했다.
 *
 * 높이 상수화가 풀려던 진짜 문제는 "**변동이 상시적이라 리듬이 없다**"였지,
 * 변동 자체가 아니었다. 질문을 5장에 한 장으로 줄이면(allowQuestion) 나머지는 전부
 * 같은 높이가 되고, 질문 카드만 44px 더 높다 — 변동이 소음에서 **강세**로 바뀐다.
 * 그래서 액션이 없으면 아무것도 그리지 않는다.
 *
 * ## 톤
 * 버건디 틴트 배경과 🔮 이모지를 뺐다(편집 패널: "버건디는 카드 한 장에 최대 한 번",
 * "이모지는 에디토리얼의 반대말 — 폰트마다 다르게 렌더돼 조판이 흔들린다").
 * 남은 건 hairline 하나와 텍스트뿐이라, 반복돼도 서류 푸터처럼 읽히지 않는다.
 *
 * ## 데드존
 * 이 띠는 카드 전면 링크(absolute inset-0) **바깥**에 있다. 그래서 예전처럼
 * z-index·pointer-events·stopPropagation 으로 링크와 싸울 필요가 없다.
 * 예전 구조에선 투표 박스 래퍼가 버튼이 아닌 56px 까지 덮어 링크를 먹었다.
 */
function CardActionStrip({ card }: { card: CardNewsItem }) {
  if (card.vs) return <CardVsVote vs={card.vs} surface="card" variant="strip" />

  const tarot = suggestTarot(card.title)
  if (!tarot) return null

  return <TarotStrip tarot={tarot} />
}

/**
 * 타로 띠 — 누르면 **모달**이 열린다 (2026-08-12 운영자 요청: "페이지 전환 말고 모달로").
 *
 * 페이지로 넘기면 읽던 피드 위치를 잃고, 보고 나서 돌아오려면 뒤로가기를 눌러야 한다.
 * 재미로 한 번 눌러보는 성격의 진입점에 치르기엔 비싼 대가라 원래 자리를 지킨다.
 *
 * 상태를 여기 두는 이유: CardActionStrip 은 card.vs 여부로 먼저 return 하므로 그 위에
 * 훅을 둘 수 없다. 띠 하나가 자기 모달을 갖는 편이 조건부 훅보다 단순하다.
 */
function TarotStrip({ tarot }: { tarot: NonNullable<ReturnType<typeof suggestTarot>> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          trackEvent({ name: "tarot_hook_click", params: { surface: "cardnews" } })
          setOpen(true)
        }}
        className="flex w-full items-center justify-center text-[12.5px] font-bold transition-colors"
        style={{
          height: 44,
          borderTop: "1px solid var(--wc-line)",
          color: "var(--wc-burgundy)",
        }}
      >
        {tarot.label}
      </button>
      <TarotModal question={tarot.question} open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * 질문성 띠(투표·타로)를 실을 카드 index 집합 — 밀도 상한 (2026-08-12).
 *
 * 실측: 게이트 전 49장 중 45장(92%)이 질문을 걸고 있었다. 폴에만 상한을 걸면
 * 그 자리를 타로가 그대로 이어받아(투표 카드 29장 중 19장이 이적·감독·경기 키워드)
 * 84%로 거의 안 내려간다 — 그래서 상한은 **폴이 아니라 띠 레벨**에 걸어야 한다.
 *
 * 간격 규칙은 이 저장소가 이미 쓰던 것을 그대로 가져왔다 (VS 최초 도입 때의
 * "첫 화면 1개 + 5장 간격"). 첫 장은 허용해 첫 화면에 하나는 보이게 하고,
 * 그다음부터는 5장 간격. 결과적으로 질문 밀도가 20% 선으로 내려간다.
 *
 * 무한 스크롤로 배열이 늘어도 앞에서부터 다시 계산하므로 경계가 흔들리지 않는다.
 */
const QUESTION_GAP = 5

function pickQuestionCards(cards: CardNewsItem[]): Set<number> {
  const allowed = new Set<number>()
  let last = -Infinity
  cards.forEach((card, i) => {
    if (!card.vs && !suggestTarot(card.title)) return // 애초에 질문이 없는 카드
    if (i - last < QUESTION_GAP) return
    allowed.add(i)
    last = i
  })
  return allowed
}

function CommentPreview({ card }: { card: CardNewsItem }) {
  const [open, setOpen] = useState(false)
  if (card.topComments.length === 0 || card.commentCount === 0) return null
  const first = card.topComments[0]

  return (
    <div
      className="pointer-events-auto relative z-[3] mt-2.5 pt-2.5"
      style={{ borderTop: "1px solid var(--wc-line)" }}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-1.5 text-left"
          aria-expanded={false}
          aria-label="댓글 미리보기 펼치기"
        >
          <span
            className="shrink-0 text-[11px] font-extrabold"
            style={{ color: "var(--wc-burgundy)" }}
          >
            BEST
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[12.5px]"
            style={{ color: "var(--wc-mute)" }}
          >
            {first.content}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--wc-mute)" }} />
        </button>
      ) : (
        <div className="space-y-2">
          {card.topComments.map((c, i) => (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 text-[11.5px] font-bold" style={{ color: "var(--wc-ink)" }}>
                {c.nickname}
              </span>
              <span
                className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug"
                style={{ color: "var(--wc-mute)" }}
              >
                {c.content}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Link
              href={`/post/${card.id}?utm_source=cardnews#comments`}
              className="text-[12px] font-bold"
              style={{ color: "var(--wc-burgundy)" }}
              onClick={() => openPost(card.id)}
            >
              댓글 {card.commentCount}개 모두 보기 →
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="댓글 미리보기 접기"
              className="p-1"
            >
              <ChevronUp className="h-3.5 w-3.5" style={{ color: "var(--wc-mute)" }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- VS 쟁점 인카드 투표 (안 1, 2026-07-31) ---------- */

/* ---------- 3) 컴팩트 — 텍스트 좌 + 썸네일 우 (밀도 담당) ---------- */

/**
 * 하트(좋아요)를 카드에서 내린 이유 (2026-08-12 디자인 패널, 세 패널 공통 결론):
 *  · "카드당 액션 하나" 규칙을 이 하트가 이미 어기고 있었다 — 하단 액션 띠와 둘이 된다
 *  · 타겟이 34px(권장 44px 미달)인데 카드 전면 링크 위라 오탭 비용까지 얹혀 있었다
 *  · 그 위험을 지고 얻는 게 없었다 — 표시값이 사실상 전 카드 0
 * 반응 장치가 사라지는 게 아니라 상세 하단 좋아요(`/api/posts/[id]/vote`)로 일원화된다.
 * 로컬 낙관 토글 훅(useLocalLike)도 이 카드가 유일한 소비자였어서 함께 내려갔다.
 */
function CompactCard({ card, allowQuestion }: { card: CardNewsItem; allowQuestion: boolean }) {
  const faceFocus = useFaceFocus(card.image)

  return (
    <article
      /* 사이트에서 가장 많이 누르는 카드가 유일하게 무반응이었다 (2026-08-20 폴리시 1-1).
         데스크톱 호버는 기존 문법(gn-card-lift), 모바일 눌림은 scale 하나만 — 둘 다 걸면 과하다 */
      className="gn-card-lift relative overflow-hidden rounded-xl transition-transform active:scale-[.99]"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      {/* 전면 링크는 이 본문 행에만 걸린다 — 하단 액션 띠는 이 div 바깥이라
          z-index·pointer-events 로 링크와 다툴 일이 없다 (CardActionStrip 주석 참조) */}
      <div className="relative flex items-center gap-3 px-4 py-3">
        {/* 이적설 사가가 붙은 기사는 위키로 직행 (2026-08-03 오너 — "게시물이 아니라 위키로") */}
        <Link
          href={
            card.sagaSlug
              ? `/saga/${card.sagaSlug}?utm_source=cardnews&from=${card.id}`
              : `/post/${card.id}?utm_source=cardnews`
          }
          className="absolute inset-0 z-[1]"
          aria-label={card.title}
          onClick={() => openPost(card.id, card.sagaSlug ? "saga" : "post")}
        />

        <div className="min-w-0 flex-1">
          <CompactKicker card={card} />
          <h2
            className="line-clamp-2"
            style={{
              fontSize: 14.5,
              fontWeight: 650,
              lineHeight: 1.38,
              letterSpacing: "-0.01em",
              color: "var(--wc-ink)",
              wordBreak: "keep-all",
              overflowWrap: "anywhere",
            }}
          >
            {card.title}
          </h2>
          <CommentPreview card={card} />
        </div>

        {(card.image || card.media) && (
          <div className="relative h-[76px] w-[104px] shrink-0 overflow-hidden rounded-lg">
            {card.image ? (
              /**
               * 104×76 썸네일에 1200px 원본을 내리고 있었다 — 실측 **11.5배 과잉**
               * (2026-08-12 /benchmark: 홈 이미지 1,515KB 중 업로드 사진이 1,211KB).
               * 업로드는 이미 WebP 1200px q80 으로 최적화돼 있으므로 더 압축할 게 아니라
               * **치수**를 줄여야 한다 — next/image 가 sizes 에 맞춰 축소본을 만들어 준다.
               * 덤으로 CLS 도 잡힌다(고정 박스 + fill).
               *
               * 같은 출처(/storage, /images)만 next/image 에 태운다. 외부 호스트가 섞여
               * 들어오면 remotePatterns 미등록 시 런타임에 터져 피드 전체가 죽는다 —
               * 그 경우엔 예전처럼 평범한 img 로 흘려보낸다.
               */
              card.image.startsWith("/") ? (
                <Image
                  src={card.image}
                  alt=""
                  fill
                  sizes="104px"
                  loading="lazy"
                  className="object-cover"
                  style={{ objectPosition: faceFocus ?? "50% 30%" }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.image}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: faceFocus ?? "50% 30%" }}
                />
              )
            ) : (
              card.media && <MediaPlaceholder provider={card.media.provider} />
            )}
            {/* 유튜브 썸네일엔 미니 재생 표시 (재생은 상세/상위 카드 몫) */}
            {card.media?.provider === "youtube" && card.image && (
              <span
                className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                style={{ background: "rgba(0,0,0,.55)" }}
                aria-hidden
              >
                <Play className="ml-0.5 h-3.5 w-3.5 fill-white text-white" />
              </span>
            )}
          </div>
        )}
      </div>

      {allowQuestion && <CardActionStrip card={card} />}
    </article>
  )
}

/* ---------- 피드 ---------- */

export function CardNewsFeed({
  initialCards,
  initialCursor,
  excludeIds,
}: {
  initialCards: CardNewsItem[]
  initialCursor: string | null
  /** 피드에서 제외할 글 id — 히어로(Top Story)에 이미 오른 글의 중복 노출 방지 */
  excludeIds?: string[]
}) {
  const [cards, setCards] = useState(initialCards)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  /** 이미 실은 카드 id — 빈 페이지 건너뛰기 루프에서 동기적으로 중복을 걸러야 한다.
   *  excludeIds(히어로 글)를 시드해두면 무한스크롤 뒷페이지에서도 자연히 걸러진다. */
  const seenIds = useRef(new Set([...initialCards.map((c) => c.id), ...(excludeIds ?? [])]))

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    try {
      // 서버가 사진 없는 글을 걸러내므로 한 페이지가 통째로 비어 돌아올 수 있다.
      // 그대로 두면 sentinel 이 화면 밖에 남아 스크롤이 멈추므로, 새 카드가 하나도
      // 없으면 커서를 따라 최대 3페이지까지 이어서 받는다.
      let next: string | null = cursor
      let added = 0
      for (let hop = 0; hop < 3 && next && added === 0; hop++) {
        const res = await fetch(`/api/feed/cardnews?before=${encodeURIComponent(next)}`)
        const d = (await res.json()) as { cards: CardNewsItem[]; nextCursor: string | null }
        // 중복 판정은 ref 로 — setCards 업데이터 안에서 센 값은 이 루프에서 못 읽는다
        const fresh = d.cards.filter((c) => !seenIds.current.has(c.id))
        fresh.forEach((c) => seenIds.current.add(c.id))
        added = fresh.length
        if (fresh.length) setCards((prev) => [...prev, ...fresh])
        next = d.nextCursor
      }
      setCursor(next)
    } finally {
      setLoading(false)
    }
  }, [cursor, loading])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { rootMargin: "600px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  useEffect(() => {
    trackEvent({ name: "cardnews_feed_open", params: {} })
  }, [])

  // 질문성 띠 밀도 상한 — 카드가 늘 때만 다시 계산 (pickQuestionCards 주석 참조)
  const questionCards = useMemo(() => pickQuestionCards(cards), [cards])

  return (
    <div className="flex flex-col gap-3">
      {/*
        오늘의 떡밥 = 전부 컴팩트 카드 (2026-08-03 운영자 확정 — 이전 기안 채택).
        좌: 제목·글쓴이·좋아요·댓글수 / 우: 썸네일. 전면 오버레이(HeroCard)는 홈 상단
        히어로(운영자 큐레이션) 전용으로만 남는다. 정렬은 서버(fetchCardNews)가
        온도순으로 내려주므로 여기서 재배열하지 않는다.
      */}
      {cards.map((card, i) => (
        <Fragment key={card.id}>
          <CompactCard card={card} allowQuestion={questionCards.has(i)} />
          {/* 모바일 인피드 슬롯 — 데스크톱은 우측 사이드바가 담당(lg:hidden).
              폴 실험(반응 유도)이 주력 디바이스에서 hidden lg:block 으로 무효였던 것 수정
              (2026-07-30 워룸). 3번째 카드 뒤 폴 1개, 9번째 뒤 디스코드 1개 — 도배 금지. */}
          {i === 2 && (
            <div className="lg:hidden">
              <PollWidget />
            </div>
          )}
          {/* 이적시장 상황판 — 가장 강한 비로그인 축구 자산인데 홈에 진입로가 0개였다
              (2026-07-30 워룸). 오피셜 뱃지 룰 보수화(2026-07-31) 선행 후 노출. */}
          {i === 5 && <TransferPromoCard />}
          {i === 8 && (
            <div className="lg:hidden">
              <DiscordInviteBanner variant="sidebar" placement="mobile_cardnews_feed" />
            </div>
          )}
        </Fragment>
      ))}
      <div ref={sentinelRef} className="flex h-10 items-center justify-center">
        {loading && <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />}
        {!cursor && !loading && (
          <p className="text-muted-foreground py-2 text-[13px]">오늘의 뉴스 끝!</p>
        )}
      </div>
    </div>
  )
}
