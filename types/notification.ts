/** 알림 메타데이터 */
export interface NotificationMetadata {
  sport?: string
  prediction_count?: number
  settlement_profit?: number
  settlement_status?: "won" | "lost"
  [key: string]: unknown
}

/** 알림 항목 */
export interface Notification {
  id: string
  type: "comment" | "reply" | "new_post_by_followed" | "expert_prediction" | "settlement_result"
  actor_id: string
  related_post_id: string | null
  related_comment_id: string | null
  is_read: boolean
  created_at: string
  metadata: NotificationMetadata | null
}
