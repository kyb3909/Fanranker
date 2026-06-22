import { Node, mergeAttributes } from "@tiptap/core"

/**
 * TipTap Video 노드 — mp4/webm 등 직접 동영상 URL을 인라인 `<video>` 플레이어로 렌더.
 * (레딧처럼 컨트롤 달린 인라인 재생) 에디터·뷰어 공통으로 native `<video controls>` 출력.
 *
 * 재생 가능 호스트는 next.config.mjs 의 CSP `media-src` 에 의해 결정됨(현재 https: 전체 허용).
 */
export const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("src"),
        renderHTML: (attrs) => (attrs.src ? { src: attrs.src } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "video[src]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        controls: "true",
        preload: "metadata",
        playsinline: "true",
        class: "tiptap-video my-4 w-full max-w-[520px] rounded-lg bg-black",
      }),
    ]
  },
})
