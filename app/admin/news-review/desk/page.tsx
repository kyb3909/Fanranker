import { requireAdminPageAccess } from "@/lib/admin/page-access"
import { DeskWorkspace } from "./workspace"

export const dynamic = "force-dynamic"
export default async function NewsDeskPage() {
  await requireAdminPageAccess("/admin/news-review/desk")
  return <DeskWorkspace />
}
