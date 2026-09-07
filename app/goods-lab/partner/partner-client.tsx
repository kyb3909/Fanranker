"use client"

import { useState } from "react"
import { useInterests } from "../interest-provider"
import { ApprovalCard } from "../approval-card"
import { DemoBanner, RouteSwitch, SectionHead, TeamChip } from "../shared"
import {
  APPROVAL_QUEUE,
  BLOCKED_QUEUE,
  BOARD_ITEMS,
  CONSENT_LINES,
  CONSENT_SOLID,
  FORM_LABEL,
  GOAL,
  ITEMS,
  MODE_LABEL,
  PARTNER_ASKS,
  PIPELINE,
  SCENES,
  SELL_ITEMS,
  SPEC_FIELDS,
  SPLIT_LABELS,
  TEAMS,
  cellOf,
  itemOf,
  itemsAt,
  partnerRollup,
  pieceOf,
  splitOf,
  teamOf,
  won,
  type Form,
  type Mode,
  type SceneKey,
  type Split,
} from "../fixtures"

/**
 * 파트너 지면 — 권리자 · 대행사가 보는 화면.
 *
 * 팬 지면(`/goods-lab`)에서 이쪽으로 옮겨온 것: 시나리오 토글 · 수요 보드 · 권리 게이트 ·
 * 트랙 설명 · MOQ · 배분표. 팬에게는 하나도 필요 없고, 파트너에게는 전부 필요하다.
 *
 * 순서는 미팅 순서다 — ① 당신에게 요청하는 것 ② 당신이 얻는 것 ③ 왜 이 품목만인가
 * ④ 돈이 어떻게 갈리나 ⑤ 입체는 어떻게 만드나.
 */
export function PartnerClient() {
  const [scene, setScene] = useState<SceneKey>("reached")
  const meta = SCENES.find((s) => s.key === scene) ?? SCENES[0]

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--wc-canvas)", color: "var(--wc-ink)" }}
    >
      <DemoBanner note="시연 데이터 — 실제 이용자 수치가 아닙니다 · 승인 버튼은 이 화면 안에서만 동작합니다" />

      <div className="mx-auto max-w-5xl px-4 pb-24">
        <header className="pt-8 pb-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p
              className="font-semibold tracking-widest uppercase"
              style={{ fontSize: "var(--wc-fs-eyebrow)", color: "var(--wc-burgundy)" }}
            >
              Partner · Rights &amp; Demand
            </p>
            <RouteSwitch here="partner" />
          </div>
          <h1 className="leading-tight font-bold" style={{ fontSize: "var(--wc-fs-h2)" }}>
            생산하기 전에 팔릴지 알고, 만들기 전에 승인을 받는다
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--wc-ink-2)" }}>
            팬 창작은 이미 벌어지고 있습니다. 이 화면은 그것을 수요 데이터와 승인 절차 안으로
            들여오는 통로입니다.
          </p>
        </header>

        <SceneToggle scene={scene} onChange={setScene} />
        <p className="mt-3 mb-6 text-sm" style={{ color: "var(--wc-mute)" }}>
          {meta.caption}
        </p>

        <SummaryBoard scene={scene} />
        <ApprovalQueue scene={scene} />
        <DemandBoard scene={scene} />
        <ItemPolicy />
        <SplitBoard />
        <PipelineBoard />
        <AskBoard />
      </div>
    </div>
  )
}

/* ──────────────────── ⓪ 요약 — 미팅에서 들고 갈 숫자 ──────────────────── */

/**
 * 아래 보드를 다 읽기 전에 답해야 하는 네 가지.
 *
 * ⚠️ 금액은 **상한**이다. 요청은 구매 약속이 아니므로 "예상 매출"이라고 부르지 않는다 —
 *    표를 읽을 줄 아는 사람 앞에서 한 번 과장하면 나머지 숫자도 같이 의심받는다.
 * ⚠️ 모든 값은 `partnerRollup` 하나에서 나온다. 여기서 다시 계산하면 아래 보드와 갈린다.
 */
