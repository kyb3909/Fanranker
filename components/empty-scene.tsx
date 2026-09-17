import { Search, CalendarDays, Users, MessageCircle } from "lucide-react"

const scenes = {
  search: Search,
  rest: CalendarDays,
  lineup: Users,
  chat: MessageCircle,
} as const

/**
 * 빈 상태는 작은 선 아이콘으로 안내한다. 치비는 유휴 애니메이션에서만 등장한다.
 */
export function EmptyScene({ scene, size = 192 }: { scene: keyof typeof scenes; size?: number }) {
  const Icon = scenes[scene]
  return (
    <div
      aria-hidden
      className="pointer-events-none mx-auto aspect-square w-full select-none"
      style={{ maxWidth: Math.min(size, 40), color: "var(--wc-mute)" }}
    >
      <Icon className="h-full w-full" strokeWidth={1.5} />
    </div>
  )
}
