import React from 'react'
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { EmbedCard } from '@/components/embed-card'

/**
 * React component for rendering Embed nodes in TipTap
 * 
 * This component is used by TipTap to render embed nodes in the editor.
 * It extracts attributes from the node and passes them to EmbedCard.
 */
export function EmbedRenderer({ node }: NodeViewProps) {
  const attrs = node.attrs

  return (
    <NodeViewWrapper className="embed-node-wrapper my-4" data-type="embed">
      <EmbedCard
        provider={attrs.provider}
        url={attrs.url}
        html={attrs.html}
        title={attrs.title}
        thumbnail_url={attrs.thumbnail_url}
        author_name={attrs.author_name}
      />
    </NodeViewWrapper>
  )
}

