"use client"

import { useEffect, useState } from "react"
import { useInterests } from "./interest-provider"
import { Mockup, PieceArt, TeamChip } from "./shared"
import {
  ASSET_LABELS,
  GOAL,
  REJECT_REASONS,
  ROYALTY_RATE,
  SALES_CHANNEL,
  assetFlags,
  demandFor,
  dpiVerdict,
  effectiveDpi,
  itemOf,
  pieceOf,
  placementOf,
  splitOf,
  teamOf,
  variantOf,
  won,
  type Campaign,
  type RightsState,
  type SceneKey,
} from "./fixtures"

/**
 * 승인 카드 — 구단 MD 가 승인 결정에 실제로 보는 것.
 *
 * 이전 화면에는 "승인 주체 미지정"이라는 문구 한 줄뿐이었다. 버튼도, 반려도, 작가 동의도
 * 없었다. UI 가 없어서가 아니라 **상태 모델이 없어서**였다 — `below / pending / approved`
 * 셋에는 작가 동의 축도, `revision · rejected` 도 들어갈 자리가 없다.
 *
 * 필드 7개:
 *   ① 원본 + 품목 적용 목업   — 승인은 "그림"이 아니라 "그 그림이 얹힌 물건"에 한다
 *   ② 구단 자산 체크 5항       — 하나라도 걸리면 권리자에게 넘기기 전에 멈춘다
 *   ③ 품목 + 소비자가          — 공식 상품 가격대 대비 위 · 아래
 *   ④ 수량 상한 + 판매 기간
 *   ⑤ 판매 채널
 *   ⑥ 작가 상품화 동의 배지
 *   ⑦ 로열티 조건 + 예상액
 *
 * 승인 단위는 **캠페인**(아트워크 × 품목군 × 기간 × 수량)이다. 작가별로 승인하는 MD 는
 * 없다 — 신뢰의 문제가 아니라 그림 하나하나가 문제다. 품목별 개별 승인도 없다 —
 * 스티커를 승인하고 자석을 따로 승인하지 않는다. 품목군은 계약 시 한 번 화이트리스트.
 */

type Decision = { state: RightsState; reasonNo?: number }