function SummaryBoard({ scene }: { scene: SceneKey }) {
  const { wanted } = useInterests()
  const r = partnerRollup(scene, wanted)

  return (
    <section className="mb-12" aria-label="요약">
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="모인 요청"
            value={`${r.requests.toLocaleString("ko-KR")}건`}
            note={`제작 검토선(${GOAL}명)을 넘긴 조합 ${r.readyCombos}개`}
          />
          <Stat
            label="지금 승인을 기다리는 건"
            value={`${r.awaitingApproval}건`}
            note={
              r.blocked > 0
                ? `승인 주체가 없어 큐 밖에 있는 건 ${r.blocked}개 (EPL)`
                : "큐 밖에 남은 건 없습니다"
            }
          />
          <Stat
            label="권리자 로열티 상한"
            value={won(r.royaltyCeilingWon)}
            note="요청이 전부 주문이 됐을 때. 예상 매출이 아닙니다"
          />
          <Stat
            label="작가에게 갈 몫 상한"
            value={won(r.creatorCeilingWon)}
            note={`같은 기준의 소비자가 합 ${won(r.grossCeilingWon)}`}
          />
        </div>
        <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--wc-mute)" }}>
          요청은 구매 약속이 아닙니다. 이 화면은 주문량이나 고유 팬 수를 추정하지 않고, 모인 요청이
          그대로 주문이 됐을 때의 상한만 보여줍니다. 신호 품목(입체)은 팔지 않으므로 금액에서
          제외했습니다.
        </p>
      </div>
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-xs font-semibold" style={{ color: "var(--wc-mute)" }}>
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
        {note}
      </p>
    </div>
  )
}

/* ──────────────────── ⑥ 우리가 요청하는 것 ──────────────────── */

