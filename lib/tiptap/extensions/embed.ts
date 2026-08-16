import { ReactNodeViewRenderer } from "@tiptap/react"
import { EmbedBase } from "./embed-base"
import { EmbedRenderer } from "./embed-renderer"

/**
 * Embed 노드 (클라이언트) — 스키마는 embed-base, 여기서 React NodeView 만 붙인다.
 * 서버(SSR 본문 렌더)는 embed-base 를 직접 쓴다 — @tiptap/react 는 RSC 에서 못 뜬다.
 */
export const Embed = EmbedBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(EmbedRenderer)
  },
})
