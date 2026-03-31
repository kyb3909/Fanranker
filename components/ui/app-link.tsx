import NextLink from "next/link"
import type { ComponentProps } from "react"

/**
 * prefetch={false}가 기본인 Link 래퍼.
 * RSC prefetch 폭탄 방지 — 클릭 시에만 데이터를 가져옴.
 * import Link from "next/link" → import Link from "@/components/ui/app-link" 로만 교체하면 됨.
 */
function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />
}

export default Link
