import { ALL_COMMUNITIES } from "@/lib/constants/communities"
import { BulkNoticeForm } from "./bulk-notice-form"

export default function AdminNoticesPage() {
  const boards = ALL_COMMUNITIES.map((c) => ({ slug: c.slug, name: c.name }))

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">일괄 공지</h1>
        <p className="text-muted-foreground text-sm">
          선택한 게시판에 상단 고정 공지를 한 번에 등록합니다.
        </p>
      </div>
      <BulkNoticeForm boards={boards} />
    </main>
  )
}
