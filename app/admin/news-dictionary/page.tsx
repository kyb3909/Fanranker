import { requireAdminPageAccess } from "@/lib/admin/page-access"
import { NewsDictionaryManager } from "@/components/admin/news-dictionary"
export const metadata = { title: "통합 표기 사전 | 관리자" }
export default async function Page() {
  await requireAdminPageAccess("/admin/news-dictionary")
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-xs">관리자 / 학습 작업실 / 사전</p>
        <h1 className="text-2xl font-bold">통합 표기 사전</h1>
        <p className="text-muted-foreground text-sm leading-6">
          미완료 선수의 영문 이름을 보며 한글 이름을 표에서 연속 입력합니다. 팀·감독·용어와 별칭은
          ‘검색·직접 등록’에서 정리하세요.
        </p>
      </header>
      <NewsDictionaryManager />
    </main>
  )
}
