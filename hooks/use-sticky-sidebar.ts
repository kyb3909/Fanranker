"use client"

import { useRef, useState, useEffect, useCallback } from "react"

/**
 * Sticky sidebar hook: calculates the correct `top` value.
 * - Sidebar shorter than viewport → sticks below the header
 * - Sidebar taller than viewport → scrolls with page, sticks when bottom hits viewport bottom
 */
export function useStickySidebar() {
  const ref = useRef<HTMLDivElement>(null)
  const [stickyTop, setStickyTop] = useState(0)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return

    const sidebarH = el.offsetHeight
    const viewportH = window.innerHeight
    const header = document.querySelector("header")
    const headerH = header ? header.offsetHeight : 0

    const availableH = viewportH - headerH
    if (sidebarH <= availableH) {
      // Sidebar fits below header — stick right below it
      setStickyTop(headerH)
    } else {
      // Sidebar taller — stick when bottom reaches viewport bottom
      setStickyTop(viewportH - sidebarH)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    update()
    // Re-calc after async content loads (SWR data, images, etc.)
    const timer = setTimeout(update, 500)

    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("resize", update)

    return () => {
      clearTimeout(timer)
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [update])

  return { ref, stickyTop }
}
