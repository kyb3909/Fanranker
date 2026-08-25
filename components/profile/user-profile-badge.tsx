"use client"

import { Badge } from "@/components/ui/badge"
import { Crown } from "lucide-react"
import { cn } from "@/lib/utils"

interface UserProfileBadgeProps {
  isExpert?: boolean
  className?: string
  size?: "sm" | "md" | "lg"
}

/**
 * UserProfileBadge Component
 *
 * Displays an expert badge next to user names/avatars when they are certified experts
 */
export function UserProfileBadge({ isExpert, className, size = "sm" }: UserProfileBadgeProps) {
  if (!isExpert) {
    return null
  }

  const sizeClasses = {
    sm: "text-[12px] px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-sm px-2.5 py-1.5",
  }

  const iconSizes = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-3.5 w-3.5",
  }

  return (
    <Badge
      variant="default"
      className={cn(
        "border-0 bg-gradient-to-r from-amber-500 to-orange-500 font-medium text-white",
        "inline-flex items-center gap-1",
        sizeClasses[size],
        className
      )}
    >
      <Crown className={iconSizes[size]} fill="currentColor" />
      <span>전문가</span>
    </Badge>
  )
}
