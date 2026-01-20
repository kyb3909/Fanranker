import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * URL detection regex patterns for supported providers
 * Note: No 'g' flag to avoid lastIndex issues with .test()
 */
const URL_PATTERNS = {
  youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/,
  x: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/,
}

/**
 * Detect if a URL matches any supported oEmbed provider
 */
function detectProvider(url: string): 'youtube' | 'instagram' | 'x' | null {
  if (URL_PATTERNS.youtube.test(url)) {
    return 'youtube'
  }
  if (URL_PATTERNS.instagram.test(url)) {
    return 'instagram'
  }
  if (URL_PATTERNS.x.test(url)) {
    return 'x'
  }
  return null
}

/**
 * Normalize URL to ensure it's a full URL
 */
function normalizeUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}

/**
 * TipTap Extension that automatically converts pasted URLs into embed nodes
 * 
 * When a user pastes a URL that matches a supported provider:
 * 1. Detects the provider
 * 2. Shows loading placeholder
 * 3. Calls /api/oembed to fetch embed data
 * 4. Replaces placeholder with embed node (or URL on error)
 */
export const EmbedPaste = Extension.create({
  name: 'embedPaste',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('embedPaste'),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain') || ''
            const trimmedText = text.trim()

            // Check if pasted content is a single URL
            if (!trimmedText || trimmedText.includes('\n') || trimmedText.split(/\s+/).length > 1) {
              return false // Not a single URL, let default handler process
            }

            const provider = detectProvider(trimmedText)
            if (!provider) {
              return false // Not a supported provider
            }

            // Prevent default paste behavior
            event.preventDefault()

            const normalizedUrl = normalizeUrl(trimmedText)
            
            // 즉시 로딩 텍스트 삽입
            const loadingText = `⏳ ${provider} 임베드 로딩 중...`
            
            // 현재 커서 위치에 로딩 텍스트 삽입
            const { state } = view
            const { from } = state.selection
            let tr = state.tr.insertText(loadingText, from)
            view.dispatch(tr)

            // oEmbed 데이터 가져오기
            fetch(`/api/oembed?url=${encodeURIComponent(normalizedUrl)}&includeHtml=true`)
              .then(async (res) => {
                if (!res.ok) {
                  throw new Error('Failed to fetch oEmbed data')
                }
                return res.json()
              })
              .then((data) => {
                // 로딩 텍스트 찾기
                const currentState = view.state
                const docText = currentState.doc.textContent
                const loadingIndex = docText.indexOf(loadingText)
                
                if (loadingIndex === -1) {
                  console.warn('Loading text not found, inserting at cursor')
                  return
                }

                // 텍스트 위치를 문서 위치로 변환
                let textOffset = 0
                let startPos = -1
                
                currentState.doc.descendants((node, pos) => {
                  if (startPos !== -1) return false
                  
                  if (node.isText) {
                    const nodeText = node.text || ''
                    const localIndex = nodeText.indexOf(loadingText)
                    if (localIndex !== -1) {
                      startPos = pos + localIndex
                      return false
                    }
                  }
                  return true
                })

                if (startPos === -1) {
                  console.warn('Could not find loading text position')
                  return
                }

                const endPos = startPos + loadingText.length
                const embedNodeType = currentState.schema.nodes.embed

                if (!embedNodeType) {
                  console.error('Embed node type not found in schema')
                  const replaceTr = currentState.tr.replaceWith(
                    startPos,
                    endPos,
                    currentState.schema.text(normalizedUrl)
                  )
                  view.dispatch(replaceTr)
                  return
                }

                // Embed 노드 생성 및 삽입
                const embedNode = embedNodeType.create({
                  provider: data.provider,
                  url: data.url,
                  html: data.html,
                  title: data.title,
                  thumbnail_url: data.thumbnail_url,
                  author_name: data.author_name,
                })

                const replaceTr = currentState.tr.replaceWith(startPos, endPos, embedNode)
                view.dispatch(replaceTr)
              })
              .catch((error) => {
                console.warn('Failed to fetch oEmbed:', error)
                
                // 로딩 텍스트를 URL로 교체
                const currentState = view.state
                let startPos = -1
                
                currentState.doc.descendants((node, pos) => {
                  if (startPos !== -1) return false
                  
                  if (node.isText) {
                    const nodeText = node.text || ''
                    const localIndex = nodeText.indexOf(loadingText)
                    if (localIndex !== -1) {
                      startPos = pos + localIndex
                      return false
                    }
                  }
                  return true
                })

                if (startPos !== -1) {
                  const endPos = startPos + loadingText.length
                  const replaceTr = currentState.tr.replaceWith(
                    startPos,
                    endPos,
                    currentState.schema.text(normalizedUrl)
                  )
                  view.dispatch(replaceTr)
                }
              })

            return true
          },
        },
      }),
    ]
  },
})

