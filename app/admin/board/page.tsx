import type { Metadata } from "next"
import { OpsBoard } from "../_components/ops-board"

export const metadata: Metadata = { title: "할 일 보드" }

export default function AdminBoardPage() {
  return <OpsBoard />
}
