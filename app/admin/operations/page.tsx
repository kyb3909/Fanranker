import type { Metadata } from "next"
import { OperationsDashboard } from "../_components/operations-dashboard"

export const metadata: Metadata = { title: "운영 모니터링" }

export default function AdminOperationsPage() {
  return <OperationsDashboard />
}
