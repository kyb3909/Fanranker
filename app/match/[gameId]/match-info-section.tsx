import { getMatchPreview, type FormMatch } from "@/lib/lfa/preview"

/**
 * 정보 탭 — 심판·결장자·최근 폼·상대 전적 (2026-08-17, 매치 센터).
 * 전부 fail-open: 재료가 없는 섹션은 스스로 사라지고, 넷 다 없으면 통째로 안 그린다.
 */

/** 종이 1장 안의 한 단 — 상자를 겹치지 않고 라벨 + 괘선으로만 나눈다 */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="sheet-lab">{title}</h2>
      {children}
    </section>
  )
}

/**
 * 폼 목록에서 "그 팀"의 표기를 뽑는다.
 * LFA 는 폼을 소속 팀 기준으로 주지만 팀명 필드를 따로 주지 않는다 — 목록 전체에
 * 매 경기 등장하는 팀이 곧 그 팀이다 (홈·원정이 섞여 있어도 성립).
 */
function pickRecurringTeam(form: FormMatch[]): string | undefined {
  if (form.length < 2) return undefined
  const count = new Map<string, number>()
  for (const m of form) {
    count.set(m.home.name, (count.get(m.home.name) ?? 0) + 1)
    count.set(m.away.name, (count.get(m.away.name) ?? 0) + 1)
  }
  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1])
  return best && best[1] === form.length ? best[0] : undefined
}

/** 결과 한 줄 — 기준 팀이 있으면 승/무/패 색으로 물린다 */
function FormRow({ m, teamName }: { m: FormMatch; teamName?: string }) {
  const [h, a] = m.score.split("-").map((s) => Number(s.trim()))
  let mark: { text: string; color: string } | null = null
  if (teamName && Number.isFinite(h) && Number.isFinite(a)) {
    const isHome = m.home.name === teamName
    const us = isHome ? h : a
    const them = isHome ? a : h
    mark =
      us > them
        ? { text: "승", color: "#2f7d5b" }
        : us < them
          ? { text: "패", color: "#c2352f" }
          : { text: "무", color: "var(--wc-mute)" }
  }
  return (
    <li className="flex items-center gap-2 py-[3px] text-[12.5px]">
      {mark && (
        <span
          className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold"
          style={{ background: `${mark.color}1a`, color: mark.color }}
        >
          {mark.text}
        </span>
      )}
      <span className="gn-num shrink-0 text-[11px]" style={{ color: "var(--wc-mute-2)" }}>
        {m.date}
      </span>
      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--wc-ink)" }}>
        {m.home.name}
        <span className="gn-num mx-1.5 font-bold">{m.score}</span>
        {m.away.name}
      </span>
    </li>
  )
}

export async function MatchInfoSection({
  matchId,
  homeTeam,
  awayTeam,
  homeLabel,
  awayLabel,
}: {
  matchId: string
  /** 사전 조회용 **원문** 팀명 — 통칭을 넘기면 스쿼드 조회(name_kr 정확일치)가 깨진다 */
  homeTeam: string
  awayTeam: string
  /** 지면 표기용 통칭 (없으면 원문) */
  homeLabel?: string
  awayLabel?: string
}) {
  const p = await getMatchPreview(matchId, homeTeam, awayTeam)
  const homeName = homeLabel ?? homeTeam
  const awayName = awayLabel ?? awayTeam
  const hasInjuries = p.injuries.home.length > 0 || p.injuries.away.length > 0
  const hasForm = p.homeForm.length > 0 || p.awayForm.length > 0
  if (!hasInjuries && !hasForm && p.h2h.length === 0 && p.officials.length === 0) return null

  return (
    <>
      {hasForm && (
        <Panel title="최근 경기">
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {[
              { label: homeName, form: p.homeForm },
              { label: awayName, form: p.awayForm },
            ].map((side) => {
              // 승패 표시는 그 팀 기준이어야 한다 — LFA 폼 목록의 팀명 표기로 대조한다
              const anchor = side.form.find(
                (m) =>
                  m.home.name === side.form[0]?.home.name || m.away.name === side.form[0]?.away.name
              )
              const teamName = pickRecurringTeam(side.form) ?? anchor?.home.name
              return (
                <div key={side.label} className="min-w-0">
                  <p className="text-[11.5px] font-bold" style={{ color: "var(--wc-mute)" }}>
                    {side.label}
                  </p>
                  <ul className="mt-1">
                    {side.form.slice(0, 5).map((m, i) => (
                      <FormRow key={i} m={m} teamName={teamName} />
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {p.h2h.length > 0 && (
        <Panel title="상대 전적">
          <ul className="mt-1.5">
            {p.h2h.slice(0, 6).map((m, i) => (
              <FormRow key={i} m={m} />
            ))}
          </ul>
        </Panel>
      )}

      {hasInjuries && (
        <Panel title="결장·부상">
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {[
              { label: homeName, rows: p.injuries.home },
              { label: awayName, rows: p.injuries.away },
            ].map((side) => (
              <div key={side.label} className="min-w-0">
                <p className="text-[11.5px] font-bold" style={{ color: "var(--wc-mute)" }}>
                  {side.label}
                </p>
                {side.rows.length === 0 ? (
                  <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
                    보고된 결장자 없음
                  </p>
                ) : (
                  <ul className="mt-1 space-y-[3px]">
                    {side.rows.map((r, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-[12.5px]">
                        <span className="font-bold" style={{ color: "var(--wc-ink)" }}>
                          {r.name}
                        </span>
                        <span className="text-[11.5px]" style={{ color: "var(--wc-mute-2)" }}>
                          {r.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {p.officials.length > 0 && (
        <Panel title="심판">
          <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
            {p.officials.map((o, i) => (
              <li key={i} className="text-[12.5px]">
                <span style={{ color: "var(--wc-mute)" }}>{o.role} </span>
                <span className="font-bold" style={{ color: "var(--wc-ink)" }}>
                  {o.name}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
