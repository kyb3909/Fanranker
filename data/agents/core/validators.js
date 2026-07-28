// data/agents/core/validators.js
//
// LLM 출력 스키마 검증. 각 stage runner에서 JSON.parse 직후에 호출.
// 잘못된 출력을 조용히 넘기지 않고 명시적으로 잡아냄.

const HANGUL = /[가-힣]/

// ============================================================================
// Credibility Filter (batch output)
// ============================================================================

export function validateCredibilityBatch(parsed) {
  if (!parsed || !Array.isArray(parsed.results)) {
    return { ok: false, reason: 'missing results array' }
  }
  for (const item of parsed.results) {
    const v = validateCredibilityResult(item)
    if (!v.ok) return { ok: false, reason: `item ${item?.id}: ${v.reason}` }
  }
  return { ok: true }
}

export function validateCredibilityResult(item) {
  if (typeof item?.id !== 'string') return { ok: false, reason: 'missing id' }
  if (typeof item.credibility !== 'number' || item.credibility < 0 || item.credibility > 1) {
    return { ok: false, reason: 'credibility not in 0..1' }
  }
  if (typeof item.newsworthiness !== 'number' || item.newsworthiness < 0 || item.newsworthiness > 1) {
    return { ok: false, reason: 'newsworthiness not in 0..1' }
  }
  if (!['pass', 'reject'].includes(item.verdict)) {
    return { ok: false, reason: `invalid verdict: ${item.verdict}` }
  }
  return { ok: true }
}

// ============================================================================
// Desk Reviewer (single item output)
// ============================================================================

const VALID_DECISIONS = ['approve', 'reject', 'hold', 'merge', 'request_rewrite', 'reassign']

export function validateDeskResult(result) {
  if (!result || typeof result !== 'object') return { ok: false, reason: 'not an object' }
  if (!VALID_DECISIONS.includes(result.decision)) {
    return { ok: false, reason: `invalid decision: ${result.decision}` }
  }
  if (typeof result.reason !== 'string' || result.reason.length === 0) {
    return { ok: false, reason: 'missing or empty reason' }
  }
  if (!result.flags || typeof result.flags !== 'object') {
    return { ok: false, reason: 'missing flags object' }
  }
  return { ok: true }
}

// ============================================================================
// Summary Writer (single item output)
// ============================================================================

export function validateWriterResult(result) {
  if (!result || typeof result !== 'object') return { ok: false, reason: 'not an object' }
  if (!result.headline || typeof result.headline !== 'string') {
    return { ok: false, reason: 'missing headline' }
  }
  if (!result.body || typeof result.body !== 'string') {
    return { ok: false, reason: 'missing body' }
  }
  // 한글 필수 (컨텐츠는 무조건 한글)
  if (!HANGUL.test(result.headline)) {
    return { ok: false, reason: 'headline missing Hangul' }
  }
  if (!HANGUL.test(result.body)) {
    return { ok: false, reason: 'body missing Hangul' }
  }
  // 길이 제한 (관대하게)
  if (result.headline.length > 40) {
    return { ok: false, reason: `headline too long (${result.headline.length} chars, max 40)` }
  }
  if (result.body.length < 100) {
    return { ok: false, reason: `body too short (${result.body.length} chars, min 100)` }
  }
  // articleBody 입력이 있으면 500~1,000자 권장이라 상한을 1,300으로 (write-run 검증과 동일)
  if (result.body.length > 1300) {
    return { ok: false, reason: `body too long (${result.body.length} chars, max 1300)` }
  }
  return { ok: true }
}

// ============================================================================
// SEO Formatter (single item output)
// ============================================================================

export function validateFormatterResult(result, allowedFlairIds) {
  if (!result || typeof result !== 'object') return { ok: false, reason: 'not an object' }
  if (!result.title || typeof result.title !== 'string') {
    return { ok: false, reason: 'missing title' }
  }
  if (!HANGUL.test(result.title)) {
    return { ok: false, reason: 'title missing Hangul' }
  }
  if (result.title.length > 40) {
    return { ok: false, reason: `title too long (${result.title.length} chars, max 40)` }
  }
  if (!result.lead || typeof result.lead !== 'string') {
    return { ok: false, reason: 'missing lead' }
  }
  if (!HANGUL.test(result.lead)) {
    return { ok: false, reason: 'lead missing Hangul' }
  }
  if (result.lead.length < 30 || result.lead.length > 200) {
    return { ok: false, reason: `lead length out of range (${result.lead.length} chars)` }
  }
  if (!Array.isArray(result.paragraphs) || result.paragraphs.length === 0) {
    return { ok: false, reason: 'missing paragraphs array' }
  }
  if (result.paragraphs.length > 8) {
    return { ok: false, reason: `too many paragraphs (${result.paragraphs.length}, max 8)` }
  }
  for (const [i, p] of result.paragraphs.entries()) {
    if (typeof p !== 'string' || !HANGUL.test(p)) {
      return { ok: false, reason: `paragraph ${i} invalid or missing Hangul` }
    }
    if (p.length < 20 || p.length > 400) {
      return { ok: false, reason: `paragraph ${i} length out of range (${p.length})` }
    }
  }
  // flairId는 null 허용. string이면 allowedFlairIds 검증.
  if (result.flairId !== null && result.flairId !== undefined) {
    if (typeof result.flairId !== 'string') {
      return { ok: false, reason: 'flairId must be string or null' }
    }
    if (Array.isArray(allowedFlairIds) && !allowedFlairIds.includes(result.flairId)) {
      return { ok: false, reason: `flairId not in allowed list: ${result.flairId}` }
    }
  }
  return { ok: true }
}
