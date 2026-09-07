"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/swr"

/**
 * 유입 채널 퍼널 — "어느 채널에서 온 사람이 정착했나".
 *
 * 시즌 오픈 이벤트는 유튜버 채널에서 트래픽을 받는다. 채널 협업을 이어가려면
 * 유튜버에게 돌려줄 숫자가 있어야 하고, 우리는 어느 채널을 더 밀지 정해야 한다.
 * 그런데 이 질문에 답할 데이터가 지금까지 없었다(UTM 을 읽는 코드가 0줄이었다).
 *
 * 랜딩 도달은 여기 없다 — 비로그인 방문은 user_id 가 없어 원장에 못 남는다.
 * 랜딩→가입은 GA4 landing_view 로 본다. 이 표는 **가입자부터**의 정착률이다.
 */

interface ChannelRow {
  channel: string
  signups: number
  firstSlip: number
  community: number
  both: number
}

interface FunnelResponse {
  days: number
  channels: ChannelRow[]
  totals: ChannelRow
}

function pct(n: number, d: number) {
  if (!d) return "—"
  return `${Math.round((n / d) * 100)}%`
}

export function FunnelCard() {
  const { data, isLoading } = useSWR<FunnelResponse>("/api/admin2/funnel?days=30", fetcher, {
    revalidateOnFocus: false,
  })

  const channels = data?.channels ?? []
  const totals = data?.totals

  return (
    <section className="bg-background rounded-xl border p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          유입 채널 퍼널
          <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
            최근 30일 · 가입자 기준
          </span>
        </h2>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">불러오는 중…</p>
      ) : channels.length === 0 ? (
        <p className="text-muted-foreground text-sm leading-relaxed">
          아직 귀속된 가입이 없습니다. 유튜버에게 줄 링크에{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-[11px]">?utm_source=채널이름</code> 을
          붙이면 채널별로 나뉘어 쌓입니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-[11px] tracking-wide uppercase">
                <th className="py-1.5 pr-2 text-left font-semibold">채널</th>
                <th className="py-1.5 pr-2 text-right font-semibold">가입</th>
                <th className="py-1.5 pr-2 text-right font-semibold">첫 예측</th>
                <th className="py-1.5 pr-2 text-right font-semibold">게시판 활동</th>
                <th className="py-1.5 text-right font-semibold">둘 다</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.channel} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-medium">{c.channel}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{c.signups}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {c.firstSlip}
                    <span className="text-muted-foreground ml-1 text-[11px]">
                      {pct(c.firstSlip, c.signups)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {c.community}
                    <span className="text-muted-foreground ml-1 text-[11px]">
                      {pct(c.community, c.signups)}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {c.both}
                    <span className="text-muted-foreground ml-1 text-[11px]">
                      {pct(c.both, c.signups)}
                    </span>
                  </td>
                </tr>
              ))}
              {totals && channels.length > 1 && (
                <tr className="bg-muted/50 font-semibold">
                  <td className="py-1.5 pr-2">전체</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{totals.signups}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {totals.firstSlip}
                    <span className="text-muted-foreground ml-1 text-[11px] font-normal">
                      {pct(totals.firstSlip, totals.signups)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {totals.community}
                    <span className="text-muted-foreground ml-1 text-[11px] font-normal">
                      {pct(totals.community, totals.signups)}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {totals.both}
                    <span className="text-muted-foreground ml-1 text-[11px] font-normal">
                      {pct(totals.both, totals.signups)}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
            &quot;게시판 활동&quot;은 글 또는 댓글 최초 1회 — 이벤트 응모 조건과 같은 정의다. 계측
            도입(2026-07-29) 이전 가입자는 <b>귀속 불명</b>으로 잡힌다.
          </p>
        </div>
      )}
    </section>
  )
}
