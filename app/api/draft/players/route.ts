import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { applyDictionaryNames } from "@/lib/draft/apply-dictionary"
import { apiBadRequest, apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * 판타지 선수 목록 — **사전을 입혀서** 내려준다 (2026-08-25).
 *
 * 종전엔 클라이언트가 `/data/<파일>.json` 을 직접 fetch 했다. 그래서 선수 이름이
 * JSON 에 박힌 값으로 고정됐고, 어드민에서 사전을 고쳐도 판타지는 안 바뀌었다.
 * 이 라우트가 그 사이에 들어가 이름만 사전으로 보정한다 — FPL 고유 데이터
 * (몸값·포인트·소유율)는 JSON 이 정본이라 그대로 통과시킨다.
 *
 * ⚠️ 파일명을 그대로 경로에 쓰지 않는다. `..` 이 섞이면 서버 파일을 아무거나 읽게 된다.
 */

/** 허용된 데이터 파일 — games-catalog.ts 의 dataFile 목록과 같아야 한다 */
const ALLOWED_FILES = new Set(["fpl-players.json", "arsenal-players.json"])

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file") ?? "arsenal-players.json"
  if (!ALLOWED_FILES.has(file)) return apiBadRequest(`허용되지 않은 데이터 파일: ${file}`)

  try {
    const raw = await fs.readFile(path.join(process.cwd(), "public", "data", file), "utf-8")
    const players = JSON.parse(raw) as { name: string; nameKo: string; teamKo: string }[]
    const withNames = await applyDictionaryNames(players)
    return NextResponse.json(withNames, {
      // 사전 반영이 10분 안에 보이게 — cachedDict 의 revalidate 와 맞춘다
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
    })
  } catch (error) {
    return apiError("선수 데이터를 불러오지 못했습니다.", 500, error)
  }
}
