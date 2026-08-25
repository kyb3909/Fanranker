import type { Metadata } from "next"
import Image from "next/image"
import { NotFoundActions } from "@/components/not-found-actions"

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px] text-center">
        <Image
          src="/mascot/cry.webp"
          alt=""
          width={204}
          height={198}
          className="mx-auto mb-1 h-auto w-[150px] select-none"
          draggable={false}
        />
        <div className="text-primary text-[68px] leading-none font-black tracking-tight">404</div>
        <h1
          className="text-foreground mt-3 text-[20px] font-extrabold"
          style={{ wordBreak: "keep-all" }}
        >
          앗, 공이 골대 밖으로 나갔어요
        </h1>
        <p
          className="text-muted-foreground mx-auto mt-2 text-sm leading-relaxed"
          style={{ wordBreak: "keep-all" }}
        >
          찾으시는 페이지가 없거나 주소가 바뀌었어요.
          <br />
          마스코트도 한참 찾아봤지만 안 보이네요...
        </p>
        <NotFoundActions />
        <p className="text-muted-foreground/70 mt-7 text-[12px] italic">
          “내가 분명 여기 어디 차 놨는데...” — 주인장
        </p>
      </div>
    </div>
  )
}
