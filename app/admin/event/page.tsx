import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { Users, TrendingUp, Megaphone } from "lucide-react"
import { updateLeagueCodes, updateEventStatus } from "./actions"

export const metadata: Metadata = {
  title: "월드컵 이벤트 운영 — Admin",
}

// 등록자/그룹 분포 즉시 반영
export const dynamic = "force-dynamic"

const EVENT_SLUG = "worldcup-2026"

interface EventRow {
  id: string
  slug: string
  name: string
  status: string
  start_at: string
  end_at: string
  registration_closes_at: string
  prize_description: string | null
  league_codes: string[] | null
}

interface GroupRow {
  id: string
  slug: string
  name: string
  club_kor: string | null
  color: string
  sort_order: number
}

interface RegistrationRow {
  group_id: string
  traffic_source: string | null
  registered_at: string
  user_id: string
}

export default async function AdminEventPage() {
  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, slug, name, status, start_at, end_at, registration_closes_at, prize_description, league_codes"
    )
    .eq("slug", EVENT_SLUG)
    .maybeSingle<EventRow>()

  if (!event) {
    return (
      <div className="p-8">
        <h1 className="mb-2 text-xl font-bold">월드컵 이벤트 운영</h1>
        <p className="text-muted-foreground text-sm">
          이벤트(slug=&quot;{EVENT_SLUG}&quot;)를 찾을 수 없습니다. 마이그레이션이 적용됐는지
          확인하세요.
        </p>
      </div>
    )
  }

  const [{ data: groupsData }, { data: regsData }] = await Promise.all([
    supabase
      .from("event_groups")
      .select("id, slug, name, club_kor, color, sort_order")
      .eq("event_id", event.id)
      .order("sort_order"),
    supabase
      .from("event_registrations")
      .select("group_id, traffic_source, registered_at, user_id")
      .eq("event_id", event.id)
      .order("registered_at", { ascending: false }),
  ])

  const groups: GroupRow[] = (groupsData ?? []) as GroupRow[]
  const registrations: RegistrationRow[] = (regsData ?? []) as RegistrationRow[]

  const total = registrations.length
  const byGroup = groups.map((g) => ({
    ...g,
    count: registrations.filter((r) => r.group_id === g.id).length,
  }))
  const maxGroupCount = Math.max(1, ...byGroup.map((g) => g.count))

  const byTraffic: Record<string, number> = {}
  for (const r of registrations) {
    const k = r.traffic_source?.trim() || "(직접 진입)"
    byTraffic[k] = (byTraffic[k] || 0) + 1
  }
  const trafficSorted = Object.entries(byTraffic).sort((a, b) => b[1] - a[1])

  const recent = registrations.slice(0, 10)
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]))

  const fmtDate = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* 이벤트 메타 */}
      <header className="space-y-1">
        <div className="text-muted-foreground text-[12px] font-semibold tracking-[0.1em] uppercase">
          {event.slug} · {event.status}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
        <p className="text-muted-foreground text-sm">
          {fmtDate(event.start_at)} ~ {fmtDate(event.end_at)} · 등록 마감{" "}
          {fmtDate(event.registration_closes_at)}
        </p>
      </header>

      {/* 운영 컨트롤 — 이벤트 상태 + 월드컵 league_codes 편집 */}
      <Card className="space-y-5 p-5">
        <h2 className="text-base font-bold">운영 컨트롤</h2>

        <form action={updateEventStatus} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-muted-foreground mb-1 block text-[12px] font-semibold tracking-[0.06em] uppercase">
              이벤트 상태
            </label>
            <select
              name="status"
              defaultValue={event.status}
              className="bg-background w-full rounded-md border px-3 py-2 text-sm sm:w-48"
            >
              <option value="draft">draft (초안)</option>
              <option value="open">open (등록 받음)</option>
              <option value="live">live (베팅 활성)</option>
              <option value="closed">closed (종료)</option>
            </select>
          </div>
          <button
            type="submit"
            className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            상태 저장
          </button>
        </form>

        <form action={updateLeagueCodes} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-muted-foreground mb-1 block text-[12px] font-semibold tracking-[0.06em] uppercase">
              월드컵 League Codes (콤마/공백 구분)
            </label>
            <input
              name="league_codes"
              type="text"
              defaultValue={(event.league_codes ?? []).join(", ")}
              placeholder="예: WC, FIFA, WC2026"
              className="bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              betman 이 월드컵 경기에 사용하는 league_code 들. 비우면 /worldcup/games 는 안내 모드.
              현재:{" "}
              {(event.league_codes ?? []).length === 0
                ? "(미배정)"
                : (event.league_codes ?? []).join(", ")}
            </p>
          </div>
          <button
            type="submit"
            className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            코드 저장
          </button>
        </form>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-muted-foreground flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] uppercase">
            <Users className="h-3.5 w-3.5" />총 등록자
          </div>
          <div className="mt-2 text-3xl font-black tabular-nums">{total.toLocaleString()}</div>
        </Card>
        <Card className="p-5">
          <div className="text-muted-foreground flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] uppercase">
            <TrendingUp className="h-3.5 w-3.5" />
            그룹 수
          </div>
          <div className="mt-2 text-3xl font-black tabular-nums">{groups.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-muted-foreground flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] uppercase">
            <Megaphone className="h-3.5 w-3.5" />
            트래픽 소스
          </div>
          <div className="mt-2 text-3xl font-black tabular-nums">{trafficSorted.length}</div>
        </Card>
      </div>

      {/* 그룹별 분포 */}
      <Card className="p-5">
        <h2 className="mb-4 text-base font-bold">그룹별 등록자</h2>
        <div className="space-y-3">
          {byGroup.map((g) => {
            const pct = total > 0 ? (g.count / total) * 100 : 0
            const barW = (g.count / maxGroupCount) * 100
            return (
              <div key={g.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: g.color }}
                    />
                    <span className="font-bold">{g.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {g.club_kor && `· ${g.club_kor}`}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    <span className="text-foreground font-semibold">{g.count}명</span> (
                    {pct.toFixed(1)}%)
                  </div>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${barW}%`, background: g.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* 트래픽 소스 분포 */}
      <Card className="p-5">
        <h2 className="mb-4 text-base font-bold">트래픽 소스</h2>
        {trafficSorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">등록자가 없습니다.</p>
        ) : (
          <div className="divide-border divide-y">
            {trafficSorted.map(([src, count]) => {
              const pct = total > 0 ? (count / total) * 100 : 0
              return (
                <div key={src} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono">{src}</span>
                  <span className="text-muted-foreground tabular-nums">
                    <span className="text-foreground font-semibold">{count}명</span> (
                    {pct.toFixed(1)}%)
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* 최근 등록 */}
      <Card className="p-5">
        <h2 className="mb-4 text-base font-bold">최근 등록 ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">등록자가 없습니다.</p>
        ) : (
          <div className="divide-border divide-y">
            <div className="text-muted-foreground grid grid-cols-[2fr_1fr_1fr_auto] gap-3 py-2 text-[11px] font-semibold tracking-wider uppercase">
              <div>USER ID</div>
              <div>그룹</div>
              <div>트래픽</div>
              <div className="text-right">시간</div>
            </div>
            {recent.map((r) => (
              <div
                key={r.user_id + r.registered_at}
                className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-3 py-2 text-sm"
              >
                <div className="truncate font-mono text-xs">{r.user_id}</div>
                <div className="text-xs font-semibold">{groupNameById.get(r.group_id) ?? "—"}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {r.traffic_source || "(직접)"}
                </div>
                <div className="text-muted-foreground text-right text-xs tabular-nums">
                  {fmtDate(r.registered_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
