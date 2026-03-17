import type { Metadata } from "next"
import { OperationsDashboard } from "../_components/operations-dashboard"
import { DataIntegrityAlerts } from "../_components/data-integrity-alerts"

export const metadata: Metadata = { title: "운영 모니터링" }

export default function AdminOperationsPage() {
  return (
    <>
      <OperationsDashboard />
      <div className="px-6 pb-6">
        <DataIntegrityAlerts />
      </div>
    </>
  )
}
