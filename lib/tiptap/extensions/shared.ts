/**
 * 에디터·뷰어(클라이언트)가 공유하는 TipTap extension 집합.
 *
 * 목록 구성은 shared-core 한 곳에 있다 — 여기서는 React NodeView 붙은 Embed 만
 * 주입한다. 서버 렌더(lib/tiptap/render-html)는 embed-base 를 주입해 같은 목록을
 * 쓴다 (@tiptap/react 는 RSC 에서 못 뜨기 때문에 이 분리가 필요).
 *
 * 에디터(tiptap-editor.tsx)는 이 배열에 편집 전용 extension(Placeholder,
 * EmbedPaste)을 덧붙인다. 뷰어(tiptap-content.tsx)는 이 배열만 사용.
 */

import { Embed } from "./embed"
import { createTipTapExtensionsWith, type SharedExtensionsOptions } from "./shared-core"

export function createSharedTipTapExtensions(options: SharedExtensionsOptions = {}) {
  return createTipTapExtensionsWith(Embed, options)
}
