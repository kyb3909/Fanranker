/** 정적 시연 작품의 공유 이미지를 같은 ArtTile 컴포넌트에서 내보낸다. */
import React from "react"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import sharp from "sharp"
import { ArtTile } from "../app/goods-lab/art-tile"
import { GALLERY, teamOf } from "../app/goods-lab/fixtures"

async function main() {
  const directory = join(process.cwd(), "public", "goods-lab", "previews")
  await mkdir(directory, { recursive: true })
  let count = 0
  for (const piece of GALLERY) {
    if (piece.image) continue
    const team = teamOf(piece.teamId)
    const svg = renderToStaticMarkup(
      <ArtTile
        kind={piece.kind}
        color={team.color}
        darkInk={team.darkInk}
        word={piece.word}
        teamName={team.name}
        fit="contain"
        size={1200}
      />
    )
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    await writeFile(join(directory, `${piece.id}.png`), png)
    count++
  }
  console.log(`굿즈랩 원화 공유 이미지 ${count}개 생성`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