/** 미팅의 마지막 장 — 상대가 무엇을 하면 되는지 적혀 있지 않으면 회의가 끝나지 않는다 */
function AskBoard() {
  return (
    <section className="mt-14" aria-label="권리자에게 요청하는 것">
      <SectionHead
        no="요청"
        title="구단·대행사에 부탁드리는 세 가지"
        lead="나머지(제작·정산·CS·팬 응대)는 저희가 맡습니다."
      />
      <ol className="space-y-3">
        {PARTNER_ASKS.map((ask, i) => (
          <li
            key={ask.title}
            className="flex gap-3 rounded-xl p-4"
            style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: "var(--wc-tint)", color: "var(--wc-burgundy)" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{ask.title}</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--wc-ink-2)" }}>
                {ask.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function SceneToggle({ scene, onChange }: { scene: SceneKey; onChange: (s: SceneKey) => void }) {
  return (
    <div
      className="flex w-full gap-1 rounded-xl p-1"
      style={{ background: "var(--wc-soft)", border: "1px solid var(--wc-line)" }}
      role="tablist"
    >
      {SCENES.map((s) => {
        const on = s.key === scene
        return (
          <button
            key={s.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(s.key)}
            className="flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors"
            style={{
              background: on ? "var(--wc-burgundy)" : "transparent",
              color: on ? "var(--wc-paper)" : "var(--wc-ink-2)",
            }}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

/* ──────────────────── ① 승인 큐 ──────────────────── */

function ApprovalQueue({ scene }: { scene: SceneKey }) {
  return (
    <section className="mb-16">
      <SectionHead
        no="① 승인"
        title="이 자리가 비어 있습니다"
        lead="전시는 열려 있고, 상품화는 승인이 있어야 넘어갑니다. 승인 · 수정 요청 · 반려 세 버튼이 이 화면의 전부이고, 그 버튼을 누를 주체가 아직 없습니다."
      />

      <div className="space-y-4">
        {APPROVAL_QUEUE.map((c) => (
          <ApprovalCard key={c.id} campaign={c} scene={scene} />
        ))}
      </div>

      {/*
        ⚠️ 감추지 않는다. EPL 구단은 지역 라이선시 에이전트를 통해서만 상품화 라이선스를 주고,
           한국 팬 커뮤니티와 승인 프로그램을 직접 여는 일은 첫 해엔 없다. 승인 큐에 EPL 행을
           세워두면 구단 MD 가 보는 순간 이 화면 전체가 비현실이 된다.
      */}
      <div
        className="mt-6 rounded-xl p-4"
        style={{ background: "var(--wc-soft)", border: "1px solid var(--wc-line)" }}
      >
        <h3 className="mb-1 text-sm font-bold">승인 주체가 없어 큐에 못 서는 것</h3>
        <p className="mb-3 text-xs" style={{ color: "var(--wc-ink-2)" }}>
          EPL 구단은 지역 라이선시 에이전트를 거쳐야 합니다. 요청은 계속 쌓이지만 승인 카드가
          만들어지지 않아 팬 화면에서는 &ldquo;구단 확인 중&rdquo;에 머뭅니다.
        </p>
        <div className="space-y-2">
          {BLOCKED_QUEUE.map((c) => {
            const piece = pieceOf(c.pieceId)
            const item = itemOf(c.itemId)
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded p-2"
                style={{ background: "var(--wc-paper)", border: "1px solid var(--wc-line)" }}
              >
                <div className="flex items-center gap-2">
                  <TeamChip teamId={piece.teamId} size={16} />
                  <span className="text-xs" style={{ color: "var(--wc-ink-2)" }}>
                    {piece.title} · {item.name}
                  </span>
                </div>
                <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
                  {teamOf(piece.teamId).approver}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 작가 동의 — 승인 카드 ⑥번 필드가 어디서 오는지 */}
      <div
        className="mt-4 rounded-xl p-4"
        style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
      >
        <h3 className="mb-2 text-sm font-bold">작가가 &ldquo;굿즈로 열기&rdquo;에서 동의하는 것</h3>
        <ol className="space-y-1 text-xs" style={{ color: "var(--wc-ink-2)" }}>
          {CONSENT_LINES.map((l, i) => (
            <li key={l}>
              {i + 1}. {l}
            </li>
          ))}
          <li style={{ color: "var(--wc-mute)" }}>5. {CONSENT_SOLID} (2단계)</li>
        </ol>
        <p className="mt-2 text-xs" style={{ color: "var(--wc-mute)" }}>
          전시는 기존 약관 그대로입니다. 상품화만 작품 단위로 따로 받습니다 — 팬아트는 작품마다 초상
          · 엠블럼 포함 여부가 다릅니다.
        </p>
      </div>
    </section>
  )
}

/* ──────────────────── ② 수요 보드 ──────────────────── */

function DemandBoard({ scene }: { scene: SceneKey }) {
  const { wanted } = useInterests()
  const cols = BOARD_ITEMS.map(itemOf)
  const all = TEAMS.flatMap((t) => cols.map((c) => cellOf(t.id, c.id, scene, wanted).requests))
  const max = Math.max(...all, 1)

  return (
    <section className="mb-16">
      <SectionHead
        no="② 수요"
        title="생산하기 전에, 팔릴지 안다"
        lead="어느 구단 팬이 어떤 품목을 원하는지가 한 장에 모입니다. 숫자보다 중요한 건 희망 가격대가 좁게 모였는지입니다 — 흩어져 있으면 수량을 채워도 팔리지 않습니다."
      />

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--wc-line)" }}>
        <table
          className="w-full min-w-[640px] border-collapse"
          style={{ background: "var(--wc-card)" }}
        >
          <thead>
            <tr>
              <th
                className="px-3 py-3 text-left text-xs font-semibold"
                style={{ color: "var(--wc-mute)", borderBottom: "1px solid var(--wc-line)" }}
              >
                구단 · 품목
              </th>
              {cols.map((it) => (
                <th
                  key={it.id}
                  className="px-2 py-3 text-center text-xs font-semibold"
                  style={{ color: "var(--wc-mute)", borderBottom: "1px solid var(--wc-line)" }}
                >
                  {it.name}
                  <span className="block font-normal">
                    {it.stage === "sell" ? "관심 수집" : it.stage === "signal" ? "신호만" : "2단계"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAMS.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--wc-line)" }}>
                  <div className="flex items-center gap-2">
                    <TeamChip teamId={t.id} size={18} />
                    <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
                      {t.league}
                    </span>
                  </div>
                </td>
                {cols.map((it) => {
                  const c = cellOf(t.id, it.id, scene, wanted)
                  const alpha = Math.min(0.85, (c.requests / max) * 0.85)
                  return (
                    <td
                      key={it.id}
                      className="relative px-2 py-2 text-center"
                      style={{ borderBottom: "1px solid var(--wc-line)" }}
                    >
                      <span
                        className="pointer-events-none absolute inset-1 rounded"
                        style={{ background: t.color, opacity: alpha * 0.28 }}
                        aria-hidden
                      />
                      <span className="relative block text-sm font-bold">{c.requests}건</span>
                      {/* 신호 품목은 값이 없다 — 수렴 · 분산을 붙이면 없는 가격을 판단한 척이 된다 */}
                      <span
                        className="relative block text-xs"
                        style={{
                          color: it.price > 0 && c.tight ? "var(--wc-go)" : "var(--wc-mute)",
                        }}
                      >
                        {it.price > 0
                          ? `${(c.medianPrice / 1000).toFixed(0)}천 · ${c.tight ? "수렴" : "분산"}`
                          : "요청만"}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--wc-mute)" }}>
        요청은 작품별로 합산한 건수이며 고유 인원이나 주문 수량이 아닙니다. 칸의 색 진하기는 요청
        수, 아래 숫자는 시연 희망 가격대 중앙값입니다. <b>수렴</b>은 견적을 낼 수 있다는 신호입니다.
        「입체로도 원해요」는 팔지 않는 품목이라 요청만 셉니다 — 이 열이 다음 단계를 열지 말지를
        정합니다. · 시연 데이터입니다.
      </p>
    </section>
  )
}

/* ──────────────────── ③ 품목 정책 ──────────────────── */

const CELLS: { mode: Mode; form: Form }[] = [
  { mode: "instant", form: "flat" },
  { mode: "group", form: "flat" },
  { mode: "instant", form: "solid" },
  { mode: "group", form: "solid" },
]

function ItemPolicy() {
  const dropped = [
    ["티셔츠 · 후드", "어패럴은 키트 스폰서 카테고리 독점 — 구단이 제3자에게 줄 권한이 없습니다"],
    ["피규어 · 흉상", "선수 초상은 구단이 아니라 선수 · 에이전트 · 선수협 권리입니다"],
    ["PVC · 소프트비닐", "MOQ 100 은 금형비만 개당 7만원. KC · 제조물책임까지 붙습니다"],
    ["자석 · 아크릴 블록", "배송비를 붙이면 마진이 0 이거나, 무겁고 모서리가 깨집니다"],
    ["폰케이스 · 에코백", "기종 변형 30개+ / 캔버스 인쇄 품질 — 첫 버전에 SKU 폭탄입니다"],
  ]

  return (
    <section className="mb-16">
      <SectionHead
        no="③ 품목"
        title="파는 것은 셋뿐입니다"
        lead="취향이 아니라 권리와 원가가 정했습니다. 남은 셋은 같은 공정 · 같은 업체 · KC 대상 밖이고, 권리 층위도 같아서 승인 카드 한 장으로 함께 승인할 수 있습니다."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {SELL_ITEMS.map((it) => (
          <div
            key={it.id}
            className="rounded-xl p-4"
            style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold">{it.name}</h3>
              <span className="text-sm font-bold" style={{ color: "var(--wc-burgundy)" }}>
                {won(it.price)}
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--wc-ink-2)" }}>
              {it.note}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--wc-mute)" }}>
              제작 {it.leadTime} · 공식 {won(it.officialBand[0])}~{won(it.officialBand[1])}
            </p>
          </div>
        ))}
      </div>

      {/* 2×2 — 트랙을 가르는 경계는 금형 유무가 아니다 */}
      <h3 className="mt-8 mb-2 text-sm font-bold">트랙은 3개가 아니라 2×2 입니다</h3>
      <p className="mb-3 text-xs" style={{ color: "var(--wc-ink-2)" }}>
        경계는 <b>돈이 걸리는 시점</b>(즉시 · 공동)과 <b>공장에 들어가는 입력</b>(평면 파일 · 입체
        원형)입니다. 팬 화면에는 이 격자가 보이지 않습니다 — 팬이 고르는 건 품목입니다.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CELLS.map(({ mode, form }) => {
          const items = itemsAt(mode, form)
          const empty = items.length === 0
          return (
            <div
              key={`${mode}-${form}`}
              className="rounded-xl p-4"
              style={{
                background: empty ? "var(--wc-soft)" : "var(--wc-card)",
                border: "1px solid var(--wc-line)",
              }}
            >
              <p className="mb-1 text-xs font-semibold" style={{ color: "var(--wc-mute)" }}>
                {MODE_LABEL[mode]} · {FORM_LABEL[form]}
              </p>
              {empty ? (
                <p className="text-sm font-semibold" style={{ color: "var(--wc-mute)" }}>
                  현실에 없는 칸 — 입체는 후보정 · 테스트 출력이 붙어 낱개 주문이 성립하지 않습니다
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {items.map((i) => (
                    <li key={i.id} className="flex items-baseline justify-between gap-2">
                      <span className={i.stage === "sell" ? "font-semibold" : ""}>
                        {i.name}
                        {i.stage !== "sell" && (
                          <span className="ml-1 text-xs" style={{ color: "var(--wc-mute)" }}>
                            2단계
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs" style={{ color: "var(--wc-mute)" }}>
                        {i.moq > 0 ? `최소 ${i.moq}개` : "최소 수량 없음"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <h3 className="mt-8 mb-2 text-sm font-bold">뺀 것과 그 이유</h3>
      <div className="space-y-2">
        {dropped.map(([k, v]) => (
          <div
            key={k}
            className="rounded p-3"
            style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
          >
            <p className="text-sm font-semibold">{k}</p>
            <p className="text-xs" style={{ color: "var(--wc-ink-2)" }}>
              {v}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--wc-mute)" }}>
        지금 목록에 있는 품목은 {ITEMS.length}개, 파는 것은 {SELL_ITEMS.length}개, 목표 인원은{" "}
        {GOAL}명입니다. 인쇄 3종은 최소 수량이 없어 목표가 물리값이 아니라 &ldquo;승인 카드에 올릴
        값어치가 있는가&rdquo;의 선입니다.
      </p>
    </section>
  )
}

/* ──────────────────── ④ 배분 ──────────────────── */

function SplitBoard() {
  return (
    <section className="mb-16">
      <SectionHead
        no="④ 배분"
        title="주체는 셋이 아니라 넷입니다"
        lead="제작 대행사가 빠지면 표가 맞지 않습니다. 소비자 화면에는 「작가에게 N원」 한 줄만 보이고, 구단 로열티는 승인 카드에만 나옵니다."
      />

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--wc-line)" }}>
        <table
          className="w-full min-w-[560px] border-collapse"
          style={{ background: "var(--wc-card)" }}
        >
          <thead>
            <tr>
              <th
                className="px-3 py-3 text-left text-xs font-semibold"
                style={{ color: "var(--wc-mute)", borderBottom: "1px solid var(--wc-line)" }}
              >
                품목 · 소비자가
              </th>
              {SPLIT_LABELS.map((s) => (
                <th
                  key={s.key}
                  className="px-2 py-3 text-right text-xs font-semibold"
                  style={{ color: "var(--wc-mute)", borderBottom: "1px solid var(--wc-line)" }}
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SELL_ITEMS.map((it) => {
              const sp = splitOf(it.price)
              return (
                <tr key={it.id}>
                  <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--wc-line)" }}>
                    <span className="text-sm font-semibold">{it.name}</span>
                    <span className="ml-2 text-xs" style={{ color: "var(--wc-mute)" }}>
                      {won(it.price)}
                    </span>
                  </td>
                  {SPLIT_LABELS.map((s) => (
                    <td
                      key={s.key}
                      className="px-2 py-2 text-right text-sm"
                      style={{
                        borderBottom: "1px solid var(--wc-line)",
                        fontWeight: s.key === "creator" ? 700 : 400,
                        color: s.key === "creator" ? "var(--wc-burgundy)" : "var(--wc-ink)",
                      }}
                    >
                      {won(sp[s.key as keyof Split])}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {SPLIT_LABELS.map((s) => (
          <p key={s.key} className="text-xs" style={{ color: "var(--wc-mute)" }}>
            <b style={{ color: "var(--wc-ink-2)" }}>{s.label}</b> — {s.hint}
          </p>
        ))}
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--wc-mute)" }}>
        첫 버전은 고정 배분입니다. 작가가 마진을 직접 정하는 방식(마플샵)은 작가 온보딩 화면이
        통째로 필요하고, 수요 검증에 필요한 건 &ldquo;작가 몫이 보이는 것&rdquo;이지 작가가 조정하는
        것이 아닙니다. 판매는 제작 대행사 스토어로 넘겨 KC · 배송 · 반품 · 제조물책임을 제조사가
        지는 구조로 시작합니다.
      </p>
    </section>
  )
}

/* ──────────────────── ⑤ 파이프라인 ──────────────────── */

function PipelineBoard() {
  return (
    <section>
      <SectionHead
        no="⑤ 입체"
        title="Meshy 출력은 시안이 아니라 스케치입니다"
        lead="2단계에 열립니다. 팬에게 보이는 건 네 장면뿐이고, 후보정 · 파팅 · 도색 마스터 · 색분해 · T1/T2 는 관리자 화면의 상태값으로만 존재합니다."
      />

      <div className="space-y-2">
        {PIPELINE.map((p) => (
          <div
            key={p.no}
            className="grid gap-2 rounded-xl p-4 sm:grid-cols-[28px_1fr_1fr]"
            style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
          >
            <p className="text-xl font-bold" style={{ color: "var(--wc-mute-2)" }}>
              {p.no}
            </p>
            <div>
              <h3 className="text-sm font-bold">{p.title}</h3>
              <p className="text-xs" style={{ color: "var(--wc-ink-2)" }}>
                팬에게 — {p.fan}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--wc-mute)" }}>
                안에서 — {p.inside}
              </p>
              <p className="mt-1 text-xs font-semibold" style={{ color: "var(--wc-burgundy)" }}>
                {p.cost}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-4 rounded-xl p-4"
        style={{ background: "var(--wc-soft)", border: "1px solid var(--wc-line)" }}
      >
        <h3 className="mb-2 text-sm font-bold">입체 상품에 반드시 표기할 것</h3>
        <div className="flex flex-wrap gap-1">
          {SPEC_FIELDS.map((f) => (
            <span
              key={f}
              className="rounded px-2 py-1 text-xs font-semibold"
              style={{ background: "var(--wc-paper)", color: "var(--wc-ink-2)" }}
            >
              {f}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--wc-mute)" }}>
          이게 없으면 &ldquo;6cm 인지 12cm 인지&rdquo;를 아무도 모릅니다. 뷰어 안 스케일 바 하나면
          끝나는 문제입니다.
        </p>
      </div>
    </section>
  )
}
