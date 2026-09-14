import "server-only"
import { clerkClient } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

type DB = ReturnType<typeof createServiceRoleClient>
/** Safe to repeat after a provider success whose local acknowledgement was lost. */
export async function finishAccountDeletion(db: DB, userId: string): Promise<boolean> {
  const { data: request, error } = await db
    .from("account_deletion_requests")
    .select("user_id,completed_at,attempts")
    .eq("user_id", userId)
    .single()
  if (error || !request) throw new Error("account-deletion-request-unavailable")
  if (request.completed_at) return true
  try {
    const clerk = await clerkClient()
    try {
      await clerk.users.deleteUser(userId)
    } catch (cause) {
      if (!cause || typeof cause !== "object" || !("status" in cause) || cause.status !== 404)
        throw cause
    }
    const { error: saved } = await db
      .from("account_deletion_requests")
      .update({
        completed_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
        attempts: request.attempts + 1,
        last_error: null,
      })
      .eq("user_id", userId)
      .is("completed_at", null)
    if (saved) return false
    return true
  } catch {
    await db
      .from("account_deletion_requests")
      .update({
        attempts: request.attempts + 1,
        last_attempt_at: new Date().toISOString(),
        last_error: "Clerk deletion unavailable; retry required",
      })
      .eq("user_id", userId)
      .is("completed_at", null)
    return false
  }
}
