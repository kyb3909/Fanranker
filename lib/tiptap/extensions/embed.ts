import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { EmbedRenderer } from "./embed-renderer"

export interface EmbedOptions {
  HTMLAttributes: Record<string, string>
}

export interface EmbedAttributes {
  provider: "youtube" | "instagram" | "x"
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
export const Embed = Node.create<EmbedOptions>({
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

  addNodeView() {
    return ReactNodeViewRenderer(EmbedRenderer)
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