export function ApprovalCard({ campaign, scene }: { campaign: Campaign; scene: SceneKey }) {
  const { wanted } = useInterests()
  const piece = pieceOf(campaign.pieceId)
  const item = itemOf(campaign.itemId)
  const team = teamOf(piece.teamId)

  const initial: Decision = { state: campaign.rights[scene], reasonNo: campaign.reasonNo }
  const [d, setD] = useState<Decision>(initial)
  const [picking, setPicking] = useState<"revision" | "rejected" | null>(null)

  // 시나리오를 바꾸면 카드가 그 시점 상태로 돌아간다 — 미팅에서 앞뒤로 오간다
  useEffect(() => {
    setD({ state: campaign.rights[scene], reasonNo: campaign.reasonNo })
    setPicking(null)
  }, [scene, campaign])

  const flags = assetFlags(piece.assets)
  const blocked = flags.length > 0
  const count = demandFor(campaign.pieceId, campaign.itemId, scene, wanted)
  const split = splitOf(item.price)
  const [lo, hi] = item.officialBand
  const band =
    item.price < lo
      ? "공식 가격대보다 낮음"
      : item.price > hi
        ? "공식 가격대보다 높음"
        : "공식 가격대 안"

  /**
   * 작가가 에디터에서 잡은 배치. 승인 카드는 **같은 값**을 읽는다 —
   * 작가가 "300dpi 넘음"을 보고 올렸는데 여기서 다른 기준으로 판단하면 아무도 안 믿는다.
   */
  const place = placementOf(piece.id, item.id)
  const dpi = effectiveDpi(item, place)
  const dv = dpiVerdict(dpi)
  const variant = item.print ? variantOf(item.print.template, place.variant) : null

  const decide = (state: RightsState, reasonNo?: number) => {
    setD({ state, reasonNo })
    setPicking(null)
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: d.state === "approved" ? "var(--wc-tint)" : "var(--wc-card)",
        border: "1px solid var(--wc-line)",
      }}
    >
      {/* 머리 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TeamChip teamId={piece.teamId} size={18} />
          <span className="text-sm" style={{ color: "var(--wc-ink-2)" }}>
            {piece.title} · {item.name}
          </span>
        </div>
        <RightsBadge state={d.state} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[168px_1fr]">
        {/*
          ① 원본 + 목업.
          모바일에서는 나란히 둔다 — 세로로 쌓으면 이미지 두 장이 화면을 통째로 먹어서
          승인에 필요한 필드가 한 스크롤 아래로 밀린다 (2026-09-05 375px 실측).
        */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
          <div
            className="relative w-full overflow-hidden rounded"
            style={{ paddingBottom: "100%", background: "var(--wc-soft)" }}
          >
            <PieceArt piece={piece} />
          </div>
          <Mockup piece={piece} item={item} placement={placementOf(piece.id, item.id)} />
        </div>

        <div className="min-w-0">
          {/* ② 자산 체크 5항 */}
          <FieldHead no="②" label="구단 자산 체크" />
          <div className="mb-3 flex flex-wrap gap-1">
            {ASSET_LABELS.map((a) => {
              const hit = piece.assets[a.key]
              return (
                <span
                  key={a.key}
                  className="rounded px-1.5 py-0.5 text-xs font-semibold"
                  style={{
                    background: hit ? "var(--wc-burgundy)" : "var(--wc-soft)",
                    color: hit ? "var(--wc-paper)" : "var(--wc-mute)",
                  }}
                >
                  {hit ? "⚠ " : ""}
                  {a.label}
                </span>
              )
            })}
          </div>

          {blocked && (
            <div
              className="mb-3 rounded p-2 text-xs"
              style={{ background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }}
            >
              <b>{flags.join(" · ")}</b> 이(가) 걸렸습니다. 권리자에게 넘기기 전에 운영자 검수에서
              멈춥니다 — 승인 버튼은 열리지 않습니다.
            </div>
          )}

          {/* ③④⑤⑦ */}
          <div className="mb-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
            <Row
              no="③"
              k="품목 · 소비자가"
              v={`${item.name}${variant ? ` (${variant.label})` : ""} ${won(item.price)}`}
              sub={`공식 ${won(lo)}~${won(hi)} · ${band}`}
            />
            <Row
              no="④"
              k="수량 상한 · 기간"
              v={`${campaign.cap.toLocaleString("ko-KR")}개 · ${campaign.windowDays}일`}
              sub={`제작 ${item.leadTime}`}
            />
            <Row no="⑤" k="판매 채널" v={SALES_CHANNEL} sub="첫 버전 고정값" />
            <div>
              <FieldHead no="①b" label="배치 · 인쇄 품질" />
              <p className="font-semibold">
                {item.print
                  ? `${(item.print.cmW * place.scale).toFixed(1)} × ${(item.print.cmH * place.scale).toFixed(1)}cm`
                  : "—"}{" "}
                <span style={{ color: dv === "ok" ? "var(--wc-go)" : "var(--wc-burgundy)" }}>
                  {dpi}dpi
                </span>
              </p>
              <p style={{ color: "var(--wc-mute)" }}>
                작가가 잡은 배치 그대로 · {dv === "ok" ? "인쇄 기준 충족" : "기준 미달 — 사유 ⑧"}
              </p>
            </div>
            <Row
              no="⑦"
              k="로열티"
              v={`소비자가의 ${(ROYALTY_RATE * 100).toFixed(1)}% · ${won(split.rights)}/개`}
              sub={`요청 ${count}명 기준 예상 ${won(split.rights * count)}`}
            />
          </div>

          {/* ⑥ 작가 동의 */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FieldHead no="⑥" label="작가 동의" inline />
            <span
              className="rounded px-2 py-0.5 text-xs font-bold"
              style={{
                background: piece.opened ? "var(--wc-go)" : "var(--wc-soft)",
                color: piece.opened ? "var(--wc-paper)" : "var(--wc-mute)",
              }}
            >
              {piece.opened ? `${piece.creator} · 상품화 동의함` : "미동의 — 진행 불가"}
            </span>
            <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
              작가 몫 {won(split.creator)}
            </span>
          </div>

          {/* 수요 — 승인 판단의 배경. 승인은 목표를 기다리지 않는다 */}
          <p className="mb-3 text-xs" style={{ color: "var(--wc-mute)" }}>
            요청 {count}명 / 목표 {GOAL}명 ·{" "}
            {count >= GOAL ? "목표 도달" : `${GOAL - count}명 남음`} — 승인은 목표 달성을 기다리지
            않습니다. 두 축은 따로 돕니다.
          </p>

          {/* 결정 */}
          {picking ? (
            <ReasonPicker
              kind={picking}
              onPick={(no) => decide(picking, no)}
              onCancel={() => setPicking(null)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                disabled={blocked || !piece.opened}
                onClick={() => decide("approved")}
                className="rounded px-3 py-2 text-sm font-bold"
                style={{
                  background: blocked || !piece.opened ? "var(--wc-soft)" : "var(--wc-go)",
                  color: blocked || !piece.opened ? "var(--wc-mute)" : "var(--wc-paper)",
                  cursor: blocked || !piece.opened ? "not-allowed" : "pointer",
                }}
              >
                승인
              </button>
              <button
                onClick={() => setPicking("revision")}
                className="rounded px-3 py-2 text-sm font-bold"
                style={{ background: "var(--wc-gold)", color: "var(--wc-ink)" }}
              >
                수정 요청
              </button>
              <button
                onClick={() => setPicking("rejected")}
                className="rounded px-3 py-2 text-sm font-bold"
                style={{
                  background: "var(--wc-paper)",
                  color: "var(--wc-burgundy)",
                  border: "1px solid var(--wc-line)",
                }}
              >
                반려
              </button>
              {d.state !== initial.state && (
                <button
                  onClick={() => decide(initial.state, initial.reasonNo)}
                  className="rounded px-3 py-2 text-sm font-semibold"
                  style={{ background: "transparent", color: "var(--wc-mute)" }}
                >
                  되돌리기
                </button>
              )}
            </div>
          )}

          {(d.state === "rejected" || d.state === "revision") && d.reasonNo && (
            <p className="mt-2 text-xs" style={{ color: "var(--wc-ink-2)" }}>
              사유 {d.reasonNo}. {REJECT_REASONS[d.reasonNo - 1]}
              {campaign.reasonNote && d.reasonNo === campaign.reasonNo
                ? ` — ${campaign.reasonNote}`
                : ""}
            </p>
          )}

          {d.state === "approved" && (
            <p className="mt-2 text-xs" style={{ color: "var(--wc-go)" }}>
              승인됨 · 원본 · 시안 · 견적을 확인한 뒤 주문과 제작을 별도로 결정합니다 · {team.name}{" "}
              로열티 예상 {won(split.rights * count)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────── 조각 ─────────────────── */

function FieldHead({ no, label, inline }: { no: string; label: string; inline?: boolean }) {
  return (
    <p
      className={inline ? "text-xs font-semibold" : "mb-1 text-xs font-semibold"}
      style={{ color: "var(--wc-mute)" }}
    >
      <span style={{ color: "var(--wc-burgundy)" }}>{no}</span> {label}
    </p>
  )
}

function Row({ no, k, v, sub }: { no: string; k: string; v: string; sub: string }) {
  return (
    <div>
      <FieldHead no={no} label={k} />
      <p className="font-semibold">{v}</p>
      <p style={{ color: "var(--wc-mute)" }}>{sub}</p>
    </div>
  )
}

/** 반려 사유는 필수다. "그냥 안 됨"은 작가가 고칠 수 없다 */
function ReasonPicker({
  kind,
  onPick,
  onCancel,
}: {
  kind: "revision" | "rejected"
  onPick: (no: number) => void
  onCancel: () => void
}) {
  return (
    <div
      className="rounded p-3"
      style={{ background: "var(--wc-soft)", border: "1px solid var(--wc-line)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold">
          {kind === "revision" ? "수정 요청 사유" : "반려 사유"} — 필수
        </p>
        <button
          className="text-xs font-semibold"
          style={{ color: "var(--wc-mute)" }}
          onClick={onCancel}
        >
          취소
        </button>
      </div>
      <div className="grid gap-1">
        {REJECT_REASONS.map((r, i) => (
          <button
            key={r}
            onClick={() => onPick(i + 1)}
            className="rounded px-2 py-1.5 text-left text-xs font-semibold"
            style={{ background: "var(--wc-paper)", color: "var(--wc-ink-2)" }}
          >
            {i + 1}. {r}
          </button>
        ))}
      </div>
    </div>
  )
}

function RightsBadge({ state }: { state: RightsState }) {
  const map: Record<RightsState, { label: string; bg: string; fg: string }> = {
    review: { label: "검토 중", bg: "var(--wc-soft)", fg: "var(--wc-mute)" },
    approved: { label: "승인", bg: "var(--wc-go)", fg: "var(--wc-paper)" },
    revision: { label: "수정 요청", bg: "var(--wc-gold)", fg: "var(--wc-ink)" },
    rejected: { label: "반려", bg: "var(--wc-burgundy)", fg: "var(--wc-paper)" },
  }
  const s = map[state]
  return (
    <span className="rounded px-2 py-1 text-xs font-bold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}
