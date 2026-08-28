"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import {
  Check,
  Coins,
  Palette,
  RefreshCcw,
  Rotate3D,
  ScanFace,
  Shirt,
  ShoppingBag,
} from "lucide-react"
import type { ChibiCameraView } from "@/lib/metaverse/avatar3d/chibi-spec"
import type { AvatarMotion, ChibiAvatarLab } from "@/lib/metaverse/avatar3d/create-chibi-avatar-lab"
import {
  DEFAULT_AVATAR_APPEARANCE,
  EYE_COLORS,
  EYE_SHAPES,
  FACE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  type AvatarAppearance,
} from "@/lib/metaverse/avatar3d/appearance"
import { createInitialKitStore, kitStoreReducer, ownsKit } from "@/lib/metaverse/avatar3d/kit-store"
import {
  AVAILABLE_CLUBS,
  DEFAULT_KIT_KEY,
  getKit,
  getKitsForClub,
  type ClubKey,
  type KitItem,
} from "@/lib/metaverse/avatar3d/kits"

// Start fetching the Babylon chunk as soon as this client bundle runs instead
// of waiting for React effects to flush after hydration.
const avatarLabModulePromise = import("@/lib/metaverse/avatar3d/create-chibi-avatar-lab")

const views: Array<{ value: ChibiCameraView; label: string }> = [
  { value: "front", label: "정면" },
  { value: "three-quarter", label: "3/4" },
  { value: "side", label: "측면" },
]

const motions: Array<{ value: AvatarMotion; label: string }> = [
  { value: "idle", label: "대기" },
  { value: "walk", label: "걷기" },
  { value: "run", label: "달리기" },
  { value: "cheer", label: "환호" },
  { value: "kick", label: "슛" },
  { value: "jump", label: "점프" },
]

const rarityLabel = {
  starter: "기본",
  common: "일반",
  rare: "희귀",
  elite: "엘리트",
} as const

