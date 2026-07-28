"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // 언더라인 탭 — 회색 박스(bg-muted) 제거, 하단 1px 구분선 + 균등분할
        "flex w-full items-stretch border-b border-[#f2efea] px-3",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // 언더라인 탭 트리거 — 균등분할, 비활성 회색/활성 와인+밑줄, 박스/그림자 제거
        "-mb-px inline-flex flex-1 items-center justify-center gap-1.5 border-b-2 border-transparent bg-transparent px-2 py-[13px] text-sm font-medium whitespace-nowrap text-[#7A828A] transition-colors hover:text-[#3A3F45] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-[#961E37] data-[state=active]:font-bold data-[state=active]:text-[#961E37] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
