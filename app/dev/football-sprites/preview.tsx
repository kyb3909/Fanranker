"use client"

import { useEffect, useRef, useState } from "react"
import { FootballSprite } from "@/components/football-sprite"
import { EASTER_EGG_VISIBLE_MS, FOOTBALL_SPRITES } from "@/lib/football-easter-eggs"
import { Button } from "@/components/ui/button"
import styles from "@/components/football-easter-egg.module.css"

const labels = [
  "가부좌 공중부양",
  "카메라 세리머니",
  "회전 후 시우 착지",
  "트로피와 산책",
  "교차한 팔과 두 엄지",
]
const turnFrames = [
  { frame: 0, label: "준비" },
  { frame: 3, label: "도약" },
  { frame: 5, label: "옆으로 회전" },
  { frame: 7, label: "공중 뒷모습" },
  { frame: 9, label: "착지" },
  { frame: 11, label: "시우 자세" },
]

function FootballSpriteDemo() {
  const nextRun = useRef(0)
  const [run, setRun] = useState<{
    id: number
    character: (typeof FOOTBALL_SPRITES)[number]
  } | null>(null)
  const [status, setStatus] = useState<"ready" | "loading" | "playing" | "done" | "error">("ready")
  useEffect(() => {
    if (!run || (status !== "loading" && status !== "playing")) return
    // Start the visit clock after the image arrives, so a slow fetch cannot consume the demo.
    const timer = setTimeout(
      () => {
        setRun(null)
        setStatus(status === "loading" ? "error" : "done")
      },
      status === "loading" ? 15_000 : EASTER_EGG_VISIBLE_MS
    )
    return () => clearTimeout(timer)
  }, [run, status])
  const messages = {
    ready: "버튼을 누르면 아래에 바로 나타납니다.",
    loading: "캐릭터를 불러오는 중입니다…",
    playing: "재생 중 · 잠시 움직인 뒤 사라집니다.",
    done: "재생 완료 · 버튼을 누르면 다시 볼 수 있습니다.",
    error: "이미지를 불러오지 못했습니다. 다시 재생해 주세요.",
  }
  return (
    <section
      className="space-y-3 rounded-xl border p-5"
      style={{ borderColor: "var(--wc-line)", background: "var(--wc-card)" }}
    >
      <h2 className="text-[16px] font-bold">작은 화면 보호기</h2>
      <p className="text-[14px]" style={{ color: "var(--wc-mute)" }}>
        이곳에서는 기다리지 않고 동작을 확인할 수 있습니다. 체험 중에는 마우스를 움직여도 사라지지
        않습니다. 사이트에서는 20초간 조작이 없을 때 구석에 나타납니다.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          nextRun.current = Math.max(Date.now(), nextRun.current + 1)
          setRun({
            id: nextRun.current,
            character: FOOTBALL_SPRITES[Math.floor(Math.random() * FOOTBALL_SPRITES.length)],
          })
          setStatus("loading")
        }}
      >
        지금 바로 재생
      </Button>
      <div
        data-football-preview
        className="relative flex h-64 flex-col items-center justify-center gap-3 overflow-hidden rounded-xl"
        style={{ background: "var(--wc-soft)" }}
      >
        <p
          role="status"
          className="px-4 text-center text-[13px]"
          style={{ color: "var(--wc-mute)" }}
        >
          {messages[status]}
        </p>
        <div className="h-32 w-32 shrink-0">
          {run && (
            <span
              key={run.id}
              className={`block h-full w-full ${status === "playing" ? styles.appearance : "invisible"}`}
              style={{ animationDuration: `${EASTER_EGG_VISIBLE_MS}ms` }}
            >
              <FootballSprite
                character={run.character}
                animated
                playbackId={run.id}
                onLoad={() => setStatus("playing")}
                onError={() => {
                  setRun(null)
                  setStatus("error")
                }}
              />
            </span>
          )}
        </div>
        <p className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
          실제 등장 크기 · 128px
        </p>
      </div>
    </section>
  )
}

export function FootballSpritePreview() {
  const [playing, setPlaying] = useState(true)
  const [galleryRun, setGalleryRun] = useState(1)
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header className="space-y-3">
        <h1 className="text-[26px] font-bold">구석의 작은 세리머니</h1>
        <p className="text-[14px]" style={{ color: "var(--wc-mute)" }}>
          선수마다 다른 시그니처. 가부좌는 금발 캐릭터만 합니다.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            if (!playing) setGalleryRun((value) => value + 1)
            setPlaying(!playing)
          }}
        >
          {playing ? "잠깐 숨기기" : "다시 재생"}
        </Button>
      </header>
      <FootballSpriteDemo />
      <div className="grid gap-4 sm:grid-cols-3">
        {FOOTBALL_SPRITES.map((character, index) => (
          <section
            key={character}
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--wc-line)" }}
          >
            <div className="p-5" style={{ background: "var(--wc-card)" }}>
              <h2 className="text-[14px] font-bold">{labels[index]}</h2>
              <div className="mx-auto my-4 h-32 w-32">
                {playing && (
                  <FootballSprite character={character} animated playbackId={galleryRun} />
                )}
              </div>
              <p className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
                밝은 배경 · 128px
              </p>
            </div>
            <div
              className="flex flex-col items-center gap-3 p-5"
              style={{ background: "var(--gn-night)", color: "var(--gn-cream)" }}
            >
              <span className="text-[12px]">어두운 배경 · 128px</span>
              <div className="h-32 w-32">
                {playing && (
                  <FootballSprite character={character} animated playbackId={galleryRun} />
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-[16px] font-bold">호날두 회전 동작 · 여섯 단계</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {turnFrames.map(({ frame, label }) => (
            <div key={frame} className="text-center">
              <div
                aria-hidden
                className="mx-auto h-32 w-32"
                style={{
                  backgroundImage: "url(/easter-eggs/red-jump-sheet.png)",
                  backgroundSize: "3072px 128px",
                  backgroundPosition: `${-frame * 128}px 0`,
                  backgroundRepeat: "no-repeat",
                  imageRendering: "pixelated",
                }}
              />
              <p className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3 text-[14px]" style={{ color: "var(--wc-mute)" }}>
        <h2 className="font-bold" style={{ color: "var(--wc-ink)" }}>
          사이트에서 만나는 방식
        </h2>
        <p>
          20초간 조작이 없으면 한 명이 나타납니다. 캐릭터와 위치는 랜덤입니다. 보이는
          푸터·사이드바·경기 일정의 여백을 고르고, 없으면 화면 아래 구석에 잠깐 들릅니다.
        </p>
        <p>
          최대 4.8초간 움직이고 사라집니다. 마우스·스크롤·입력을 다시 시작하면 바로 숨습니다. 한 번
          만난 뒤에는 최소 90초 동안 쉬어 갑니다. 입력칸과 열린 대화상자에서는 쉬어 갑니다.
        </p>
        <p>128px 크기로 등장합니다. 동작 줄이기 설정을 사용하면 정지 그림으로 표시합니다.</p>
      </section>
    </main>
  )
}
