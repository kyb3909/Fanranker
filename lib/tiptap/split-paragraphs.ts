/**
 * 긴 단일 문단을 읽기 좋은 문단들로 분할 (2026-08-04 운영자: "가독성을 높일 수
 * 있도록 적당히 문단을 띄어서").
 *
 * 봇 기사는 본문 전체가 한 덩어리 문단으로 생성된다 — 문장 경계에서 2~3문장씩
 * 묶어 문단을 나눈다. 결정적(LLM 없음)·멱등(이미 나뉜 문단은 그대로).
 */

interface TipTapDoc {
  type?: string
  content?: TipTapNode[]
}
interface TipTapNode {
  type?: string
  text?: string
  content?: TipTapNode[]
  [key: string]: unknown
}

/** 이 길이를 넘는 단일 텍스트 문단만 분할 대상 */
const SPLIT_THRESHOLD = 280
/** 문단당 목표 길이 (문장 단위로 이 근처에서 끊음) */
const TARGET_LEN = 220

/** 한국어 문장 경계 분리 — 마침표·물음표·느낌표 + 공백. 숫자 소수점(3.5)은 보호 */
function splitSentences(text: string): string[] {
  const out: string[] = []
  let buf = ""
  for (let i = 0; i < text.length; i++) {
    buf += text[i]
    const ch = text[i]
    if ((ch === "." || ch === "?" || ch === "!") && text[i + 1] === " ") {
      const prev = text[i - 1]
      // "3.5" 같은 숫자 소수점 보호
      if (!(ch === "." && /\d/.test(prev ?? "") && /\d/.test(text[i + 2] ?? ""))) {
        out.push(buf)
        buf = ""
        i++ // 공백 소비
      }
    }
  }
  if (buf.trim()) out.push(buf)
  return out
}

export function splitLongParagraphs(doc: unknown): unknown {
  const d = doc as TipTapDoc
  if (!d || d.type !== "doc" || !Array.isArray(d.content)) return doc

  const newContent: TipTapNode[] = []
  for (const node of d.content) {
    const isLongSingleText =
      node.type === "paragraph" &&
      Array.isArray(node.content) &&
      node.content.length === 1 &&
      node.content[0].type === "text" &&
      typeof node.content[0].text === "string" &&
      node.content[0].text.length > SPLIT_THRESHOLD

    if (!isLongSingleText) {
      newContent.push(node)
      continue
    }

    const textNode = node.content![0]
    const sentences = splitSentences(textNode.text as string)
    const chunks: string[] = []
    let buf = ""
    for (const s of sentences) {
      if (buf && buf.length + s.length > TARGET_LEN) {
        chunks.push(buf.trim())
        buf = s
      } else {
        buf = buf ? `${buf} ${s.trim()}` : s
      }
    }
    if (buf.trim()) chunks.push(buf.trim())

    for (const chunk of chunks) {
      newContent.push({
        type: "paragraph",
        content: [{ ...textNode, text: chunk }],
      })
    }
  }
  return { ...d, content: newContent }
}
