"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TarotReader } from "@/components/tarot/tarot-reader"

/**
 * 타로 리딩 모달 — 떡밥 카드에서 페이지를 떠나지 않고 본다 (2026-08-12 운영자 요청).
 *
 * ## 왜 모달인가
 * 카드의 "이 경기 흐름, 카드로 볼까?"가 /tarot 으로 페이지를 전환했다. 그러면 읽던
 * 피드 위치를 잃고, 타로를 보고 나서 돌아오려면 뒤로가기를 눌러야 한다 — 재미로
 * 한 번 눌러보는 성격의 진입점에 치르기엔 비싼 대가다. 모달은 원래 자리를 지킨다.
 *
 * /tarot 페이지는 그대로 둔다(GNB·공유 링크의 착지점). 리딩 UI 는 TarotReader 하나를
 * 두 표면이 공유하므로 갈라지지 않는다.
 *
 * ## 열릴 때만 마운트하는 이유
 * Dialog 가 닫히면 Radix 가 내용을 언마운트하므로, 다시 열면 질문·결과가 초기화된
 * 상태로 시작한다. 다른 기사에서 열었는데 이전 기사의 리딩이 남아 있으면 안 된다.
 */
export function TarotModal({
  question,
  open,
  onOpenChange,
}: {
  /** 기사 제목에서 만든 프리필 질문 (lib/tarot/suggest) */
  question: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        ⚠️ worldcup-scope 가 **필수**다. --wc-* 토큰은 app/worldcup/wc-tokens.css 에서
        `.worldcup-scope` 안에서만 유효한데(격리 규칙), Radix Dialog 는 body 로 portal 하므로
        AppShellClient 의 전역 wrapper 밖으로 나간다. 빼면 변수가 전부 미해석되어
        배경이 투명해지고 뒤 피드가 비쳐 보인다(실측). 이 저장소의 기존 모달들은
        shadcn 토큰(bg-background 등)만 써서 이 문제를 겪지 않았다 — 여기가 첫 사례다.

        리딩 결과(카드 3장 + 해석)가 길어 화면을 넘긴다 — 내부 스크롤로 가둔다.
      */}
      <DialogContent
        className="worldcup-scope max-h-[92dvh] overflow-y-auto p-5 sm:max-w-[560px]"
        style={{ background: "var(--wc-paper)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            루나의 축구 점집
          </DialogTitle>
        </DialogHeader>
        <TarotReader initialQuestion={question} inModal />
      </DialogContent>
    </Dialog>
  )
}
