"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export function BackButton() {
  const router = useRouter()

  return (
    <Button variant="ghost" size="sm" className="gap-2" onClick={() => router.back()}>
      <ArrowLeft className="h-4 w-4" />
      돌아가기
    </Button>
  )
}
