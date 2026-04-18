/**
 * 에디터·뷰어가 공유하는 TipTap extension 집합
 *
 * 에디터(tiptap-editor.tsx)는 이 배열에 편집 전용 extension(Placeholder,
 * EmbedPaste)을 덧붙인다. 뷰어(tiptap-content.tsx)는 이 배열만 사용.
 *
 * 중요: 에디터가 생성할 수 있는 모든 노드/마크를 뷰어가 렌더할 수 있어야 한다.
 * Underline과 TextAlign을 여기에 두는 이유: 이전에 뷰어가 두 extension 없이
 * StarterKit만 써서 밑줄/정렬 서식이 읽기 시점에 사라졌음.
 */

import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import TiptapImage from "@tiptap/extension-image"
import { Embed } from "./embed"

export interface SharedExtensionsOptions {
  /** 에디터에서만 필요 (붙여넣기된 base64 이미지 허용 여부). 뷰어는 의미 없음. */
  imageAllowBase64?: boolean
}

export function createSharedTipTapExtensions(options: SharedExtensionsOptions = {}) {
  return [
    StarterKit,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Underline,
    TiptapImage.configure({
      HTMLAttributes: { class: "tiptap-image" },
      allowBase64: options.imageAllowBase64 ?? false,
    }),
    Embed.configure({ HTMLAttributes: { class: "embed-node" } }),
  ]
}
