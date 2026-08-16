import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * 운영 권한 경계 — **여기 한 곳에서만 정한다.**
 *
 * 흩어놓으면 새 화면을 만들 때마다 판정이 갈리고, 그 틈이 그대로 권한 구멍이 된다.
 * 기존에 `admin.ts`(페이지용)와 `require-admin-api.ts`(API용)가 각자 `role === "admin"`
 * 을 하드코딩하고 있었는데, 등급이 둘 이상이 되는 순간 그 방식은 못 버틴다.
 *
 * ## 등급
 * - `admin`  — 전권. 돈(정산·환불·경제조정)·권한 변경·사용자 관리 포함
 * - `editor` — **콘텐츠 검수만.** /admin2 진입 + AI 뉴스/커뮤글 발행·반려.
 *              돈과 권한에는 절대 닿지 않는다.
 *
 * `moderator` 는 이름과 달리 관리자 패널 권한이 아니다(게시판 공지 작성 여부 플래그).
 * 혼동을 피하려 여기서는 다루지 않는다 — lib/board-moderator.ts 소관.
 *
 * ## 원칙
 * 새 API 를 만들 때 **기본값은 `requireAdminApi`(전권)** 이다. editor 에게 열어야 할
 * 이유가 분명할 때만 `requireStaffApi` 를 쓴다. 반대로 하면 실수로 열린다.
 */

type StaffRole = "admin" | "editor"

export const ADMIN_ROLE = "admin"

/** 이 등급들만 /admin2 에 들어올 수 있다 */
const STAFF_ROLES: readonly string[] = [ADMIN_ROLE, "editor"]

/**
 * 현재 로그인 유저의 profiles.role — 권한 판정의 단일 조회 지점.
 * (2026-08-08 감사 P2-6: admin.ts / require-admin-api.ts 가 각자 role 조회와
 * `=== "admin"` 비교를 하드코딩하던 3중 정의를 여기로 수렴 — 두 파일은 위임만 남음)
 */
export async function getCurrentRole(): Promise<string | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null
    const supabase = createServiceRoleClient()
    const { data } = await supabase.from("profiles").select("role").eq("user_id", userId).single()
    return data?.role ?? null
  } catch (e) {
    console.error("역할 조회 실패:", e)
    return null
  }
}

export async function getStaffRole(): Promise<StaffRole | null> {
  const role = await getCurrentRole()
  return role && STAFF_ROLES.includes(role) ? (role as StaffRole) : null
}

interface RoleAuth {
  userId: string
  role: string
  supabase: ReturnType<typeof createServiceRoleClient>
}

/**
 * API 권한 판정 공용 엔진 — 미로그인 401, 등급 미달이면 403(메시지는 호출부 지정).
 * requireStaffApi / requireAdminApi 가 공유한다.
 */
export async function requireRoleApi(
  allowed: readonly string[],
  forbiddenMessage: string
): Promise<RoleAuth | NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .single()

  const role = profile?.role
  if (!role || !allowed.includes(role)) {
    return NextResponse.json({ error: forbiddenMessage }, { status: 403 })
  }

  return { userId, role, supabase }
}

/**
 * 페이지(서버 컴포넌트)용 — admin 또는 editor 면 통과.
 * 실패 시 throw (레이아웃에서 catch → redirect).
 */
export async function requireStaff(): Promise<StaffRole> {
  const role = await getStaffRole()
  if (!role) throw new Error("운영 권한이 필요합니다.")
  return role
}

interface StaffAuth {
  userId: string
  role: StaffRole
  supabase: ReturnType<typeof createServiceRoleClient>
}

/**
 * API 용 — admin 또는 editor 면 통과. 아니면 401/403 응답을 반환한다.
 *
 * ⚠️ 돈·권한을 건드리는 라우트에는 절대 쓰지 마라. 그쪽은 `requireAdminApi`.
 */
export async function requireStaffApi(): Promise<StaffAuth | NextResponse> {
  const result = await requireRoleApi(STAFF_ROLES, "운영 권한이 필요합니다.")
  if (result instanceof NextResponse) return result
  return { userId: result.userId, role: result.role as StaffRole, supabase: result.supabase }
}
