/**
 * 외부 유료 API 비용 계기판 (2026-08-25).
 *
 * 운영자가 "오늘 얼마나 썼나" 물었을 때 답을 못 했다 — 기록은 있는데 **볼 지면이 없었다**.
 * 축구 API 크레딧(lfa_usage_log)과 OpenAI(llm_usage_log)를 한 자리에 놓는다.
 *
 * ⚠️ 두 지표는 단위가 다르다. 축구 API 는 **선불 크레딧**(잔량이 곧 수명)이고 OpenAI 는
 *    **후불 요금**(쓴 만큼 청구)이다. 그래서 축구는 "남은 일수", OpenAI 는 "달러"를 세운다.
 * ⚠️ OpenAI 비용은 **추정치**다 — 공식 usage API 는 키에 api.usage.read 스코프가 없어
 *    못 부른다. 요율표 기반 계산이므로 실청구와 소수점 차이가 날 수 있다.
 */

interface TaskRow {
  task: string
  model: string
  calls: number
  /** 그중 실패 (2026-09-02). calls 에 포함된 수다 — 따로 더하면 이중 계상 */
  fails: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

/** 실패 사유 분포 — "몇 건 실패"만으로는 다시 코드를 뒤져야 한다 */
interface FailRow {
  reason: string
  task: string
  calls: number
}

export interface DailyRow {
  day: string
  lfaCredits: number
  lfaCallsToday: number
  llmUsd: number
  llmCalls: number
  llmFails: number
}

export interface ApiCostData {
  lfa: {
    callsToday: number
    burnedToday: number
    creditsNow: number | null
    /** 최근 7일 실측 소모율 기준 남은 일수 */
    daysLeft: number | null
  }
  llm: {
    callsToday: number
    /** 오늘 실패 (2026-09-02). callsToday 에 **포함**된 수다 */
    failsToday: number
    costToday: number
    costWeek: number
    failsWeek: number
    /** 기록이 하나도 없으면 계기판이 아직 안 도는 것 — 화면에서 구분해 알린다 */
    hasData: boolean
    byTask: TaskRow[]
    failReasons: FailRow[]
  }
  /** 최근 7일 일별 추이 — 운영자: "하루에 얼마씩 쓰는지 로그를 계속" */
  daily: DailyRow[]
}

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`
const num = (n: number) => n.toLocaleString("ko-KR")

export function ApiCostCard({ data }: { data: ApiCostData }) {
  const { lfa, llm } = data
  // 남은 일수 21일 미만이면 경보 — ops-monitor 의 임계와 같은 값
  const lfaLow = lfa.daysLeft != null && lfa.daysLeft < 21

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-bold">외부 API 비용</h2>
        <p className="text-muted-foreground text-sm">
          축구 데이터는 선불 크레딧, OpenAI 는 후불 요금입니다. OpenAI 금액은 요율표 기반
          추정치입니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ── 축구 API ── */}
        <div className="border-border bg-card rounded-xl border p-4">
          <div className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
            축구 데이터 (LFA)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-foreground text-3xl leading-none font-bold">
              {num(lfa.burnedToday)}
            </span>
            <span className="text-muted-foreground text-sm">크레딧 · 오늘</span>
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="오늘 호출" value={`${num(lfa.callsToday)}건`} />
            <Row label="잔여" value={lfa.creditsNow == null ? "-" : num(lfa.creditsNow)} />
            <Row
              label="남은 일수"
              value={lfa.daysLeft == null ? "산정 불가" : `약 ${Math.floor(lfa.daysLeft)}일`}
              warn={lfaLow}
            />
          </dl>
          {lfaLow && (
            <p className="mt-2 text-xs font-semibold text-red-600">
              충전이 필요합니다 — 바닥나면 라인업·라이브 스코어·불판이 멈춥니다.
            </p>
          )}
        </div>

        {/* ── OpenAI ── */}
        <div className="border-border bg-card rounded-xl border p-4">
          <div className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
            OpenAI
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-foreground text-3xl leading-none font-bold">
              {usd(llm.costToday)}
            </span>
            <span className="text-muted-foreground text-sm">오늘 (추정)</span>
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="오늘 호출" value={`${num(llm.callsToday)}건`} />
            <Row label="오늘 실패" value={`${num(llm.failsToday)}건`} warn={llm.failsToday > 0} />
            <Row label="최근 7일" value={usd(llm.costWeek)} />
            <Row label="월 환산" value={`~${usd(llm.costWeek * (30 / 7))}`} />
          </dl>
          {llm.failsToday > 0 && (
            <p className="mt-2 text-xs font-semibold text-red-600">
              이 파이프라인 상당수가 fail-closed 입니다 — 실패는 에러 없이 발행을 멈춥니다. 아래
              사유를 먼저 보세요.
            </p>
          )}
          {!llm.hasData && (
            <p className="text-muted-foreground mt-2 text-xs">
              아직 기록이 없습니다. 계기판은 2026-08-25 배포분부터 쌓입니다.
            </p>
          )}
        </div>
      </div>

      {/* ── 실패 사유 (최근 7일) ──
          ⚠️ 실패가 없으면 이 블록은 통째로 안 그린다. 0 을 보여주는 표는 눈을 길들여
             정작 숫자가 붙었을 때 안 보이게 만든다. */}
      {llm.failReasons.length > 0 && (
        <div className="border-border bg-card rounded-xl border p-4">
          <div className="text-xs font-bold tracking-wider text-red-600 uppercase">
            LLM 실패 · 최근 7일 {num(llm.failsWeek)}건
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {llm.failReasons.map((f) => (
              <li key={`${f.task}:${f.reason}`} className="flex justify-between gap-3">
                <span className="text-foreground font-semibold">
                  {f.task}
                  <span className="text-muted-foreground ml-2 font-normal">{f.reason}</span>
                </span>
                <span className="font-bold text-red-600 tabular-nums">{num(f.calls)}건</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            http_400 이 몰려 있으면 모델 세대와 파라미터가 어긋난 것입니다 —
            lib/llm/openai-params.ts 의 chatParams 규약을 확인하세요.
          </p>
        </div>
      )}

      {/* ── 일별 추이 ──
          ⚠️ 축구는 **크레딧**, OpenAI 는 **달러**다. 한 표에 놓되 열을 분명히 갈라
             같은 척도로 읽히지 않게 한다. */}
      {data.daily.length > 0 && (
        <div className="border-border bg-card overflow-x-auto rounded-xl border">
          <table className="w-full text-sm" style={{ minWidth: 520 }}>
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs">
                <th className="px-3 py-2 text-left font-bold">날짜 (KST)</th>
                <th className="px-3 py-2 text-right font-bold">축구 크레딧</th>
                <th className="px-3 py-2 text-right font-bold">축구 호출</th>
                <th className="px-3 py-2 text-right font-bold">OpenAI $</th>
                <th className="px-3 py-2 text-right font-bold">OpenAI 호출</th>
                <th className="px-3 py-2 text-right font-bold">실패</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((r) => (
                <tr key={r.day} className="border-border border-b last:border-0">
                  <td className="text-foreground px-3 py-2 font-semibold">{r.day}</td>
                  <td className="text-foreground px-3 py-2 text-right font-bold tabular-nums">
                    {num(r.lfaCredits)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {num(r.lfaCallsToday)}
                  </td>
                  <td className="text-foreground px-3 py-2 text-right font-bold tabular-nums">
                    {usd(r.llmUsd)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {num(r.llmCalls)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${r.llmFails > 0 ? "font-bold text-red-600" : "text-muted-foreground"}`}
                  >
                    {num(r.llmFails)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 작업별 내역 ── */}
      {llm.byTask.length > 0 && (
        <div className="border-border bg-card overflow-x-auto rounded-xl border">
          <table className="w-full text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs">
                <th className="px-3 py-2 text-left font-bold">작업</th>
                <th className="px-3 py-2 text-left font-bold">모델</th>
                <th className="px-3 py-2 text-right font-bold">호출</th>
                <th className="px-3 py-2 text-right font-bold">실패</th>
                <th className="px-3 py-2 text-right font-bold">입력</th>
                <th className="px-3 py-2 text-right font-bold">출력</th>
                <th className="px-3 py-2 text-right font-bold">비용(7일)</th>
              </tr>
            </thead>
            <tbody>
              {llm.byTask.map((r) => (
                <tr key={`${r.task}:${r.model}`} className="border-border border-b last:border-0">
                  <td className="text-foreground px-3 py-2 font-semibold">{r.task}</td>
                  <td className="text-muted-foreground px-3 py-2">{r.model}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.calls)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${r.fails > 0 ? "font-bold text-red-600" : "text-muted-foreground"}`}
                  >
                    {num(r.fails)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {num(r.inputTokens)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {num(r.outputTokens)}
                  </td>
                  <td className="text-foreground px-3 py-2 text-right font-bold tabular-nums">
                    {usd(r.costUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`tabular-nums ${warn ? "font-bold text-red-600" : "text-foreground font-semibold"}`}
      >
        {value}
      </dd>
    </div>
  )
}
