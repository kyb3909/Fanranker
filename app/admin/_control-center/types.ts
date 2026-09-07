import type { Observation, OutcomeItem, WorkItem } from "@/lib/admin/control-center"
import type { PipelineStatus } from "@/lib/admin/pipeline-status"

/** `/api/admin/control-center` 응답 — 화면과 라우트가 같은 모양을 본다 */
export interface PipelineRow {
  key: string
  label: string
  status: PipelineStatus
  detail: string
  hint: string
}

export interface ControlCenterResponse {
  generatedAt: string
  role: "admin" | "editor"
  observations: Observation[]
  items: WorkItem[]
  outcomes: OutcomeItem[]
  pipelines: PipelineRow[]
}
