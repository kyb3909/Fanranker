import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import {
  isProbablyDirectImageUrl,
  isProbablyDirectVideoUrl,
  needsOembedImageResolve,
} from "@/lib/image-paste-url"

/** 로딩 텍스트의 인라인 범위 (텍스트→텍스트 교체용) */
function findLoadingTextRange(doc: PMNode, loadingText: string) {
  let startPos = -1
  doc.descendants((node, pos) => {
    if (startPos !== -1) return false
    if (node.isText) {
      const localIndex = (node.text || "").indexOf(loadingText)
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

/** 로딩 텍스트를 감싸는 부모 블록(paragraph) 전체 범위 (텍스트→블록노드 교체용) */
function findLoadingBlockRange(
  doc: PMNode,
  loadingText: string
): { start: number; end: number } | null {
  let start = -1
  let end = -1
  doc.descendants((node, pos) => {
    if (start !== -1) return false
    if (node.isText && (node.text || "").includes(loadingText)) {
      const $pos = doc.resolve(pos)
      start = $pos.before($pos.depth)
      end = $pos.after($pos.depth)
      return false
    }
    return true
  })
  return start === -1 ? null : { start, end }
}

/**
 * URL detection regex patterns for supported providers
 * Note: No 'g' flag to avoid lastIndex issues with .test()
 */
const URL_PATTERNS = {
  youtube:
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
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
                  const embedNodeType = currentState.schema.nodes.embed

                  const blockRange = findLoadingBlockRange(currentState.doc, loadingText)
                  if (!blockRange || !embedNodeType) {
                    const textRange = findLoadingTextRange(currentState.doc, loadingText)
                    if (textRange) {
                      view.dispatch(
                        currentState.tr.replaceWith(
                          textRange.start,
                          textRange.end,
                          currentState.schema.text(normalizedUrl)
                        )
                      )
                    }
                    updateLoading(-1)
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
                  view.dispatch(
                    currentState.tr.replaceWith(blockRange.start, blockRange.end, embedNode)
                  )
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

            // mp4/webm 등 직접 동영상 URL → video 노드 (레딧처럼 인라인 플레이어)
            if (isProbablyDirectVideoUrl(normalizedUrl)) {
              const videoType = view.state.schema.nodes.video
              if (!videoType) return false
              event.preventDefault()
              const vNode = videoType.create({ src: normalizedUrl })
              view.dispatch(view.state.tr.replaceSelectionWith(vNode))
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
                  const imageType = currentState.schema.nodes.image
                  const blockRange = findLoadingBlockRange(currentState.doc, loadingText)
                  if (!blockRange || !data.url || !imageType) {
                    throw new Error("missing url or range")
                  }
                  const imgNode = imageType.create({ src: data.url, alt: "" })
                  view.dispatch(
                    currentState.tr.replaceWith(blockRange.start, blockRange.end, imgNode)
                  )
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

            // 마지막: 확장자 없는 단일 URL → 서버에서 Content-Type 확인해 이미지면 image 노드로 승격.
            // preventDefault 하지 않아 기본 동작(autolink, 링크)으로 먼저 들어가고, 이미지로
            // 확인되면 그 블록만 image 노드로 교체. (확장자 있는 이미지는 위에서 이미 처리됨)
            if (/^https?:\/\//i.test(normalizedUrl)) {
              const pastedText = trimmedText
              updateLoading(1)
              fetch(`/api/check-image-url?url=${encodeURIComponent(normalizedUrl)}`)
                .then((res) => (res.ok ? res.json() : null))
                .then((data: { isImage?: boolean; isVideo?: boolean; url?: string } | null) => {
                  if (!data?.url || (!data.isImage && !data.isVideo)) return
                  const st = view.state
                  const nodeType = data.isImage ? st.schema.nodes.image : st.schema.nodes.video
                  if (!nodeType) return
                  const blockRange = findLoadingBlockRange(st.doc, pastedText)
                  if (!blockRange) return
                  const node = data.isImage
                    ? nodeType.create({ src: data.url, alt: "" })
                    : nodeType.create({ src: data.url })
                  view.dispatch(st.tr.replaceWith(blockRange.start, blockRange.end, node))
                })
                .catch(() => {})
                .finally(() => updateLoading(-1))
            }

            return false
          },
        },
      }),
    ]
  },
})
