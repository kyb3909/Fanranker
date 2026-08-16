import { Node, mergeAttributes } from "@tiptap/core"

/**
 * Embed 노드의 서버 안전 베이스 — React NodeView 없이 스키마·직렬화만.
 *
 * 분리 이유 (2026-07-31): 글 상세 SSR(lib/tiptap/render-html)이 extension 집합을
 * 서버에서 쓰는데, 기존 embed.ts 는 @tiptap/react(ReactNodeViewRenderer)를 top-level
 * import 해 RSC 빌드에서 `createContext is not a function` 으로 죽었다.
 * 클라이언트 뷰(iframe 렌더)는 embed.ts 가 이 베이스를 extend 해 붙인다.
 */

interface EmbedOptions {
  HTMLAttributes: Record<string, string>
}

interface EmbedAttributes {
  provider: "youtube" | "instagram" | "x" | "streamable"
  url: string
  html?: string // 선택적: 상세 페이지에서만 필요
  title?: string
  thumbnail_url?: string
  author_name?: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      /**
       * Insert an embed node
       */
      setEmbed: (attributes: EmbedAttributes) => ReturnType
    }
  }
}

/**
 * TipTap Node for embedding oEmbed content (YouTube, Instagram, X)
 *
 * This node stores normalized oEmbed metadata and renders the embed HTML
 * in a responsive container.
 */
export const EmbedBase = Node.create<EmbedOptions>({
  name: "embed",

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      provider: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-provider"),
        renderHTML: (attributes) => {
          if (!attributes.provider) {
            return {}
          }
          return {
            "data-provider": attributes.provider,
          }
        },
      },
      url: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-url"),
        renderHTML: (attributes) => {
          if (!attributes.url) {
            return {}
          }
          return {
            "data-url": attributes.url,
          }
        },
      },
      html: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-html"),
        renderHTML: (attributes) => {
          if (!attributes.html) {
            return {}
          }
          return {
            "data-html": attributes.html,
          }
        },
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => {
          if (!attributes.title) {
            return {}
          }
          return {
            "data-title": attributes.title,
          }
        },
      },
      thumbnail_url: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-thumbnail-url"),
        renderHTML: (attributes) => {
          if (!attributes.thumbnail_url) {
            return {}
          }
          return {
            "data-thumbnail-url": attributes.thumbnail_url,
          }
        },
      },
      author_name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-author-name"),
        renderHTML: (attributes) => {
          if (!attributes.author_name) {
            return {}
          }
          return {
            "data-author-name": attributes.author_name,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="embed"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "embed",
      }),
    ]
  },

  addCommands() {
    return {
      setEmbed:
        (attributes: EmbedAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
