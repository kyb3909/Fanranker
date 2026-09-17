import { notFound } from "next/navigation"
import { FootballSpritePreview } from "./preview"

export default function FootballSpritesPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  return <FootballSpritePreview />
}
