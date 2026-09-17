export const FOOTBALL_SPRITES = [
  "sky-meditator",
  "white-camera",
  "red-jump",
  "striped-trophy",
  "navy-arms",
] as const
export type FootballSpriteId = (typeof FOOTBALL_SPRITES)[number]
export type EasterEggSlot = "footer" | "sidebar" | "fixtures" | "corner" | "corner-right"

export const EASTER_EGG_COOLDOWN_MS = 90_000
export const EASTER_EGG_VISIBLE_MS = 4_800
export const EASTER_EGG_IDLE_MS = 20_000
export const EASTER_EGG_RETRY_MS = 15_000

export function easterEggSlots(pathname: string, desktop: boolean): EasterEggSlot[] {
  if (pathname === "/matches") return ["footer", "fixtures", "corner", "corner-right"]
  if (/^\/(match|standings)\/[^/]+\/?$/.test(pathname)) return ["footer", "corner", "corner-right"]
  if (
    pathname === "/" ||
    pathname === "/explore" ||
    pathname === "/search" ||
    /^\/(post|community)\/[^/]+\/?$/.test(pathname)
  ) {
    return desktop
      ? ["footer", "sidebar", "corner", "corner-right"]
      : ["footer", "corner", "corner-right"]
  }
  return []
}

export function pickEasterEgg(
  pathname: string,
  desktop: boolean,
  random: () => number = Math.random,
  visibleSlots?: readonly EasterEggSlot[]
): { slot: EasterEggSlot; character: FootballSpriteId } | null {
  const allowed = easterEggSlots(pathname, desktop)
  const visible = allowed.filter((slot) => !visibleSlots || visibleSlots.includes(slot))
  // Prefer a visible page detail; the screen corner is a fallback while reading a long page.
  const pageSlots = visible.filter((slot) => slot !== "corner" && slot !== "corner-right")
  const slots = pageSlots.length ? pageSlots : visible
  if (slots.length === 0) return null
  return {
    slot: slots[Math.min(slots.length - 1, Math.floor(random() * slots.length))],
    character:
      FOOTBALL_SPRITES[
        Math.min(FOOTBALL_SPRITES.length - 1, Math.floor(random() * FOOTBALL_SPRITES.length))
      ],
  }
}
