import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "공놀이판 소개",
  description: "공놀이판 소개 — 스포츠 팬들을 위한 예측과 커뮤니티 놀이터",
  alternates: { canonical: "/about" },
}

export default function AboutPage() {
  return (
    <main
      id="main-content"
      className="worldcup-scope mx-auto max-w-[720px] px-4 py-5 sm:px-6 sm:py-6"
      tabIndex={-1}
    >
      <BackButton />
      <Card
        className="mt-4 p-6"
        style={{ border: "1px solid var(--wc-line)", background: "var(--wc-card)" }}
      >
        <h1 className="mb-4" style={{ fontSize: 22, fontWeight: 900, color: "var(--wc-ink)" }}>
          gongnori.fan 소개
        </h1>
        <div
          className="space-y-4"
          style={{ fontSize: 15, lineHeight: 1.75, color: "var(--wc-mute)" }}
        >
          <p>
            <strong className="text-foreground">
              공놀이는 그깟 공놀이에 진심인 팬들이 모이는 놀이터입니다.
            </strong>{" "}
            오늘 경기 결과를 가볍게 예측하고, 응원하는 팀과 선수 이야기를 마음껏 나눌 수 있는 스포츠
            팬 커뮤니티입니다.
          </p>
          <p>
            매일 무료로 받는 볼로 경기 결과를 예측하고, 맞힌 기록은 랭킹으로 쌓입니다. 전체 적중률은
            물론 축구·야구·농구·배구 종목별 기록도 따로 남아요. 감으로 던지는 한마디에서 끝나지
            않고, 내가 얼마나 잘 예측하는 팬인지 기록으로 보여줄 수 있습니다.
          </p>
          <p>
            공놀이는 예측만 하는 곳이 아닙니다. 담벼락에서 떠들고, 운동장에서 관심 게시판을 찾고,
            분석글을 읽고, 팀 경기장을 키우고, 드래프트 게임으로 나만의 팀을 만들 수 있어요.
            스포츠가 하루에서 쉽게 사라지지 않는 사람들을 위한, 가볍지만 진심인 팬들의 놀이터를
            지향합니다.
          </p>
        </div>
      </Card>
    </main>
  )
}
