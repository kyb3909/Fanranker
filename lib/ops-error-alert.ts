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
 * 흔한 에러 패턴 → 원인·첫 대응 한국어 해석.
 *
 * 왜: "PGRST200" 같은 원문만 오면 알림을 받아도 뭘 해야 할지 몰라 결국 무시하게 된다.
 * 알림의 목적은 로그 복사가 아니라 **판단 재료** — 원인 추정과 첫 행동까지 실어야
 * 채널을 열어본 시점에 대응이 시작된다.
 *
 * 먼저 매칭되는 것이 이긴다 — 돈 경로가 최상단인 이유(가장 급한 것부터).
 * 모르는 패턴이면 null — 억지 진단은 오진이고, 오진은 알림 신뢰를 태운다.
 */
const DIAGNOSES: Array<{ re: RegExp; cause: string; action: string }> = [
  {
    re: /spend_tokens|refund_tokens|spend_gold|refund_gold|settle/i,
    cause: "💸 돈 경로(볼·골드 차감/환불/정산) 실패 — 유저 잔액이 어긋날 수 있는 최우선 건",
    action:
      "/admin2 돈 정합성 카드 확인. 고아 슬립·환불 큐는 ops-monitor 가 30분 내 자동 감지하니 재알림이 없으면 자가 회복된 것",
  },
  {
    re: /relation .+ does not exist|PGRST200|PGRST205/i,
    cause:
      "DB 스키마 불일치 — 코드가 찾는 테이블/관계가 DB에 없음 (마이그레이션 미적용 또는 임베드 이름 오타)",
    action: "최근 배포에 새 마이그레이션이 포함됐는지 확인하고 적용",
  },
  {
    re: /column .+ does not exist|42703/i,
    cause: "DB 컬럼 없음 — 코드는 새 컬럼을 기대하는데 DB 마이그레이션이 아직 안 됨",
    action: "supabase/migrations 최신 파일이 프로덕션에 적용됐는지 확인",
  },
  {
    re: /duplicate key|23505/i,
    cause: "중복 저장 시도 — 같은 데이터가 두 번 들어옴 (더블클릭·재시도 등). 보통 무해",
    action: "같은 알림이 반복되면 해당 경로에 멱등 처리 누락 — 그 전엔 무시해도 됨",
  },
  {
    re: /violates foreign key|23503/i,
    cause: "참조 무결성 위반 — 존재하지 않는 대상(삭제된 글·유저 등)을 가리키는 저장 시도",
    action: "스택의 경로에서 삭제된 대상 처리(soft delete 체크) 누락 여부 확인",
  },
  {
    re: /rate limit|too many requests|status(?: code)?[: ]*429/i,
    cause: "외부 API 호출 한도 초과 (429)",
    action: "한도는 시간이 지나면 풀림. 계속되면 호출 주기를 늘려야 함",
  },
  {
    re: /openai|api\.openai\.com|gpt-/i,
    cause: "OpenAI 호출 실패 — 키 만료·한도·서비스 장애 중 하나. 뉴스/커뮤글 생성 품질에 영향",
    action: "platform.openai.com 사용량·결제 상태 확인. 파이프라인은 초안만 안 만들 뿐 죽지 않음",
  },
  {
    re: /clerk/i,
    cause: "인증(Clerk) 오류 — 로그인·가입이 막힐 수 있는 건",
    action: "gongnori.fan 에서 직접 로그인 시도해보고, 안 되면 Clerk 대시보드 상태 확인",
  },
  {
    re: /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up|UND_ERR/i,
    cause:
      "외부 서비스 연결 실패 — 상대 서버 다운 또는 네트워크 문제 (우리 코드 문제 아닐 확률 높음)",
    action: "일시적이면 자동 회복. 반복되면 스택에서 어느 호스트인지 확인",
  },
  {
    re: /unexpected token|is not valid JSON|JSON at position/i,
    cause:
      "파싱 실패 — 외부 응답 형식이 바뀌었거나 파일 인코딩(BOM) 문제 (7-25 커뮤 크롤 정전과 같은 유형)",
    action: "스택의 파일/API 가 무엇을 파싱하다 죽었는지 확인",
  },
  {
    re: /timed? ?out/i,
    cause: "시간 초과 — 응답이 제한 시간 안에 안 옴 (느린 쿼리 또는 외부 지연)",
    action: "반복되면 해당 경로의 쿼리·외부 호출을 봐야 함. 단발성이면 무시",
  },
  {
    re: /CRON_SECRET/,
    cause: "cron 인증 설정 문제 — Vercel env CRON_SECRET 누락/불일치",
    action: "Vercel 대시보드 환경변수 확인",
  },
]

/** 진단 결과. 모르는 패턴이면 null (exported for tests) */
export function diagnoseError(message: string): { cause: string; action: string } | null {
  const hit = DIAGNOSES.find((d) => d.re.test(message))
  return hit ? { cause: hit.cause, action: hit.action } : null
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

interface ServerErrorContext {
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

    // 원인 해석 — 원문만 보내면 "뭘 해야 하지"에서 멈춘다. 아는 패턴이면 진단까지 싣는다.
    const diagnosis = diagnoseError(message)

    await notifyDiscordOps({
      title: "🔥 서버 에러",
      description: message.slice(0, 500),
      level: "alert",
      fields: [
        ...(diagnosis
          ? [
              { name: "원인 추정", value: diagnosis.cause },
              { name: "첫 대응", value: diagnosis.action },
            ]
          : []),
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