function KitThumbnail({ kit }: { kit: KitItem }) {
  const { palette } = kit
  const pattern = kit.pattern ?? "plain"

  return (
    <div
      className="relative mx-auto h-28 w-28 overflow-hidden rounded-2xl border border-white/10 bg-slate-900"
      aria-hidden="true"
    >
      <div
        className="absolute top-3 left-[31px] h-12 w-[50px] rounded-t-lg"
        style={{ backgroundColor: palette.primary }}
      >
        <div
          className="absolute inset-y-0 left-0 w-2 rounded-l-md"
          style={{ backgroundColor: palette.secondary }}
        />
        <div
          className="absolute inset-y-0 right-0 w-2 rounded-r-md"
          style={{ backgroundColor: palette.secondary }}
        />
        <div
          className="absolute top-0 left-1/2 h-2 w-5 -translate-x-1/2 rounded-b-full"
          style={{ backgroundColor: palette.dark }}
        />
        {pattern === "chevron" ? (
          <div
            className="absolute right-3 bottom-3 left-3 h-1 rotate-[-8deg] rounded-full"
            style={{ backgroundColor: palette.accent }}
          />
        ) : null}
        {pattern === "vertical-stripes" ? (
          <div className="absolute inset-y-0 right-2 left-2 flex justify-evenly overflow-hidden">
            {[0, 1, 2].map((stripe) => (
              <div
                key={stripe}
                className="h-full w-2"
                style={{ backgroundColor: palette.accent }}
              />
            ))}
          </div>
        ) : null}
        {pattern === "center-stripe" ? (
          <div
            className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2"
            style={{ backgroundColor: palette.accent }}
          />
        ) : null}
        {pattern === "split" ? (
          <div
            className="absolute inset-y-0 right-0 w-1/2"
            style={{ backgroundColor: palette.accent }}
          />
        ) : null}
        {pattern === "hoops" ? (
          <div className="absolute inset-x-0 top-4 flex flex-col gap-2">
            <div className="h-2" style={{ backgroundColor: palette.accent }} />
            <div className="h-2" style={{ backgroundColor: palette.accent }} />
          </div>
        ) : null}
        {pattern === "vertical-gradient" ? (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${palette.primary}, ${palette.secondary})`,
            }}
          />
        ) : null}
        {pattern === "tonal-geometric" ? (
          <div
            className="absolute inset-0 opacity-45"
            style={{
              backgroundImage: `repeating-linear-gradient(135deg, transparent 0 7px, ${palette.secondary} 7px 11px)`,
            }}
          />
        ) : null}
        {pattern === "flow-streak" ? (
          <div
            className="absolute inset-0 opacity-90"
            style={{
              background: `linear-gradient(120deg, transparent 0 38%, ${palette.secondary} 42% 51%, ${palette.accent} 56% 64%, transparent 69%)`,
            }}
          />
        ) : null}
        {pattern === "tonal-texture" ? (
          <div
            className="absolute inset-0 opacity-70"
            style={{
              backgroundImage: `radial-gradient(circle at 25% 30%, ${palette.accent} 0 2px, transparent 3px), radial-gradient(circle at 72% 68%, ${palette.secondary} 0 3px, transparent 4px)`,
              backgroundSize: "18px 18px, 22px 22px",
            }}
          />
        ) : null}
      </div>
      <div
        className="absolute top-4 left-[19px] h-8 w-3 rotate-6 rounded-md"
        style={{ backgroundColor: palette.secondary }}
      />
      <div
        className="absolute top-4 right-[19px] h-8 w-3 -rotate-6 rounded-md"
        style={{ backgroundColor: palette.secondary }}
      />
      {kit.design === "contrast-raglan" ? (
        <>
          <div
            className="absolute top-[14px] left-[36px] h-2 w-4 -rotate-12 rounded-sm"
            style={{ backgroundColor: palette.dark }}
          />
          <div
            className="absolute top-[14px] right-[36px] h-2 w-4 rotate-12 rounded-sm"
            style={{ backgroundColor: palette.dark }}
          />
          <div
            className="absolute top-[33px] left-[31px] h-8 w-1 rounded-full"
            style={{ backgroundColor: palette.dark }}
          />
          <div
            className="absolute top-[33px] right-[31px] h-8 w-1 rounded-full"
            style={{ backgroundColor: palette.dark }}
          />
        </>
      ) : null}
      <div
        className="absolute top-[62px] left-[36px] h-7 w-5 rounded-b-md"
        style={{ backgroundColor: palette.shorts }}
      />
      <div
        className="absolute top-[62px] right-[36px] h-7 w-5 rounded-b-md"
        style={{ backgroundColor: palette.shorts }}
      />
      <div
        className="absolute bottom-3 left-[39px] h-7 w-3 rounded-b-sm"
        style={{ backgroundColor: palette.socks }}
      />
      <div
        className="absolute right-[39px] bottom-3 h-7 w-3 rounded-b-sm"
        style={{ backgroundColor: palette.socks }}
      />
      <div
        className="absolute bottom-2 left-[34px] h-2 w-5 rounded-sm"
        style={{ backgroundColor: palette.boots, borderBottom: `2px solid ${palette.sole}` }}
      />
      <div
        className="absolute right-[34px] bottom-2 h-2 w-5 rounded-sm"
        style={{ backgroundColor: palette.boots, borderBottom: `2px solid ${palette.sole}` }}
      />
    </div>
  )
}

export function AvatarLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labRef = useRef<ChibiAvatarLab | null>(null)
  const purchaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ChibiCameraView>("front")
  const [autoRotate, setAutoRotate] = useState(false)
  const [motion, setMotion] = useState<AvatarMotion>("idle")
  const [appearance, setAppearance] = useState<AvatarAppearance>(DEFAULT_AVATAR_APPEARANCE)
  const [selectedClubKey, setSelectedClubKey] = useState<ClubKey>("arsenal")
  const [kitState, dispatchKit] = useReducer(kitStoreReducer, undefined, createInitialKitStore)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (!canvasRef.current) return

      try {
        const { createChibiAvatarLab } = await avatarLabModulePromise
        if (cancelled || !canvasRef.current) return

        const lab = await createChibiAvatarLab(canvasRef.current)
        if (cancelled) {
          lab.dispose()
          return
        }
        lab.setView("front")
        await lab.setKit(getKit(DEFAULT_KIT_KEY))
        lab.setAppearance(DEFAULT_AVATAR_APPEARANCE)
        labRef.current = lab
        setIsReady(true)
      } catch (cause) {
        console.error("Failed to initialize avatar lab", cause)
        setError("3D 미리보기를 시작하지 못했습니다.")
      }
    }

    void boot()

    return () => {
      cancelled = true
      if (purchaseTimerRef.current) clearTimeout(purchaseTimerRef.current)
      labRef.current?.dispose()
      labRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isReady) return
    void labRef.current?.setKit(getKit(kitState.previewKitKey))
  }, [isReady, kitState.previewKitKey])

  useEffect(() => {
    if (!isReady) return
    labRef.current?.setAppearance(appearance)
  }, [appearance, isReady])

  function changeAppearance<Key extends keyof AvatarAppearance>(
    key: Key,
    value: AvatarAppearance[Key]
  ) {
    setAppearance((current) => ({ ...current, [key]: value }))
  }

  function selectView(nextView: ChibiCameraView) {
    setView(nextView)
    setAutoRotate(false)
    labRef.current?.setAutoRotate(false)
    labRef.current?.setView(nextView)
  }

  function toggleAutoRotate() {
    const next = !autoRotate
    setAutoRotate(next)
    labRef.current?.setAutoRotate(next)
  }

  function runKitAction(kit: KitItem) {
    if (ownsKit(kitState, kit.kitKey)) {
      dispatchKit({ type: "equip", kitKey: kit.kitKey })
      return
    }

    if (kitState.pendingKitKey || kitState.balanceGold < kit.priceGold) return

    dispatchKit({ type: "purchase-start", kitKey: kit.kitKey })
    purchaseTimerRef.current = setTimeout(() => {
      dispatchKit({ type: "purchase-success", kitKey: kit.kitKey })
      purchaseTimerRef.current = null
    }, 320)
  }

  function selectClub(clubKey: ClubKey) {
    const firstKit = getKitsForClub(clubKey)[0]
    if (!firstKit) return
    setSelectedClubKey(clubKey)
    dispatchKit({ type: "preview", kitKey: firstKit.kitKey })
  }

  function resetShop() {
    if (purchaseTimerRef.current) {
      clearTimeout(purchaseTimerRef.current)
      purchaseTimerRef.current = null
    }
    dispatchKit({ type: "reset" })
  }

  const previewKit = getKit(kitState.previewKitKey)
  const visibleKits = getKitsForClub(selectedClubKey)

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-950 shadow-2xl shadow-slate-950/20">
          <div
            data-avatar-stage
            className="relative aspect-[4/5] min-h-[520px] w-full sm:aspect-[16/10]"
          >
            <canvas
              ref={canvasRef}
              aria-label="저폴리 치비 캐릭터 GLB 미리보기"
              className="h-full w-full touch-none outline-none"
            />

            {!isReady && !error && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950 text-sm text-slate-300">
                캐릭터 랩을 준비하고 있습니다…
              </div>
            )}

            {error && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950 px-6 text-center text-sm text-rose-300">
                {error}
              </div>
            )}

            <div className="pointer-events-none absolute top-4 left-4 rounded-full border border-white/10 bg-slate-950/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
              미리보기 · {previewKit.name}
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-slate-950/85 to-transparent px-4 pt-16 pb-4">
              <p className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs text-slate-300 backdrop-blur">
                드래그로 회전 · 휠 또는 핀치로 확대
              </p>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex items-center gap-2">
              <ScanFace className="h-5 w-5 text-indigo-500" />
              <h2 className="font-semibold">캐릭터 상태</h2>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-slate-500">전체 비율</dt>
              <dd className="text-right font-semibold">약 2.7등신</dd>
              <dt className="text-slate-500">관절 방식</dt>
              <dd className="text-right font-semibold">Rigid joint</dd>
              <dt className="text-slate-500">착용 중</dt>
              <dd
                data-equipped-kit={kitState.equippedKitKey}
                className="text-right font-semibold text-indigo-600 dark:text-indigo-400"
              >
                {getKit(kitState.equippedKitKey).name}
              </dd>
              <dt className="text-slate-500">보유 유니폼</dt>
              <dd
                data-owned-kit-count={kitState.ownedKitKeys.length}
                className="text-right font-semibold"
              >
                {kitState.ownedKitKeys.length}벌
              </dd>
            </dl>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <h2 className="mb-3 text-sm font-semibold">카메라</h2>
            <div className="grid grid-cols-3 gap-2">
              {views.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => selectView(item.value)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    view === item.value && !autoRotate
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                      : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <h2 className="mt-4 mb-3 text-sm font-semibold">모션</h2>
            <div className="grid grid-cols-3 gap-2">
              {motions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setMotion(item.value)
                    labRef.current?.setMotion(item.value)
                  }}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    motion === item.value
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                      : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleAutoRotate}
              className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                autoRotate
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
              }`}
            >
              <Rotate3D className="h-4 w-4" />
              자동 회전
            </button>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex items-center gap-2">
              <Palette className="h-5 w-5 text-fuchsia-500" />
              <h2 className="font-semibold">외모 커스터마이징</h2>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">피부색</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SKIN_TONES).map(([key, tone]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        changeAppearance("skinTone", key as AvatarAppearance["skinTone"])
                      }
                      className={`h-9 w-9 rounded-full border-2 transition ${
                        appearance.skinTone === key
                          ? "border-indigo-500 ring-2 ring-indigo-500/25"
                          : "border-white shadow-sm ring-1 ring-slate-300"
                      }`}
                      style={{ backgroundColor: tone.color }}
                      aria-label={`피부색 ${tone.label}`}
                      title={tone.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">머리색</p>
                <p className="mb-2 text-xs font-semibold text-slate-500">헤어스타일</p>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {Object.entries(HAIR_STYLES).map(([key, style]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        changeAppearance("hairStyle", key as AvatarAppearance["hairStyle"])
                      }
                      className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                        appearance.hairStyle === key
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                          : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(HAIR_COLORS).map(([key, hair]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        changeAppearance("hairColor", key as AvatarAppearance["hairColor"])
                      }
                      className={`h-9 w-9 rounded-full border-2 transition ${
                        appearance.hairColor === key
                          ? "border-indigo-500 ring-2 ring-indigo-500/25"
                          : "border-white shadow-sm ring-1 ring-slate-300"
                      }`}
                      style={{ backgroundColor: hair.color }}
                      aria-label={`머리색 ${hair.label}`}
                      title={hair.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">눈동자색</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(EYE_COLORS).map(([key, eye]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        changeAppearance("eyeColor", key as AvatarAppearance["eyeColor"])
                      }
                      className={`h-9 w-9 rounded-full border-2 transition ${
                        appearance.eyeColor === key
                          ? "border-indigo-500 ring-2 ring-indigo-500/25"
                          : "border-white shadow-sm ring-1 ring-slate-300"
                      }`}
                      style={{ backgroundColor: eye.color }}
                      aria-label={`눈동자색 ${eye.label}`}
                      title={eye.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">눈매</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(EYE_SHAPES).map(([key, shape]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        changeAppearance("eyeShape", key as AvatarAppearance["eyeShape"])
                      }
                      className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                        appearance.eyeShape === key
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                          : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
                      }`}
                    >
                      {shape.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">표정 프리셋</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(FACE_STYLES).map(([key, style]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        changeAppearance("faceStyle", key as AvatarAppearance["faceStyle"])
                      }
                      className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                        appearance.faceStyle === key
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                          : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <h2 className="font-semibold">현재 구현 범위</h2>
            <p className="mt-2">
              이번 랩은 로컬 골드로 구매 흐름을 검증합니다. 다음 단계에서 같은 계약을 Supabase 원자
              구매 RPC로 교체합니다.
            </p>
          </section>
        </aside>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-indigo-500" />
              <h2 className="text-xl font-bold">유니폼 상점</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              카드를 누르면 무료로 미리 보고, 구매한 유니폼만 착용할 수 있습니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              data-shop-balance={kitState.balanceGold}
              className="flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-950"
            >
              <Coins className="h-4 w-4" />
              {kitState.balanceGold.toLocaleString("ko-KR")} G
            </div>
            <button
              type="button"
              onClick={resetShop}
              data-shop-reset
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold hover:border-slate-400 dark:border-slate-700"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              초기화
            </button>
          </div>
        </div>

        {kitState.notice && (
          <p
            aria-live="polite"
            className="mt-4 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
          >
            {kitState.notice}
          </p>
        )}

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="구단 컬렉션">
          {AVAILABLE_CLUBS.map((club) => (
            <button
              key={club.clubKey}
              type="button"
              onClick={() => selectClub(club.clubKey)}
              data-club-key={club.clubKey}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                selectedClubKey === club.clubKey
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
              }`}
              title={`${club.referenceName} 컬러에서 영감을 받은 비공식 컬렉션`}
            >
              {club.storeLabel}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleKits.map((kit) => {
            const isOwned = ownsKit(kitState, kit.kitKey)
            const isEquipped = kitState.equippedKitKey === kit.kitKey
            const isPreviewed = kitState.previewKitKey === kit.kitKey
            const isPending = kitState.pendingKitKey === kit.kitKey
            const isInsufficient = !isOwned && kitState.balanceGold < kit.priceGold

            return (
              <article
                key={kit.kitKey}
                data-kit-key={kit.kitKey}
                data-kit-owned={isOwned}
                data-kit-equipped={isEquipped}
                className={`rounded-2xl border p-3 transition ${
                  isPreviewed
                    ? "border-indigo-500 ring-2 ring-indigo-500/15"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => dispatchKit({ type: "preview", kitKey: kit.kitKey })}
                  data-kit-preview
                  className="w-full text-left"
                  aria-label={`${kit.name} 미리보기`}
                >
                  <KitThumbnail kit={kit} />
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{kit.name}</p>
                      <p className="text-xs text-slate-500">{kit.collection}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {rarityLabel[kit.rarity]}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => runKitAction(kit)}
                  data-kit-action
                  disabled={
                    isEquipped ||
                    isPending ||
                    isInsufficient ||
                    Boolean(kitState.pendingKitKey && !isPending)
                  }
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed ${
                    isEquipped
                      ? "bg-emerald-100 text-emerald-800"
                      : isInsufficient
                        ? "bg-slate-100 text-slate-400 dark:bg-slate-900"
                        : "bg-slate-950 text-white hover:bg-indigo-700 dark:bg-white dark:text-slate-950"
                  }`}
                >
                  {isEquipped ? (
                    <>
                      <Check className="h-4 w-4" /> 착용 중
                    </>
                  ) : isPending ? (
                    "구매 처리 중…"
                  ) : isOwned ? (
                    <>
                      <Shirt className="h-4 w-4" /> 착용
                    </>
                  ) : isInsufficient ? (
                    "골드 부족"
                  ) : (
                    `${kit.priceGold.toLocaleString("ko-KR")} G 구매`
                  )}
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
