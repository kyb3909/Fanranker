import "server-only"

/**
 * 독자 오류 제보 감지 (2026-08-07 운영자: "기사 잘못됐다는 댓글 자동 반영 —
 * 물론 검수 거친 다음에. 구라일 수도 있거든")
 *
 * 2단 구조 (모더레이션 P1·VS 판정과 같은 패턴):
 *   1. 룰 필터 — "잘못/오보/틀렸다" 류 신호가 있는 댓글만 통과 (LLM 비용 절약)
 *   2. LLM 판정 — 기사 대비 **구체적 사실 지적**인지 확인. 단순 비난·의견·농담 제외.
 *
 * 여기서는 "제보인가"만 판정한다. 제보가 **맞는가**(사실 여부)는 판정하지 않는다 —
 * 그건 검수자 몫. claim 은 검수자가 빨리 확인하도록 주장을 요약한 것일 뿐이다.
 */

const MODEL = "gpt-4.1-mini"

/** 오류 제보 신호 — 넓게 잡고 LLM 이 좁힌다 (놓치면 영영 안 보이므로 recall 우선) */
export const ERROR_REPORT_HINT_RE =
  /잘못|틀렸|틀린|틀림|오보|오타|오류|정정|수정해|사실과 다|사실이 아|아닌데요|아니에요|아니잖|가짜|허위|팩트 체크|팩트체크|기사가 이상|반대로|바뀌었|헷갈린 듯|다른 선수|다른 팀/

export interface CandidateComment {
  id: string
  postId: string
  userId: string | null
  content: string
}

/** 룰 필터 — 오류 제보로 의심되는 댓글만 남긴다 */
export function filterErrorReportCandidates(
  comments: { id: string; post_id: string; user_id: string | null; content: string | null }[]
): CandidateComment[] {
  const out: CandidateComment[] = []
  for (const c of comments) {
    const text = (c.content ?? "").trim()
    if (text.length < 5 || text.length > 2000) continue
    if (!ERROR_REPORT_HINT_RE.test(text)) continue
    out.push({ id: c.id, postId: c.post_id, userId: c.user_id, content: text })
  }
  return out
}

const CLASSIFY_PROMPT = `너는 한국 스포츠 뉴스룸의 제보 접수원이다. 봇이 발행한 기사에 달린 댓글이 **기사의 오류를 지적하는 구체적 제보**인지 판정한다.

제보로 인정 (is_report=true):
- 기사 속 사실이 틀렸다는 구체적 주장: 클럽/선수/스코어/금액/날짜/이적 방향이 다르다, 표기·오타 지적, 이미 정정된 소식이라는 지적.
- 무엇이 어떻게 틀렸는지 특정할 수 있어야 한다.

제보 아님 (is_report=false):
- 단순 비난·조롱("기사 수준 봐라"), 의견·예측("이 이적 잘못된 선택임"), 선수·팀에 대한 불만, 농담, 기사와 무관한 잡담.
- "잘못"이라는 단어가 있어도 기사 내용 지적이 아니면 제보가 아니다.

주의: 제보가 사실인지 아닌지는 판정하지 않는다 — 주장을 요약만 한다. claim 은 "무엇이 틀렸다는 주장인가" 한 줄 (예: "이적 클럽이 바르셀로나가 아니라 레알이라는 주장").

입력: {"items":[{"idx":0,"기사제목":"...","기사본문":"...","댓글":"..."}]}
출력 (JSON only): {"results":[{"idx":0,"is_report":true|false,"claim":"..."}]}`

export interface ErrorReportVerdict {
  idx: number
  isReport: boolean
  claim: string
}

/**
 * LLM 판정 — 실패 시 null (인프라 실패는 판정이 아니다 — 다음 회차 재시도).
 * 호출 전에 룰 필터를 통과한 소량(≤20)만 넣을 것.
 */
export async function classifyErrorReports(
  items: { articleTitle: string; articleExcerpt: string; comment: string }[]
): Promise<ErrorReportVerdict[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || items.length === 0) return items.length === 0 ? [] : null

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: CLASSIFY_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              items: items.map((it, idx) => ({
                idx,
                기사제목: it.articleTitle.slice(0, 200),
                기사본문: it.articleExcerpt.slice(0, 600),
                댓글: it.comment.slice(0, 500),
              })),
            }),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) {
      console.error("[comment-reports] OpenAI HTTP", res.status)
      return null
    }
    const json = await res.json()
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as {
      results?: { idx?: number; is_report?: boolean; claim?: string }[]
    }
    return (parsed.results ?? [])
      .filter((r) => typeof r?.idx === "number" && r.idx >= 0 && r.idx < items.length)
      .map((r) => ({
        idx: r.idx as number,
        isReport: r.is_report === true,
        claim: String(r.claim ?? "")
          .trim()
          .slice(0, 300),
      }))
  } catch (e) {
    console.error("[comment-reports] classify failed:", e)
    return null
  }
}
