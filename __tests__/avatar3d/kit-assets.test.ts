import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { KIT_CATALOG } from "@/lib/metaverse/avatar3d/kits"

type Manifest = {
  version: number
  atlasSize: number
  entries: Array<{
    kitKey: string
    revision: number
    url: string
    sha256: string
    width: number
    height: number
    byteSize: number
  }>
}

const root = process.cwd()
const assetDir = path.join(root, "public", "metaverse", "avatar3d", "kits", "v1")
const manifest = JSON.parse(readFileSync(path.join(assetDir, "manifest.json"), "utf8")) as Manifest

describe("avatar kit texture assets", () => {
  it("keeps catalog, manifest, and PNG files in a one-to-one relationship", () => {
    const pngFiles = readdirSync(assetDir).filter((filename) => filename.endsWith(".png"))
    expect(manifest.version).toBe(1)
    expect(manifest.atlasSize).toBe(1024)
    expect(manifest.entries).toHaveLength(KIT_CATALOG.length)
    expect(pngFiles).toHaveLength(KIT_CATALOG.length)
    expect(new Set(manifest.entries.map((entry) => entry.kitKey))).toEqual(
      new Set(KIT_CATALOG.map((kit) => kit.kitKey))
    )
  })

  it("ships valid immutable assets with matching hashes and decodable dimensions", async () => {
    for (const entry of manifest.entries) {
      const filename = path.basename(entry.url)
      const filePath = path.join(assetDir, filename)
      expect(existsSync(filePath), entry.kitKey).toBe(true)
      expect(filename).toMatch(
        new RegExp(`^${entry.kitKey}\\.r${entry.revision}\\.${entry.sha256.slice(0, 8)}\\.png$`)
      )
      const contents = readFileSync(filePath)
      expect(createHash("sha256").update(contents).digest("hex"), entry.kitKey).toBe(entry.sha256)
      expect(contents.byteLength, entry.kitKey).toBe(entry.byteSize)
      expect(entry.width).toBe(1024)
      expect(entry.height).toBe(1024)
      expect(entry.byteSize).toBeLessThan(160_000)
      const metadata = await sharp(contents).metadata()
      expect(metadata.format, entry.kitKey).toBe("png")
      expect(metadata.width, entry.kitKey).toBe(entry.width)
      expect(metadata.height, entry.kitKey).toBe(entry.height)
    }
  })

  it("keeps crests and badges out while every kit carries a sponsor wordmark", () => {
    // Sponsor text is operator-approved (2026-08-29, kits.ts CLUB_SPONSORS);
    // crests, badges and monograms stay banned from the generator.
    const generatedScript = readFileSync(
      path.join(root, "scripts", "avatar3d", "generate-kit-textures.ts"),
      "utf8"
    )
    expect(generatedScript).not.toMatch(/AERIA|monogram|badge|crest/i)
    for (const kit of KIT_CATALOG) {
      expect(kit.sponsor?.text, kit.kitKey).toBeTruthy()
    }
  })

  it("exports the Colin avatar GLB with kit material slots, UVs, and hair styles", () => {
    const glb = readFileSync(
      path.join(root, "public", "metaverse", "avatar3d", "colin-avatar-v1.glb")
    )
    const jsonLength = glb.readUInt32LE(12)
    const document = JSON.parse(
      glb
        .subarray(20, 20 + jsonLength)
        .toString("utf8")
        .replace(/\0+$/, "")
    ) as {
      materials?: Array<{ name?: string }>
      meshes?: Array<{ primitives: Array<{ attributes: { TEXCOORD_0?: number } }> }>
      nodes?: Array<{ name?: string }>
    }
    const materialNames = new Set(document.materials?.map((material) => material.name))
    for (const materialName of ["KIT_ATLAS", "KIT_BOOTS", "KIT_SOLE", "CHAR_SKIN", "CHAR_HAIR"]) {
      expect(materialNames.has(materialName), materialName).toBe(true)
    }
    expect(
      document.meshes?.some((mesh) =>
        mesh.primitives.some((primitive) => primitive.attributes.TEXCOORD_0 !== undefined)
      )
    ).toBe(true)
    const nodeNames = document.nodes?.map((node) => node.name ?? "") ?? []
    for (const style of ["short", "bob", "ponytail", "twintail"]) {
      expect(
        nodeNames.some((name) => name.startsWith(`hair_style_${style}_`)),
        style
      ).toBe(true)
    }
  })
})
