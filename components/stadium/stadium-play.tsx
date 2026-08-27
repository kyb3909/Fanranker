"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { trackEvent } from "@/lib/analytics/events"
import { DEFAULT_KIT } from "@/lib/stadium/play-kit"

interface Props {
  teamId: string
  teamName: string
  stadiumName: string
  /** 시안 앱의 구장 키 (emirates·anfield …) */
  scene: string
  level: number
  /** 실제로 쌓인 벽돌 수 (렌더 블록 수가 아니다) */
  bricks: number
  /** 다음 레벨까지 남은 벽돌 */
  nextBricks: number
  /** 다음 레벨까지 진행률 0~1 — 지도 라벨과 같은 값 */
  levelPct: number
  /** 지금까지 지은 비율 0~1 (렌더 시공률 — 위 levelPct 와 다른 값이다) */
  built: number
}

declare global {
  interface Window {
    __setup?: (o: {
      team?: string
      pct?: number
      ghost?: boolean
      level?: number
      bricks?: number
      nextBricks?: number
      /** 레벨 진행률 — 위 pct(렌더 시공률)와 다른 값이다 */
      levelPct?: number
    }) => { total: number; built: number }
    __toggleGhost?: () => boolean
    /** 렌더러가 못 뜬 이유 — 정의돼 있으면 3D 는 죽은 것이다 */
    __stadiumError?: string
    /** 렌더러가 실제로 붙든 캔버스 — 지금 DOM 의 것과 다르면 3D 는 죽어 있다 */
    __stadiumCanvas?: HTMLCanvasElement
    __stadiumStop?: () => void
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-play="${src}"]`)
    if (existing) {
      if (existing.dataset.ready === "1") resolve()
      else existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error(src)))
      return
    }
    const el = document.createElement("script")
    el.src = src
    el.async = false
    el.dataset.play = src
    el.addEventListener("load", () => {
      el.dataset.ready = "1"
      resolve()
    })
    el.addEventListener("error", () => {
      // 실패한 태그를 남기면 재마운트가 이미 끝난 요청의 load 를 영영 기다린다
      el.remove()
      reject(new Error(src))
    })
    document.head.appendChild(el)
  })
}

/**
 * 경기장 입장 — 걸어다니는 3D 구장.
 *
 * 렌더러는 3D 시안 원본(public/stadium/play/stadium-app.js)을 그대로 쓴다. 시안이
 * DOM 을 id 로 직접 잡는 즉시실행 스크립트라, **필요한 마크업을 먼저 그려두고**
 * 그 다음에 스크립트를 붙인다. 순서가 바뀌면 앱이 null 을 잡고 죽는다.
 *
 * 지도 모달의 스틸과 같은 시공률로 열린다 — 지금 우리가 쌓은 만큼만 서 있는
 * 구장에 걸어 들어가는 것이 이 지면의 전부다.
 */
export function StadiumPlay({
  teamId,
  teamName,
  stadiumName,
  scene,
  level,
  bricks,
  nextBricks,
  levelPct,
  built,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading")
  const [ghost, setGhost] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await loadScript("/stadium/play/three.min.js")
        await loadScript("/stadium/play/stadium-app.js")
        if (!alive) return
        // ⚠️ optional chaining 으로 삼키면 안 된다. 앱이 죽어도 undefined 가 조용히
        //    돌아와 커버가 걷히고, 계측까지 성공으로 잡혀 실패율이 지표에서 사라진다.
        const ready = window.__setup?.({
          team: scene,
          pct: built,
          ghost: false,
          level,
          bricks,
          nextBricks,
          levelPct,
        })
        // 렌더러가 붙든 캔버스가 지금 DOM 의 것과 다르면 3D 는 이미 죽어 있다.
        // (앱이 즉시실행 1회성이라 클라이언트 내비로 재진입하면 벌어진다 — 감리 C11)
        // 지금은 진입 링크를 문서 이동으로 두어 이 경우가 나오지 않지만, 링크가
        // 하나라도 <Link> 로 되돌아가면 여기서 조용히 죽는 대신 폴백으로 잡는다.
        const bound = window.__stadiumCanvas
        if (!ready || window.__stadiumError || (bound && bound !== canvasRef.current)) {
          setState("failed")
          return
        }
        setState("ready")
        trackEvent({ name: "stadium_enter", params: { team_id: teamId, level } })
      } catch {
        if (alive) setState("failed")
      }
    })()
    return () => {
      alive = false
      // 루프를 세워 둔다 — 안 그러면 떠난 뒤에도 rAF 가 돌며 GPU·배터리를 태운다
      window.__stadiumStop?.()
    }
  }, [scene, built, teamId, level, bricks, nextBricks, levelPct])

  return (
    <div className="stadium-play-scope">
      <canvas id="scene" ref={canvasRef} />

      <div className="hud brief">
        {/* ⚠️ #stName 은 시안 앱이 구장명으로 덮어쓴다 — 여기 팀명을 넣으면 지워진다 */}
        <div className="kicker">{teamName}</div>
        <h1 id="stName">{stadiumName}</h1>
        <p>
          <span className="built-dot" />
          쌓인 벽돌
          {/* 청사진이 꺼져 있으면 화면에 없는 것을 설명하지 않는다 (감리 G12) */}
          {ghost && (
            <>
              {" "}
              <span className="ghost-dot" />
              남은 자리(청사진)
            </>
          )}
        </p>
        <p className="long" style={{ marginTop: 6 }}>
          팬들이 얹은 벽돌만큼 서 있는 구장입니다. 드래그로 돌리고, 입장해서 걸어보세요.
        </p>
      </div>

      <div className="hint">드래그 회전 · 휠 확대</div>
      <div id="toast" role="status" />

      <div className="hud bar">
        <div className="row">
          <div className="nums">
            <span id="count">0</span>{" "}
            <small>
              벽돌 · 다음 레벨까지 <span id="total">0</span>장
            </small>
          </div>
          <div className="pct" id="pct">
            0%
          </div>
        </div>
        <div className="track">
          <div id="fill" style={{ width: "0%" }} />
        </div>
        <div className="btns">
          <button id="enter" type="button">
            입장하기
          </button>
          <button
            type="button"
            onClick={() => setGhost(window.__toggleGhost?.() ?? false)}
            aria-pressed={ghost}
          >
            청사진 {ghost ? "끄기" : "보기"}
          </button>
          <button id="focus" type="button">
            동상 보기
          </button>
          {/* 시안의 개발용 버튼들 — 앱이 id 로 찾으므로 두되 화면에서는 감춘다 */}
          <button id="play" type="button" hidden />
          <button id="done" type="button" hidden />
          <button id="reset" type="button" hidden />
          <select id="stadium" aria-label="구장" hidden defaultValue={scene}>
            <option value="emirates">에미레이츠</option>
            <option value="oldtrafford">올드 트래포드</option>
            <option value="anfield">안필드</option>
            <option value="bridge">스탬퍼드 브리지</option>
            <option value="etihad">에티하드</option>
            <option value="spurs">토트넘</option>
          </select>
          {/* ⚠️ <Link>(클라이언트 내비) 로 바꾸지 말 것 — 렌더러가 즉시실행 1회성이라
              다시 들어올 때 3D 가 죽는다 (감리 C11). 문서 이동이라야 컨텍스트가 정리된다 */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 문서 이동이 목적이다 */}
          <a href="/stadium" className="play-back">
            지도로
          </a>
        </div>
      </div>

      <div className="kit" id="kitPanel">
        <h2>내 유니폼</h2>
        <div className="row">
          <span>상의</span>
          <input type="color" id="kShirt" defaultValue={DEFAULT_KIT.shirt} />
        </div>
        <div className="row">
          <span>하의</span>
          <input type="color" id="kShorts" defaultValue={DEFAULT_KIT.shorts} />
        </div>
        <div className="row">
          <span>스타킹</span>
          <input type="color" id="kSocks" defaultValue={DEFAULT_KIT.socks} />
        </div>
        <div className="row">
          <span>등번호</span>
          <input
            type="text"
            id="kNum"
            defaultValue={DEFAULT_KIT.number}
            maxLength={2}
            inputMode="numeric"
          />
        </div>
        <select id="kPreset" aria-label="킷 프리셋" defaultValue="">
          <option value="">킷 프리셋…</option>
          <option value="arsenal">아스날 홈</option>
          <option value="utd">맨유 홈</option>
          <option value="liverpool">리버풀 홈</option>
          <option value="chelsea">첼시 홈</option>
          <option value="city">맨시티 홈</option>
          <option value="spurs">토트넘 홈</option>
        </select>
      </div>

      <div className="chat" id="chatWrap">
        <input id="chatInput" type="text" maxLength={18} placeholder="채팅 입력 후 Enter" />
      </div>

      <div className="dpad" id="dpad">
        <button className="up" data-k="up" type="button" aria-label="앞으로">
          ▲
        </button>
        <button className="lf" data-k="left" type="button" aria-label="왼쪽">
          ◀
        </button>
        <button className="dn" data-k="down" type="button" aria-label="뒤로">
          ▼
        </button>
        <button className="rt" data-k="right" type="button" aria-label="오른쪽">
          ▶
        </button>
        <button className="kick" id="kick" type="button" aria-label="슛">
          ⚽
        </button>
      </div>

      {/* 시안 앱이 찾는 야간 표시 슬롯 — 화면에는 안 쓴다 */}
      <span id="night" hidden />

      {state !== "ready" && (
        <div className="play-cover">
          {state === "loading" ? (
            <p>구장을 세우는 중…</p>
          ) : (
            <div>
              <p>구장을 여는 데 실패했습니다.</p>
              <button
                type="button"
                className="play-cover__link"
                onClick={() => window.location.reload()}
              >
                다시 열기
              </button>
              <p style={{ marginTop: 10 }}>
                <Link href={`/stadium/${teamId}/build`}>벽돌 쌓으러 가기</Link>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
