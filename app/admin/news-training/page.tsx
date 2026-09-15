import { requireAdminPageAccess } from "@/lib/admin/page-access"
import { TrainingCenter } from "@/components/admin/training-center"
export const metadata = { title: "학습 작업실 | 관리자" }
export default async function Page() {
  await requireAdminPageAccess("/admin/news-training")
  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-xs">관리자 / 기사 학습·자동화</p>
        <h1 className="text-2xl font-bold">학습 작업실</h1>
        <p className="text-muted-foreground text-sm leading-6">
          올라온 기사를 직접 고치고, AI가 이해한 교정 이유를 확인하며 내 편집 기준을 가르칩니다.
        </p>
      </header>
      <TrainingCenter />
    </main>
  )
}
