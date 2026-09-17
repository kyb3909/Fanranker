import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StrictMode } from "react"
import { FootballSpritePreview } from "@/app/dev/football-sprites/preview"
import { FootballEasterEgg, FootballEasterEggProvider } from "@/components/football-easter-egg"
import {
  easterEggSlots,
  FOOTBALL_SPRITES,
  pickEasterEgg,
  EASTER_EGG_IDLE_MS,
  EASTER_EGG_COOLDOWN_MS,
  EASTER_EGG_RETRY_MS,
} from "@/lib/football-easter-eggs"

const navigation = vi.hoisted(() => ({ pathname: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }))

let clock = Date.UTC(2026, 8, 16)
const observers: VisibilityObserver[] = []
class VisibilityObserver {
  target: Element | null = null
  constructor(
    private callback: (
      entries: Pick<IntersectionObserverEntry, "target" | "isIntersecting" | "intersectionRatio">[]
    ) => void
  ) {
    observers.push(this)
  }
  observe(target: Element) {
    this.target = target
  }
  disconnect() {
    this.target = null
  }
  emit(ratio: number) {
    if (!this.target) return
    const entry = {
      target: this.target,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
    }
    this.callback([entry])
  }
}

function Page() {
  return (
    <StrictMode>
      <FootballEasterEggProvider>
        <button>기사 읽기</button>
        <input aria-label="댓글" />
        <FootballEasterEgg slot="footer" />
        <FootballEasterEgg slot="sidebar" />
        <FootballEasterEgg slot="fixtures" />
        <FootballEasterEgg slot="corner" />
        <FootballEasterEgg slot="corner-right" />
      </FootballEasterEggProvider>
    </StrictMode>
  )
}
function visibility(ratio: number) {
  act(() => observers.forEach((observer) => observer.emit(ratio)))
}
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  clock += 1_000_000
  vi.useFakeTimers()
  vi.setSystemTime(clock)
  sessionStorage.clear()
  navigation.pathname = "/"
  observers.length = 0
  vi.spyOn(Math, "random").mockReturnValue(0)
  vi.stubGlobal("IntersectionObserver", VisibilityObserver)
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true }))
  )
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("football visitors", () => {
  it("excludes account, editing, payment-like and admin flows before drawing randomness", () => {
    const random = vi.fn()
    for (const route of [
      "/admin/news-desk",
      "/sign-in",
      "/sign-up",
      "/write",
      "/post/a/edit",
      "/prediction",
      "/stadium/1/enter",
      "/my-page",
    ]) {
      expect(pickEasterEgg(route, true, random)).toBeNull()
    }
    expect(random).not.toHaveBeenCalled()
  })

  it("always picks an eligible visitor after idle, keeps mobile out of the sidebar, and can pick every signature", () => {
    expect(pickEasterEgg("/", true, () => 0.3)).not.toBeNull()
    expect(pickEasterEgg("/", true, () => 0.9)).not.toBeNull()
    expect(easterEggSlots("/", false)).toEqual(["footer", "corner", "corner-right"])
    for (let i = 0; i < FOOTBALL_SPRITES.length; i++) {
      const draws = [0.8, (i + 0.1) / FOOTBALL_SPRITES.length]
      expect(pickEasterEgg("/", true, () => draws.shift()!)).toEqual({
        slot: "sidebar",
        character: FOOTBALL_SPRITES[i],
      })
    }
  })

  it("loads one animated image after 20 quiet seconds with a visible corner, then removes it", () => {
    const { container } = render(<Page />)
    expect(container.querySelector("img")).toBeNull()
    visibility(0.5)
    tick(2000)
    expect(container.querySelector("img")).toBeNull()
    visibility(1)
    tick(EASTER_EGG_IDLE_MS - 2001)
    expect(container.querySelector("img")).toBeNull()
    tick(1)
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(container.querySelector("img")?.alt).toBe("")
    expect(container.querySelector("img")?.getAttribute("aria-hidden")).toBe("true")
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/\.gif\?visit=/)
    expect(container.querySelector("[data-football-visitor]")?.getAttribute("style")).toContain(
      "4800ms"
    )
    expect(container.querySelector("source")?.getAttribute("media")).toBe(
      "(prefers-reduced-motion: reduce)"
    )
    expect(container.querySelector("source")?.getAttribute("srcset")).toMatch(/\.png$/)
    expect(container.querySelectorAll("button")).toHaveLength(1)
    tick(4800)
    expect(container.querySelector("img")).toBeNull()
    visibility(0)
    visibility(1)
    tick(1000)
    expect(container.querySelector("img")).toBeNull()
  })

  it("cancels pending appearance on fast scrolling and page navigation", () => {
    const { container, rerender } = render(<Page />)
    visibility(1)
    tick(EASTER_EGG_IDLE_MS - 500)
    visibility(0)
    tick(EASTER_EGG_IDLE_MS)
    expect(container.querySelector("img")).toBeNull()
    visibility(1)
    tick(500)
    navigation.pathname = "/write"
    rerender(<Page />)
    tick(1000)
    expect(container.querySelector("img")).toBeNull()
  })

  it("keeps the cooldown across navigation and provider remounts even without storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("disabled")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled")
    })
    const first = render(<Page />)
    visibility(1)
    tick(EASTER_EGG_IDLE_MS)
    expect(first.container.querySelector("img")).not.toBeNull()
    first.unmount()
    navigation.pathname = "/matches"
    const next = render(<Page />)
    visibility(1)
    tick(EASTER_EGG_COOLDOWN_MS - 1)
    expect(next.container.querySelector("img")).toBeNull()
    tick(1)
    expect(next.container.querySelector("img")).not.toBeNull()
    navigation.pathname = "/search"
    next.rerender(<Page />)
    visibility(1)
    tick(EASTER_EGG_IDLE_MS)
    expect(next.container.querySelector("img")).toBeNull()
  })

  it("does not start in a background tab and hides when the tab becomes hidden", () => {
    const visibilityState = vi.spyOn(document, "visibilityState", "get")
    visibilityState.mockReturnValue("hidden")
    const { container } = render(<Page />)
    visibility(1)
    tick(2000)
    expect(container.querySelector("img")).toBeNull()
    visibilityState.mockReturnValue("visible")
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    tick(EASTER_EGG_IDLE_MS - 1)
    expect(container.querySelector("img")).toBeNull()
    tick(1)
    expect(container.querySelector("img")).not.toBeNull()
    visibilityState.mockReturnValue("hidden")
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(container.querySelector("img")).toBeNull()
  })

  it("chooses visible page details and falls back to the screen corner only when needed", () => {
    expect(pickEasterEgg("/", true, () => 0, [])).toBeNull()
    expect(pickEasterEgg("/", true, () => 0, ["corner"])).toMatchObject({ slot: "corner" })
    expect(pickEasterEgg("/", true, () => 0, ["sidebar", "corner"])).toMatchObject({
      slot: "sidebar",
    })
    expect(pickEasterEgg("/", false, () => 0, ["sidebar", "corner"])).toMatchObject({
      slot: "corner",
    })
    const { container } = render(<Page />)
    act(() =>
      observers.forEach((observer) =>
        observer.emit(observer.target?.getAttribute("data-football-corner") === "corner" ? 1 : 0)
      )
    )
    tick(EASTER_EGG_IDLE_MS)
    expect(container.querySelector('[data-football-corner="corner"] img')).not.toBeNull()
    expect(container.querySelectorAll("img")).toHaveLength(1)
  })

  it("resets idle time on mouse, touch, scroll and key activity, then hides immediately on activity", () => {
    const { container } = render(<Page />)
    visibility(1)
    for (const event of [
      "pointermove",
      "pointerdown",
      "keydown",
      "scroll",
      "wheel",
      "touchstart",
    ]) {
      tick(EASTER_EGG_IDLE_MS - 1)
      fireEvent(window, new Event(event))
      expect(container.querySelector("img")).toBeNull()
    }
    tick(EASTER_EGG_IDLE_MS - 1)
    expect(container.querySelector("img")).toBeNull()
    tick(1)
    expect(container.querySelector("img")).not.toBeNull()
    fireEvent.pointerMove(window)
    expect(container.querySelector("img")).toBeNull()
    tick(EASTER_EGG_IDLE_MS)
    expect(container.querySelector("img")).toBeNull()
  })

  it("stays hidden while a form field or visible dialog is in use", () => {
    const { container, getByLabelText, getByText } = render(<Page />)
    visibility(1)
    act(() => getByLabelText("댓글").focus())
    tick(EASTER_EGG_IDLE_MS + EASTER_EGG_RETRY_MS)
    expect(container.querySelector("img")).toBeNull()
    act(() => getByText("기사 읽기").focus())
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    vi.spyOn(dialog, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
    container.append(dialog)
    tick(EASTER_EGG_IDLE_MS)
    expect(container.querySelector("img")).toBeNull()
    dialog.remove()
    fireEvent.pointerDown(window)
    tick(EASTER_EGG_IDLE_MS)
    expect(container.querySelector("img")).not.toBeNull()
  })

  it("waits for a visible corner and replays the GIF on a later visit after the cooldown", () => {
    const { container } = render(<Page />)
    visibility(0)
    tick(EASTER_EGG_IDLE_MS)
    expect(container.querySelector("img")).toBeNull()
    visibility(1)
    tick(EASTER_EGG_RETRY_MS)
    expect(container.querySelector("img")).not.toBeNull()
    const firstPlayback = container.querySelector("img")?.getAttribute("src")
    tick(4800)
    expect(container.querySelector("img")).toBeNull()
    tick(EASTER_EGG_COOLDOWN_MS - 4801)
    expect(container.querySelector("img")).toBeNull()
    tick(1)
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(container.querySelector("img")?.getAttribute("src")).not.toBe(firstPlayback)
  })

  it("does not run automatic visitors in the development gallery", () => {
    navigation.pathname = "/dev/football-sprites"
    const { container } = render(
      <FootballEasterEggProvider>
        <FootballEasterEgg slot="corner" />
      </FootballEasterEggProvider>
    )
    visibility(1)
    tick(EASTER_EGG_IDLE_MS)
    expect(container.querySelector("[data-football-corner]")).toBeNull()
  })

  it("starts the manual demo without waiting, gives slow images a full visit, and replays on request", () => {
    const { container, getByRole } = render(<FootballSpritePreview />)
    const demo = () => container.querySelector("[data-football-preview] img")!
    fireEvent.click(getByRole("button", { name: "지금 바로 재생" }))
    expect(demo()).not.toBeNull()
    expect(getByRole("status").textContent).toContain("불러오는 중")
    const firstUrl = demo().getAttribute("src")
    tick(6000)
    expect(demo()).not.toBeNull()
    fireEvent.load(demo())
    expect(getByRole("status").textContent).toContain("재생 중")
    fireEvent.pointerMove(window)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(demo()).not.toBeNull()
    tick(4799)
    expect(demo()).not.toBeNull()
    tick(1)
    expect(demo()).toBeNull()
    expect(getByRole("status").textContent).toContain("재생 완료")
    fireEvent.click(getByRole("button", { name: "지금 바로 재생" }))
    expect(demo().getAttribute("src")).not.toBe(firstUrl)
  })

  it("shows an explicit failure for a missing or stalled demo image and allows retry", () => {
    const { container, getByRole } = render(<FootballSpritePreview />)
    const demo = () => container.querySelector("[data-football-preview] img")!
    fireEvent.click(getByRole("button", { name: "지금 바로 재생" }))
    fireEvent.error(demo())
    expect(getByRole("status").textContent).toContain("불러오지 못했습니다")
    expect(demo()).toBeNull()
    fireEvent.click(getByRole("button", { name: "지금 바로 재생" }))
    tick(15000)
    expect(getByRole("status").textContent).toContain("불러오지 못했습니다")
    expect(demo()).toBeNull()
  })

  it("does not leave timers or visible artwork behind when the active page is unmounted", () => {
    const page = render(<Page />)
    visibility(1)
    tick(EASTER_EGG_IDLE_MS)
    page.unmount()
    // A storage event queued inside a timer is dispatched on the next fake-clock tick.
    tick(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(observers.every((observer) => observer.target === null)).toBe(true)
  })
})
