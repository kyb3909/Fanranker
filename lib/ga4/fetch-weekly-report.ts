import { getClient, getPropertyId } from "./client"
import { createServiceRoleClient } from "@/lib/supabase/server"

export interface WeeklyReportData {
  users: {
    dauAvg: number
    wau: number
    newUsers: number
    returningUsers: number
  }
  engagement: {
    sessions: number
    avgEngagementTimeSec: number
    pagesPerSession: number
    bounceRate: number
  }
  topPages: { pagePath: string; screenPageViews: number }[]
  trafficSources: { channel: string; sessions: number }[]
  retention: {
    newUserRatio: number
    returningUserRatio: number
  }
  comparison: {
    users: { current: number; previous: number; changePercent: number }
    sessions: { current: number; previous: number; changePercent: number }
    newUsers: { current: number; previous: number; changePercent: number }
    avgEngagementTimeSec: { current: number; previous: number; changePercent: number }
  }
  business: {
    predictionUsers: number
    predictionSlips: number
    predictionParticipationRate: number
    purchaseUsers: number
    purchaseCount: number
    prevPredictionUsers: number
    prevPurchaseCount: number
    predictionUsersChangePercent: number
    purchaseCountChangePercent: number
  }
}

function toNum(val: string | undefined | null): number {
  return val ? Number(val) : 0
}

function changePercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function fetchWeeklyReport(
  periodStart: string,
  periodEnd: string
): Promise<{ reportData: WeeklyReportData; summary: string }> {
  const client = getClient()
  const property = `properties/${getPropertyId()}`

  // 지난주 기간 계산 (WoW 비교용)
  const start = new Date(periodStart)
  const prevStart = new Date(start)
  prevStart.setDate(prevStart.getDate() - 7)
  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStartStr = prevStart.toISOString().split("T")[0]
  const prevEndStr = prevEnd.toISOString().split("T")[0]

  const [thisWeekRes, prevWeekRes, dauRes, topPagesRes, trafficRes] = await Promise.all([
    // 1) 이번주 집계
    client.runReport({
      property,
      dateRanges: [{ startDate: periodStart, endDate: periodEnd }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "averageSessionDuration" },
        { name: "screenPageViewsPerSession" },
        { name: "bounceRate" },
        { name: "newUsers" },
      ],
    }),
    // 2) 지난주 집계 (WoW 비교용)
    client.runReport({
      property,
      dateRanges: [{ startDate: prevStartStr, endDate: prevEndStr }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "averageSessionDuration" },
        { name: "newUsers" },
      ],
    }),
    // 3) 일별 activeUsers (DAU 평균)
    client.runReport({
      property,
      dateRanges: [{ startDate: periodStart, endDate: periodEnd }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }],
    }),
    // 4) Top 10 페이지
    client.runReport({
      property,
      dateRanges: [{ startDate: periodStart, endDate: periodEnd }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
    // 5) Top 10 트래픽 소스
    client.runReport({
      property,
      dateRanges: [{ startDate: periodStart, endDate: periodEnd }],
      dimensions: [{ name: "sessionDefaultChannelGrouping" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
  ])

  // Parse this week
  const tw = thisWeekRes[0]?.rows?.[0]?.metricValues ?? []
  const wau = toNum(tw[0]?.value)
  const sessions = toNum(tw[1]?.value)
  const avgEngagementTimeSec = Math.round(toNum(tw[2]?.value))
  const pagesPerSession = Math.round(toNum(tw[3]?.value) * 100) / 100
  const bounceRate = Math.round(toNum(tw[4]?.value) * 1000) / 10
  const newUsers = toNum(tw[5]?.value)

  // Parse prev week
  const pw = prevWeekRes[0]?.rows?.[0]?.metricValues ?? []
  const prevWau = toNum(pw[0]?.value)
  const prevSessions = toNum(pw[1]?.value)
  const prevAvgEngagement = Math.round(toNum(pw[2]?.value))
  const prevNewUsers = toNum(pw[3]?.value)

  // DAU 평균
  const dauRows = dauRes[0]?.rows ?? []
  const dauTotal = dauRows.reduce((sum, r) => sum + toNum(r.metricValues?.[0]?.value), 0)
  const dauAvg = dauRows.length > 0 ? Math.round(dauTotal / dauRows.length) : 0

  // Top pages
  const topPages = (topPagesRes[0]?.rows ?? []).map((r) => ({
    pagePath: r.dimensionValues?.[0]?.value ?? "",
    screenPageViews: toNum(r.metricValues?.[0]?.value),
  }))

  // Traffic sources
  const trafficSources = (trafficRes[0]?.rows ?? []).map((r) => ({
    channel: r.dimensionValues?.[0]?.value ?? "",
    sessions: toNum(r.metricValues?.[0]?.value),
  }))

  // Business metrics from Supabase
  const supabase = createServiceRoleClient()
  const periodStartTs = new Date(periodStart).toISOString()
  const periodEndTs = new Date(new Date(periodEnd).getTime() + 86400000).toISOString() // end of day
  const prevStartTs = prevStart.toISOString()
  const prevEndTs = new Date(prevEnd.getTime() + 86400000).toISOString()

  const [
    { data: predSlips },
    { count: predSlipCount },
    { data: purchases },
    { count: purchaseCount },
    { data: prevPredSlips },
    { count: prevPurchaseCount },
  ] = await Promise.all([
    // 이번주 예측 참여 유니크 유저
    supabase
      .from("prediction_slips")
      .select("user_id")
      .gte("created_at", periodStartTs)
      .lt("created_at", periodEndTs),
    // 이번주 예측 슬립 수
    supabase
      .from("prediction_slips")
      .select("*", { count: "exact", head: true })
      .gte("created_at", periodStartTs)
      .lt("created_at", periodEndTs),
    // 이번주 구매 유니크 유저
    supabase
      .from("purchased_content")
      .select("user_id")
      .gte("purchased_at", periodStartTs)
      .lt("purchased_at", periodEndTs),
    // 이번주 구매 건수
    supabase
      .from("purchased_content")
      .select("*", { count: "exact", head: true })
      .gte("purchased_at", periodStartTs)
      .lt("purchased_at", periodEndTs),
    // 지난주 예측 참여 유니크 유저
    supabase
      .from("prediction_slips")
      .select("user_id")
      .gte("created_at", prevStartTs)
      .lt("created_at", prevEndTs),
    // 지난주 구매 건수
    supabase
      .from("purchased_content")
      .select("*", { count: "exact", head: true })
      .gte("purchased_at", prevStartTs)
      .lt("purchased_at", prevEndTs),
  ])

  const predictionUserIds = new Set((predSlips ?? []).map((r) => r.user_id))
  const predictionUsers = predictionUserIds.size
  const predictionSlipCount = predSlipCount ?? 0
  const purchaseUserIds = new Set((purchases ?? []).map((r) => r.user_id))
  const purchaseUsers = purchaseUserIds.size
  const purchaseTotal = purchaseCount ?? 0
  const prevPredictionUserIds = new Set((prevPredSlips ?? []).map((r) => r.user_id))
  const prevPredUsers = prevPredictionUserIds.size
  const prevPurchTotal = prevPurchaseCount ?? 0
  const predictionParticipationRate = wau > 0 ? Math.round((predictionUsers / wau) * 1000) / 10 : 0

  // Retention
  const returningUsers = wau - newUsers
  const newUserRatio = wau > 0 ? Math.round((newUsers / wau) * 1000) / 10 : 0
  const returningUserRatio = wau > 0 ? Math.round((returningUsers / wau) * 1000) / 10 : 0

  const reportData: WeeklyReportData = {
    users: { dauAvg, wau, newUsers, returningUsers },
    engagement: { sessions, avgEngagementTimeSec, pagesPerSession, bounceRate },
    topPages,
    trafficSources,
    retention: { newUserRatio, returningUserRatio },
    comparison: {
      users: { current: wau, previous: prevWau, changePercent: changePercent(wau, prevWau) },
      sessions: {
        current: sessions,
        previous: prevSessions,
        changePercent: changePercent(sessions, prevSessions),
      },
      newUsers: {
        current: newUsers,
        previous: prevNewUsers,
        changePercent: changePercent(newUsers, prevNewUsers),
      },
      avgEngagementTimeSec: {
        current: avgEngagementTimeSec,
        previous: prevAvgEngagement,
        changePercent: changePercent(avgEngagementTimeSec, prevAvgEngagement),
      },
    },
    business: {
      predictionUsers,
      predictionSlips: predictionSlipCount,
      predictionParticipationRate,
      purchaseUsers,
      purchaseCount: purchaseTotal,
      prevPredictionUsers: prevPredUsers,
      prevPurchaseCount: prevPurchTotal,
      predictionUsersChangePercent: changePercent(predictionUsers, prevPredUsers),
      purchaseCountChangePercent: changePercent(purchaseTotal, prevPurchTotal),
    },
  }

  const summary = generateSummary(reportData)

  return { reportData, summary }
}

function generateSummary(data: WeeklyReportData): string {
  const parts: string[] = []

  // 유저 요약
  parts.push(`주간 활성 유저 ${data.users.wau.toLocaleString()}명 (DAU 평균 ${data.users.dauAvg}명)`)

  // WoW 변화
  const userChange = data.comparison.users.changePercent
  if (userChange > 0) {
    parts.push(`전주 대비 유저 ${userChange}% 증가`)
  } else if (userChange < 0) {
    parts.push(`전주 대비 유저 ${Math.abs(userChange)}% 감소`)
  } else {
    parts.push(`전주와 유저 수 동일`)
  }

  // 신규 유저
  parts.push(`신규 유저 ${data.users.newUsers.toLocaleString()}명 (${data.retention.newUserRatio}%)`)

  // 참여도
  const minutes = Math.round(data.engagement.avgEngagementTimeSec / 60)
  parts.push(`평균 체류시간 ${minutes}분, 이탈률 ${data.engagement.bounceRate}%`)

  // 인기 페이지
  if (data.topPages.length > 0) {
    const top = data.topPages[0]
    parts.push(`가장 많이 방문한 페이지: ${top.pagePath} (${top.screenPageViews.toLocaleString()}회)`)
  }

  // 주요 트래픽
  if (data.trafficSources.length > 0) {
    const top = data.trafficSources[0]
    parts.push(`주요 유입 채널: ${top.channel} (${top.sessions.toLocaleString()}세션)`)
  }

  // 비즈니스 지표
  const biz = data.business
  parts.push(`승부예측 참여 ${biz.predictionUsers}명 (참여율 ${biz.predictionParticipationRate}%, 총 ${biz.predictionSlips}건)`)
  parts.push(`예측 정보 구매 ${biz.purchaseCount}건 (${biz.purchaseUsers}명)`)

  return parts.join(". ") + "."
}
