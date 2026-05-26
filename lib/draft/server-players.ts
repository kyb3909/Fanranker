/**
 * 서버 사이드 선수 데이터 로드.
 *
 * 클라이언트는 /data/fpl-players.json 을 fetch 로 가져오지만,
 * Next.js API route 안에서는 fs 로 직접 읽어야 한다.
 * Cold start 1번만 disk I/O, 이후 메모리 캐시.
 */

import { promises as fs } from "fs"
import path from "path"
import type { Player } from "./players"

let cache: Player[] | null = null

export async function getServerPlayers(): Promise<Player[]> {
  if (cache) return cache
  const filePath = path.join(process.cwd(), "public", "data", "arsenal-players.json")
  const raw = await fs.readFile(filePath, "utf-8")
  cache = JSON.parse(raw) as Player[]
  return cache
}

export async function getServerPlayerById(id: string): Promise<Player | undefined> {
  const all = await getServerPlayers()
  return all.find((p) => p.id === id)
}
