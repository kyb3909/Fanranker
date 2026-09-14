import "server-only"
import { cache } from "react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getMatchIdentity } from "./sibling-ids"

// React request cache only. Writers keep fresh, strict identity resolution.
export const getReadMatchIdentity = cache(async (gameId: string) =>
  getMatchIdentity(createServiceRoleClient(), gameId, { strict: true })
)
