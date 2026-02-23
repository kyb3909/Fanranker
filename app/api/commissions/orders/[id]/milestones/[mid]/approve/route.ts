import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id, mid } = await params
    const supabase = createServiceRoleClient()

    const { data: order } = await supabase
      .from('commission_orders')
      .select('*')
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
    if (order.client_id !== user.id) return NextResponse.json({ error: '의뢰인만 승인할 수 있습니다.' }, { status: 403 })

    const { data: milestone } = await supabase
      .from('commission_milestones')
      .select('*')
      .eq('id', mid)
      .eq('order_id', id)
      .single()

    if (!milestone) return NextResponse.json({ error: '마일스톤을 찾을 수 없습니다.' }, { status: 404 })
    if (milestone.status !== 'submitted') return NextResponse.json({ error: '제출된 마일스톤만 승인할 수 있습니다.' }, { status: 400 })

    const body = await request.json().catch(() => null) as Record<string, unknown> | null

    // Approve milestone
    await supabase
      .from('commission_milestones')
      .update({
        status: 'approved',
        feedback: body?.feedback || '',
        approved_at: new Date().toISOString(),
      })
      .eq('id', mid)

    // Check if all milestones are approved
    const { data: allMilestones } = await supabase
      .from('commission_milestones')
      .select('status')
      .eq('order_id', id)

    const allApproved = allMilestones?.every(m => m.status === 'approved')

    if (allApproved) {
      // Set auto_release timer (3 days)
      const autoRelease = new Date()
      autoRelease.setDate(autoRelease.getDate() + 3)

      await supabase
        .from('commission_orders')
        .update({
          status: 'review',
          submitted_at: new Date().toISOString(),
          auto_release_at: autoRelease.toISOString(),
        })
        .eq('id', id)

      await supabase.from('commission_messages').insert({
        order_id: id,
        sender_id: 'system',
        message_type: 'system',
        content: '모든 마일스톤이 승인되었습니다. 최종 확인 후 완료 처리해주세요. (3일 후 자동 정산)',
      })
    } else {
      // Move next milestone to in_progress
      const nextMilestone = allMilestones?.find(m => m.status === 'pending')
      if (nextMilestone) {
        // Find the next pending by milestone_number
        const { data: pendingMilestones } = await supabase
          .from('commission_milestones')
          .select('id')
          .eq('order_id', id)
          .eq('status', 'pending')
          .order('milestone_number', { ascending: true })
          .limit(1)

        if (pendingMilestones?.[0]) {
          await supabase
            .from('commission_milestones')
            .update({ status: 'in_progress' })
            .eq('id', pendingMilestones[0].id)
        }
      }

      await supabase
        .from('commission_orders')
        .update({ status: 'in_progress' })
        .eq('id', id)
    }

    await supabase.from('notifications').insert({
      user_id: order.artist_id,
      type: 'commission_milestone_approved',
      actor_id: user.id,
    })

    await supabase.from('commission_messages').insert({
      order_id: id,
      sender_id: 'system',
      message_type: 'system',
      content: `의뢰인이 "${milestone.title}" 결과물을 승인했습니다.`,
    })

    return NextResponse.json({ success: true, all_approved: allApproved })
  } catch (error) {
    return apiError('서버 오류', 500, error)
  }
}
