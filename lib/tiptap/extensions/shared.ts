/**
 * 에디터·뷰어가 공유하는 TipTap extension 집합
 *
 * 에디터(tiptap-editor.tsx)는 이 배열에 편집 전용 extension(Placeholder,
 * EmbedPaste)을 덧붙인다. 뷰어(tiptap-content.tsx)는 이 배열만 사용.
 *
 * 중요: 에디터가 생성할 수 있는 모든 노드/마크를 뷰어가 렌더할 수 있어야 한다.
 * StarterKit 3.15+는 Underline을 기본 포함하므로 별도 Underline extension을
 * 추가하지 않는다(중복 시 tiptap warn: "Duplicate extension names: ['underline']").
 * TextAlign은 StarterKit에 포함되지 않으므로 별도 추가.
 */

import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import TiptapImage from "@tiptap/extension-image"
import { Embed } from "./embed"

interface SharedExtensionsOptions {
  /** 에디터에서만 필요 (붙여넣기된 base64 이미지 허용 여부). 뷰어는 의미 없음. */
  imageAllowBase64?: boolean
}

export function createSharedTipTapExtensions(options: SharedExtensionsOptions = {}) {
  return [
    StarterKit,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    // a11y: 사용자 입력 시 alt 빈 string 인 경우가 많음. 빈 alt 면 의미 있는 fallback
    // ("게시물 이미지") 으로 채움. 스크린리더가 "이미지"라고만 읽지 않게.
    TiptapImage.extend({
      renderHTML({ HTMLAttributes, node }) {
        const alt = (node?.attrs?.alt as string) || HTMLAttributes.alt || "게시물 이미지"
        return ["img", { ...HTMLAttributes, alt }]
      },
    }).configure({
      HTMLAttributes: { class: "tiptap-image" },
      allowBase64: options.imageAllowBase64 ?? false,
    }),
    Embed.configure({ HTMLAttributes: { class: "embed-node" } }),
  ]
}
