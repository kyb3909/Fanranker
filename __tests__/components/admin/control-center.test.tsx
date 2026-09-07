import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import { ControlCenter } from "@/app/admin/_control-center/control-center"
import type { Observation, WorkItem } from "@/lib/admin/control-center"

/**
 * 관제 센터 화면 — 감사 문서의 검증 시나리오를 화면 단에서 잠근다.
 *  · 긴급 신고 1건이 검수 100건에 묻히지 않는다
 *  · 조회 실패가 0건으로 보이지 않는다
 *  · 처리 화면이 없는 업무를 처리 가능한 것처럼 보여주지 않는다
 *  · 기한이 지난 대기가 다시 올라온다
 */

/** 렌더 시점 기준으로 페이로드를 만든다 — 가짜 타이머는 SWR 의 프로미스 진행을 막는다 */
let NOW = Date.now()

const item = (over: Partial<WorkItem> & Pick<WorkItem, "key" | "label">): WorkItem => ({
  domain: "기타",
  impact: "",
  count: 1,
  oldestAt: null,
  dueAt: null,
  owner: null,
  state: "actionable",
  nextAction: "확인",
  href: "/admin",
  severity: "normal",
  observation: "ok",
  actionWired: true,
  ...over,
})

const obs = (over: Partial<Observation> & Pick<Observation, "key" | "label">): Observation => ({
  state: "ok",
  observedAt: new Date(NOW).toISOString(),
  lastOkAt: new Date(NOW).toISOString(),
  ...over,
})

const makePayload = () => ({
  generatedAt: new Date(NOW).toISOString(),
  role: "admin" as const,
  observations: [
    obs({ key: "reports", label: "신고" }),
    obs({ key: "news-review", label: "뉴스 검수" }),
    obs({
      key: "seller",
      label: "판매자 미지급",
      state: "failed",
      observedAt: null,
      note: "권한 없음",
    }),
    obs({
      key: "inquiries",
      label: "문의",
      state: "unwired",
      observedAt: null,
      note: "접수 경로 없음",
    }),
  ],
  items: [
    item({
      key: "reports-pending",
      label: "미처리 신고",
      domain: "신고·문의",
      severity: "high",
      count: 1,
      impact: "신고 대상 게시물이 그대로 노출됩니다",
    }),
    item({
      key: "news-review",
      label: "뉴스 검수",
      domain: "검수",
      severity: "normal",
      count: 100,
    }),
    item({
      key: "seller-rewards",
      label: "판매자 미지급",
      domain: "재화·정산",
      severity: "critical",
      count: 4,
      observation: "ok",
      actionWired: false,
      href: null,
    }),
    item({
      key: "settle",
      label: "미정산 슬립",
      domain: "재화·정산",
      state: "waiting_auto",
      count: 2,
      owner: "정산 크론",
      dueAt: new Date(NOW - 3_600_000).toISOString(),
    }),
    item({
      key: "cron",
      label: "예약 작업 실패",
      domain: "자동화·감시",
      state: "waiting_auto",
      count: 1,
      owner: "예약 실행",
      nextCheckAt: new Date(NOW + 3_600_000).toISOString(),
    }),
  ],
  outcomes: [
    {
      key: "o1",
      at: new Date(NOW).toISOString(),
      actor: "admin-1",
      action: "환불 큐 종료",
      target: "pending_refund abcd",
      state: "partial" as const,
      evidence: "큐에서만 종료됨 · 지급 여부는 이 기록으로 확인되지 않습니다",
    },
  ],
  pipelines: [
    {
      key: "betman",
      label: "승부예측 경기 크롤링",
      status: "ok" as const,
      detail: "정상",
      hint: "",
    },
    {
      key: "ticker",
      label: "뉴스 티커 크롤러",
      status: "down" as const,
      detail: "12시간 전",
      hint: "",
    },
  ],
})

let payload: ReturnType<typeof makePayload>
const fetchMock = vi.fn()

/**
 * SWR 캐시는 모듈 전역이라 앞 테스트의 성공 응답이 다음 테스트로 새어 들어간다.
 * 매번 빈 저장소를 준다 — 특히 "조회 실패" 시나리오가 앞선 성공 데이터에 가려지면 안 된다.
 */
const renderCC = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ControlCenter />
    </SWRConfig>
  )

beforeEach(() => {
  NOW = Date.now()
  payload = makePayload()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => payload })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("관제 센터", () => {
  it("긴급 신고 1건이 검수 100건보다 위에 나온다", async () => {
    renderCC()
    const list = await screen.findByRole("list", { name: /처리할 일 목록/ })
    const labels = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "")
    const reportAt = labels.findIndex((t) => t.includes("미처리 신고"))
    const reviewAt = labels.findIndex((t) => t.includes("뉴스 검수"))
    expect(reportAt).toBeGreaterThanOrEqual(0)
    expect(reviewAt).toBeGreaterThan(reportAt)
  })

  it("기한이 지난 대기는 처리할 일로 되돌아온다", async () => {
    renderCC()
    const list = await screen.findByRole("list", { name: /처리할 일 목록/ })
    expect(within(list).getByText(/미정산 슬립/)).toBeTruthy()
    expect(within(list).getAllByText("기한 초과").length).toBeGreaterThan(0)
  })

  it("조회 실패와 미연결을 0건으로 표시하지 않는다", async () => {
    renderCC()
    const banner = await screen.findByRole("region", { name: "전체 서비스 상태" })
    expect(banner.textContent).toContain("확인 불가 1")
    expect(banner.textContent).toContain("미연결 1")
    // 전 항목 확인이 아니므로 "전체 정상"이라고 말하지 않는다
    expect(banner.textContent).toContain("업무 2/4곳 확인")
  })

  it("처리 화면이 없는 업무는 그렇게 표시한다", async () => {
    renderCC()
    const list = await screen.findByRole("list", { name: /처리할 일 목록/ })
    const seller = within(list)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("판매자 미지급"))
    expect(seller).toBeTruthy()
    expect(seller!.textContent).toContain("처리 화면 없음")
  })

  it("기다리는 일에는 다음 확인 시각과 담당이 남는다", async () => {
    renderCC()
    await screen.findByRole("list", { name: /처리할 일 목록/ })
    const waitingList = screen.getByRole("list", { name: "기다리는 일 목록" })
    const waiting = within(waitingList).getByText("예약 작업 실패").closest("li")
    expect(waiting?.textContent).toContain("담당 예약 실행")
    expect(waiting?.textContent).toContain("다음 확인")
  })

  it("최근 결과에서 요청과 실제 적용을 구분한다", async () => {
    renderCC()
    await screen.findByRole("list", { name: /처리할 일 목록/ })
    expect(screen.getByText("부분 성공")).toBeTruthy()
    expect(screen.getByText(/지급 여부는 이 기록으로 확인되지 않습니다/)).toBeTruthy()
  })

  it("불러오기 자체가 실패하면 0건이라고 말하지 않는다", async () => {
    fetchMock.mockRejectedValue(new Error("network"))
    renderCC()
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("업무가 0건이라는 뜻이 아닙니다")
  })

  it("자동 수집이 멈춘 파이프라인을 상단에 이름으로 알린다", async () => {
    renderCC()
    const banner = await screen.findByRole("region", { name: "전체 서비스 상태" })
    await waitFor(() => expect(banner.textContent).toContain("뉴스 티커 크롤러"))
    expect(banner.textContent).toContain("중단")
  })
})
