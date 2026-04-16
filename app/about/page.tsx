import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "회사 소개",
  description: "gongnori.fan 소개 — 스포츠 팬들을 위한 예측 + 커뮤니티 플랫폼",
  alternates: { canonical: "/about" },
}

export default function AboutPage() {
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6" tabIndex={-1}>
      <BackButton />
      <Card className="border-border bg-card mt-4 border p-6">
        <h1 className="text-foreground mb-4 text-2xl font-bold">gongnori.fan 소개</h1>
        <div className="text-muted-foreground space-y-4 leading-relaxed">
          <p>
            <strong className="text-foreground">그깟 공놀이를 좋아하는 팬들의 놀이터.</strong>{" "}
            스포츠 팬들이 경기 결과를 가볍게 예측하고, 응원하는 팀과 선수에 대해 이야기하는 커뮤니티
            서비스입니다.
          </p>
          <p>
            매일 무료로 지급되는 볼(토큰)로 실제 프로토 배당률에 맞춰 승부를 예측합니다. 적중률은
            누적되어 랭킹으로 기록되고, 축구·야구·농구·배구 종목별 적중률도 따로 집계됩니다. 감에
            의존하는 공허한 예측이 아니라, 증명된 적중률을 가진 팬이 스스로를 드러낼 수 있는
            공간입니다.
          </p>
          <p>
            예측 외에도 게시판별 커뮤니티, 기자 분석글, 팀 경기장 건설, 팬타지 드래프트 같은 게임형
            컨텐츠가 열려 있습니다. 스포츠가 삶에서 사라지지 않는 모든 팬이 하루에 한 번쯤 들를
            만한, 가볍고 즐거운 놀이터를 지향합니다.
          </p>
        </div>
      </Card>
    </main>
  )
}
