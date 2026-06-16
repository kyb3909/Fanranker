import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { canPostNotice } from "@/lib/board-moderator"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { NoticeForm } from "./notice-form"

export const metadata = { robots: { index: false, follow: false } }

export default async function NoticeNewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { userId } = await auth()
  if (!userId) notFound()

  const supabase = createServiceRoleClient()
  // MOD/관리자만 접근. 권한 없으면 404 (메뉴 노출도 권한 기반이지만 직접 URL 접근 차단).
  if (!(await canPostNotice(supabase, userId, slug))) notFound()

  const boardName = COMMUNITY_NAMES[slug] ?? slug

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <main id="main-content" className="mx-auto max-w-[720px] px-4 py-6" tabIndex={-1}>
        <div className="mb-4">
          <div className="wc-sec-eb">공지 작성</div>
          <h1 className="text-[22px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            {boardName} 게시판
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--wc-mute)" }}>
            등록한 공지는 게시판 상단에 고정됩니다.
          </p>
        </div>
        <NoticeForm slug={slug} />
      </main>
    </div>
  )
}
