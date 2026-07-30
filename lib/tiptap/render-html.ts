import "server-only"

import { generateHTML } from "@tiptap/html/server"
import { EmbedBase } from "@/lib/tiptap/extensions/embed-base"
import { createTipTapExtensionsWith } from "@/lib/tiptap/extensions/shared-core"
import { transformBareImageUrlsInTipTapJSON } from "@/lib/tiptap/transform-bare-image-urls"

/**
 * TipTap JSON → 정적 HTML (서버 전용).
 *
 * 글 상세 본문이 dynamic({ssr:false}) 로 클라이언트에서만 렌더돼 SSR HTML 에
 * 스켈레톤만 있었다 (2026-07-30 워룸: 본문이 검색엔진에 안 실리는 SEO 절단).
 * 같은 extension 집합으로 서버에서 HTML 을 만들어 첫 HTML 에 본문을 싣고,
 * 클라이언트 TipTap 이 준비되면 그 자리를 넘겨받는다 (임베드 iframe 은 그때부터).
 *
 * 안전성: 본문 JSON 은 저장 시 sanitizeTipTapJSON 을 통과했고, generateHTML 은
 * 텍스트/속성을 이스케이프한다 — 임베드의 html 페이로드도 data-attr 로만 나간다.
 */
export function renderTipTapToHTML(content: unknown): string | null {
  if (!content || typeof content !== "object") return null
  try {
    const doc = transformBareImageUrlsInTipTapJSON(content)
    return generateHTML(doc as never, createTipTapExtensionsWith(EmbedBase))
  } catch (e) {
    // 렌더 실패는 기존 동작(클라 렌더 + 스켈레톤)으로 폴백 — 상세 페이지를 막지 않는다
    console.error("[render-html] TipTap 서버 렌더 실패:", e)
    return null
  }
}
