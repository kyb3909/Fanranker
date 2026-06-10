import { redirect } from "next/navigation"

export default function GamesPage() {
  // 갈드컵 절제(Phase 2)로 현행 메인 게임인 드래프트로 보냄
  redirect("/games/draft")
}
