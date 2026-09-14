import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { getStaffRole } from "@/lib/admin/roles"
import { canOpenAdminPath, fallbackPathFor } from "@/lib/admin/route-access"

// Shared only within an RSC request: layout and page read the same role without
// a second DB lookup. API mutation guards continue to check their own requests.
const getPageStaffRole = cache(getStaffRole)

/**
 * Call before loading privileged page data. Pages pass their own fixed route,
 * so authorization does not depend on a header or on the parent layout running
 * first (layouts and pages can render in parallel).
 */
export async function requireAdminPageAccess(pathname: string | null) {
  const role = await getPageStaffRole()
  if (!role) redirect("/")
  if (!canOpenAdminPath(role, pathname)) redirect(fallbackPathFor(role, pathname))
  return role
}
