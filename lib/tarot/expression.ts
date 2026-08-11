/**
 * 루나 표정 — 슬롯 정의와 규칙 폴백. 타로 서비스(D:/Projects/tarot)에서 이식.
 *
 * 결정 방식은 하이브리드다: 모델이 응답 첫 줄에 표정을 붙여 보내면 그걸 쓰고,
 * 없거나 모르는 값이면 판 구성(역방향 비율)에서 코드가 정한다.
 * **모델이 형식을 어겨도 표정은 항상 결정된다** — 이게 폴백이 있는 이유다.
 *
 * 에셋: `public/luna/football-{key}.webp` (scripts/gen-luna-football.mjs 생성)
 */
import type { DrawnCard } from "./draw"

export const EXPRESSIONS = ["neutral", "focused", "smile", "tilt", "worried", "surprised"] as const

export type Expression = (typeof EXPRESSIONS)[number]

export const DEFAULT_EXPRESSION: Expression = "focused"

/** 모델이 쓸 한국어 표정 이름 → 슬롯. 이 목록을 프롬프트에 그대로 준다. */
export const EXPRESSION_BY_KO: Record<string, Expression> = {
  평온: "neutral",
  집중: "focused",
  미소: "smile",
  갸웃: "tilt",
  걱정: "worried",
  놀람: "surprised",
}

export const EXPRESSION_LABEL: Record<Expression, string> = {
  neutral: "평온",
  focused: "집중",
  smile: "미소",
  tilt: "갸웃",
  worried: "걱정",
  surprised: "놀람",
}

/** 모델이 보낸 표정 문자열을 슬롯으로. 모르는 값이면 null. */
export function parseExpression(raw: string | undefined | null): Expression | null {
  if (!raw) return null
  const t = raw.trim()
  if ((EXPRESSIONS as readonly string[]).includes(t)) return t as Expression
  return EXPRESSION_BY_KO[t] ?? null
}

export function expressionSrc(expression: Expression): string {
  return `/luna/football-${expression}.webp`
}

/**
 * 판 구성으로 표정 추정 (모델 태그가 없을 때의 폴백).
 * 역방향이 많으면 걱정, 하나도 없으면 미소, 그 사이는 집중.
 */
export function inferExpression(cards: DrawnCard[]): Expression {
  if (cards.length === 0) return DEFAULT_EXPRESSION
  const reversedRatio = cards.filter((c) => c.reversed).length / cards.length
  if (reversedRatio >= 0.67) return "worried"
  if (reversedRatio === 0) return "smile"
  return "focused"
}
