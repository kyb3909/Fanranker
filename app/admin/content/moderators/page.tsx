import { ALL_COMMUNITIES } from "@/lib/constants/communities"
import { ModeratorsManager } from "./moderators-manager"

export default function AdminModeratorsPage() {
  const boards = ALL_COMMUNITIES.map((c) => ({ slug: c.slug, name: c.name }))

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">게시판 MOD 관리</h1>
        <p className="text-muted-foreground text-sm">
          게시판별로 모더레이터(MOD)를 지정합니다. MOD는 담당 게시판에 공지를 올릴 수 있어요.
        </p>
      </div>
      <ModeratorsManager boards={boards} />
    </main>
  )
}
