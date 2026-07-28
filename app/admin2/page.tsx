import type { Metadata } from "next"
import { Workbench } from "./workbench"

export const metadata: Metadata = { title: "운영 작업대" }
export const dynamic = "force-dynamic"

export default function Admin2Page() {
  return <Workbench />
}
