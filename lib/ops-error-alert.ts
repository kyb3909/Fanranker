import "server-only"
import { notifyDiscordOps } from "@/lib/discord-notify"

/**
 * 서버 에러 → 디스코드 알림.
 *
 * 왜: 지금까지 500 은 `console.error` 로만 남아 Vercel 로그를 직접 열어야 알 수 있었다.
 * EPL 개막(8/21) 유입이 몰리는 순간이 장애 확률이 가장 높은데, 그때 감지 채널이
 * 없다는 게 가장 큰 사각지대였다. 돈 정합성은 이미 ops-monitor 30분 알림으로
 * "새는 순간 감지"하는데 에러만 그 철학 밖에 있었다.
 *
 * ## 설계 — 알림은 적을수록 읽힌다
 * 에러 알림의 실패 모드는 "안 오는 것"보다 **"너무 와서 무시하게 되는 것"** 이다.
 * 장애 하나가 초당 수십 개 에러를 만들면 채널이 도배되고, 그러면 다음 진짜 장애도
 * 묻힌다. 그래서:
 *   1. 같은 에러(경로+메시지)는 쿨다운 동안 한 번만 보낸다
 *   2. 쿨다운이 끝나면 그동안 몇 번 더 났는지 묶어서 알려준다
 *   3. 우리가 못 고치는 것(봇 스캔·취소된 요청)은 아예 안 보낸다
 */

const COOLDOWN_MS = 10 * 60 * 1000 // 같은 에러 재알림 간격
const MAX_TRACKED = 200 // 메모리 상한 (서버리스 인스턴스당)

interface Seen {
  firstAt: number
  lastNotifiedAt: number
  /** 마지막 알림 이후 추가로 발생한 횟수 */
  suppressed: number
}

/**
 * 인스턴스 로컬 캐시. 서버리스라 인스턴스가 늘면 중복이 생길 수 있지만,
 * 그 편이 외부 저장소를 두는 복잡도보다 낫다 — 알림은 정확도보다 도달이 중요하다.
 */
const seen = new Map<string, Seen>()

/** 우리가 손댈 수 없거나 알림 가치가 없는 에러 */
const IGNORED = [
  /aborted/i, // 사용자가 탭을 닫음
  /ECONNRESET/i,
  /NEXT_REDIRECT/, // redirect() 는 예외로 구현돼 있다 — 정상 흐름
  /NEXT_NOT_FOUND/, // notFound() 도 마찬가지
  /Dynamic server usage/i, // 빌드 시 프리렌더 시도 — 런타임 문제 아님
  /JWT expired/i,
  /PGRST301/, // RLS 거부 — 비인가 접근 시 예상된 결과
]

function shouldIgnore(message: string): boolean {
  return IGNORED.some((re) => re.test(message))
}

/**
 * 중복 억제 키용 정규화.
 *
 * 같은 장애라도 메시지에 id·타임스탬프가 박혀 있으면 매번 다른 문자열이 된다
 * ("슬립 저장 실패: id=aaaa-1111" vs "…id=bbbb-2222"). 그대로 키로 쓰면 억제가
 * 무력화돼 채널이 도배된다 → 가변 부분을 자리표시자로 치환해서 묶는다.
 */
function fingerprint(message: string): string {
  return (
    message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
      // 8자 이상 16진수 덩어리 = 잘린 uuid·해시·토큰. 이 길이의 a-f 전용 영단어는
      // 사실상 없으므로 오탐 위험이 낮다
      .replace(/\b[0-9a-f]{8,}\b/gi, "<hash>")
      .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.]+/g, "<time>")
      .replace(/\d+/g, "<n>")
      .slice(0, 120)
  )
}

/** 캐시가 무한정 자라지 않게 — 가장 오래된 것부터 버린다 */
function evictIfNeeded() {
  if (seen.size < MAX_TRACKED) return
  const oldest = [...seen.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt)[0]
  if (oldest) seen.delete(oldest[0])
}

export interface ServerErrorContext {
  /** 어디서 났나 (예: /api/betman/prediction) */
  path?: string
  /** 라우트 종류 (route handler / server component 등) */
  kind?: string
}

/**
 * 서버 에러를 디스코드로 알린다. 절대 throw 하지 않는다 —
 * 알림 실패가 원래 요청 처리를 더 망가뜨리면 안 된다.
 */
export async function alertServerError(
  error: unknown,
  ctx: ServerErrorContext = {}
): Promise<void> {
  try {
    if (!process.env.DISCORD_OPS_WEBHOOK_URL) return
    // 프로덕션 밖에서는 로그로 충분하다 — 개발 중 디스코드를 도배하지 않는다
    if (process.env.NODE_ENV !== "production") return

    const err = error as { message?: string; name?: string; stack?: string }
    const message = String(err?.message ?? error ?? "unknown error")
    if (shouldIgnore(message)) return

    const path = ctx.path ?? "unknown"
    const key = `${path}|${fingerprint(message)}`
    const now = Date.now()
    const prev = seen.get(key)

    if (prev && now - prev.lastNotifiedAt < COOLDOWN_MS) {
      prev.suppressed++
      return
    }

    const repeatNote =
      prev && prev.suppressed > 0
        ? `${Math.round((now - prev.firstAt) / 60000)}분간 ${prev.suppressed + 1}회 추가 발생`
        : null

    seen.set(key, {
      firstAt: prev?.firstAt ?? now,
      lastNotifiedAt: now,
      suppressed: 0,
    })
    evictIfNeeded()

    // 스택은 우리 코드 프레임만 몇 줄 — node_modules 로 채우면 읽을 게 없다
    const stack = (err?.stack ?? "")
      .split("\n")
      .slice(1)
      .filter((l) => !l.includes("node_modules"))
      .slice(0, 3)
      .map((l) => l.trim())
      .join("\n")

    await notifyDiscordOps({
      title: "🔥 서버 에러",
      description: message.slice(0, 500),
      level: "alert",
      fields: [
        { name: "경로", value: path.slice(0, 200), inline: true },
        ...(ctx.kind ? [{ name: "위치", value: ctx.kind, inline: true }] : []),
        ...(repeatNote ? [{ name: "반복", value: repeatNote, inline: true }] : []),
        ...(stack ? [{ name: "스택", value: `\`\`\`${stack.slice(0, 900)}\`\`\`` }] : []),
      ],
    })
  } catch {
    /* 알림 실패는 삼킨다 */
  }
}

/** 테스트용 — 중복 억제 상태 초기화 */
export function __resetErrorAlertCache() {
  seen.clear()
}
