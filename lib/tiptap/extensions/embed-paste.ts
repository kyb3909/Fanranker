import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { isProbablyDirectImageUrl, needsOembedImageResolve } from "@/lib/image-paste-url"

function findLoadingTextRange(doc: PMNode, loadingText: string) {
  let startPos = -1
  doc.descendants((node, pos) => {
    if (startPos !== -1) return false
    if (node.isText) {
      const nodeText = node.text || ""
      const localIndex = nodeText.indexOf(loadingText)
      if (localIndex !== -1) {
        startPos = pos + localIndex
        return false
      }
    }
    return true
  })
  if (startPos === -1) return null
  return { start: startPos, end: startPos + loadingText.length }
}

/**
 * URL detection regex patterns for supported providers
 * Note: No 'g' flag to avoid lastIndex issues with .test()
 */
const URL_PATTERNS = {
  youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/([a-zA-Z0-9_-]+)/,
  x: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/,
}

/**
 * Detect if a URL matches any supported oEmbed provider
 */
function detectProvider(url: string): "youtube" | "instagram" | "x" | null {
  if (URL_PATTERNS.youtube.test(url)) {
    return "youtube"
  }
  if (URL_PATTERNS.instagram.test(url)) {
    return "instagram"
  }
  if (URL_PATTERNS.x.test(url)) {
    return "x"
  }
  return null
}

/**
 * Normalize URL to ensure it's a full URL
 */
function normalizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }
  return `https://${url}`
}

/**
 * TipTap Extension: 단일 URL 붙여넣기 시 자동 변환
 *
 * - YouTube / Instagram / X → oEmbed 임베드
 * - .jpg 등 직접 이미지 URL → image 노드
 * - imgur.com / giphy.com 페이지 URL → /api/resolve-pasted-image 로 직접 이미지 주소 확보 후 image 노드
 */
export const EmbedPaste = Extension.create({
  name: "embedPaste",

  addOptions() {
    return {
      onEmbedLoading: undefined as ((loading: boolean) => void) | undefined,
    }
  },

  addProseMirrorPlugins() {
    const onEmbedLoading = this.options.onEmbedLoading
    // Track concurrent embed loading count
    let loadingCount = 0
    const updateLoading = (delta: number) => {
      loadingCount += delta
      onEmbedLoading?.(loadingCount > 0)
    }

    return [
      new Plugin({
        key: new PluginKey("embedPaste"),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain") || ""
            const trimmedText = text.trim()

            // Check if pasted content is a single URL
            if (!trimmedText || trimmedText.includes("\n") || trimmedText.split(/\s+/).length > 1) {
              return false // Not a single URL, let default handler process
            }

            const provider = detectProvider(trimmedText)
            const normalizedUrl = normalizeUrl(trimmedText)

            if (provider) {
              event.preventDefault()

              const loadingText = `⏳ ${provider} 임베드 로딩 중...`
              const { state } = view
              const { from } = state.selection
              view.dispatch(state.tr.insertText(loadingText, from))

              updateLoading(1)
              fetch(`/api/oembed?url=${encodeURIComponent(normalizedUrl)}&includeHtml=true`)
                .then(async (res) => {
                  if (!res.ok) throw new Error("Failed to fetch oEmbed data")
                  return res.json()
                })
                .then((data) => {
                  const currentState = view.state
                  const range = findLoadingTextRange(currentState.doc, loadingText)
                  if (!range) {
                    console.warn("Could not find loading text position")
                    return
                  }

                  const embedNodeType = currentState.schema.nodes.embed
                  if (!embedNodeType) {
                    console.error("Embed node type not found in schema")
                    view.dispatch(
                      currentState.tr.replaceWith(
                        range.start,
                        range.end,
                        currentState.schema.text(normalizedUrl)
                      )
                    )
                    return
                  }

                  const embedNode = embedNodeType.create({
                    provider: data.provider,
                    url: data.url,
                    html: data.html,
                    title: data.title,
                    thumbnail_url: data.thumbnail_url,
                    author_name: data.author_name,
                  })
                  view.dispatch(currentState.tr.replaceWith(range.start, range.end, embedNode))
                  updateLoading(-1)
                })
                .catch((error) => {
                  console.warn("Failed to fetch oEmbed:", error)
                  const currentState = view.state
                  const range = findLoadingTextRange(currentState.doc, loadingText)
                  if (range) {
                    view.dispatch(
                      currentState.tr.replaceWith(
                        range.start,
                        range.end,
                        currentState.schema.text(normalizedUrl)
                      )
                    )
                  }
                  updateLoading(-1)
                })

              return true
            }

            if (isProbablyDirectImageUrl(normalizedUrl)) {
              const imageType = view.state.schema.nodes.image
              if (!imageType) return false
              event.preventDefault()
              const imgNode = imageType.create({ src: normalizedUrl, alt: "" })
              view.dispatch(view.state.tr.replaceSelectionWith(imgNode))
              return true
            }

            if (needsOembedImageResolve(normalizedUrl)) {
              event.preventDefault()
              const loadingText = "⏳ 이미지 불러오는 중..."
              const { state } = view
              const { from } = state.selection
              view.dispatch(state.tr.insertText(loadingText, from))

              updateLoading(1)
              fetch(`/api/resolve-pasted-image?url=${encodeURIComponent(normalizedUrl)}`)
                .then(async (res) => {
                  if (!res.ok) throw new Error("resolve failed")
                  return res.json() as Promise<{ url?: string }>
                })
                .then((data) => {
                  const currentState = view.state
                  const range = findLoadingTextRange(currentState.doc, loadingText)
                  if (!range || !data.url) {
                    throw new Error("missing url")
                  }
                  const imageType = currentState.schema.nodes.image
                  if (!imageType) throw new Error("no image node")
                  const imgNode = imageType.create({ src: data.url, alt: "" })
                  view.dispatch(currentState.tr.replaceWith(range.start, range.end, imgNode))
                  updateLoading(-1)
                })
                .catch(() => {
                  const currentState = view.state
                  const range = findLoadingTextRange(currentState.doc, loadingText)
                  if (range) {
                    view.dispatch(
                      currentState.tr.replaceWith(
                        range.start,
                        range.end,
                        currentState.schema.text(normalizedUrl)
                      )
                    )
                  }
                  updateLoading(-1)
                })

              return true
            }

            return false
          },
        },
      }),
    ]
  },
})
