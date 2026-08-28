import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { KIT_CATALOG, type KitItem } from "../../lib/metaverse/avatar3d/kits"

const ROOT = process.cwd()
const OUTPUT_DIR = path.join(ROOT, "public", "metaverse", "avatar3d", "kits", "v1")
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json")
const LOGO_DIR = path.join(ROOT, "scripts", "avatar3d", "sponsor-logos")
const LOGICAL_SIZE = 512
const SIZE = 1024

// Chest box for the sponsor print, in logical (512) atlas coordinates.
const SPONSOR_BOX = { cx: 96, cy: 94, w: 140, h: 58 }

type ManifestEntry = {
  kitKey: string
  revision: number
  url: string
  sha256: string
  width: number
  height: number
  byteSize: number
  generatedWith: string
}

type Manifest = {
  version: 1
  atlasSize: number
  generatedWith: string
  entries: ManifestEntry[]
}

const rect = {
  front: { x: 0, y: 0, w: 192, h: 256 },
  back: { x: 192, y: 0, w: 192, h: 256 },
  sleeveL: { x: 384, y: 0, w: 64, h: 128 },
  sleeveR: { x: 448, y: 0, w: 64, h: 128 },
  waist: { x: 384, y: 128, w: 128, h: 128 },
  shortsL: { x: 0, y: 256, w: 128, h: 192 },
  shortsR: { x: 128, y: 256, w: 128, h: 192 },
  socksL: { x: 256, y: 256, w: 64, h: 192 },
  socksR: { x: 320, y: 256, w: 64, h: 192 },
  collar: { x: 384, y: 256, w: 64, h: 64 },
  cuffs: { x: 448, y: 256, w: 64, h: 64 },
} as const

function fillRect(region: (typeof rect)[keyof typeof rect], color: string) {
  return `<rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" fill="${color}"/>`
}

function patternSvg(kit: KitItem, regionName: "front" | "back") {
  const region = rect[regionName]
  const clip = `clip-${regionName}`
  const { x, y, w, h } = region
  const accent = kit.palette.accent
  const secondary = kit.palette.secondary
  const pattern = kit.pattern ?? "plain"

  if (pattern === "plain") {
    if (kit.kitKey !== "red-horizon-home") return ""
    return `<g clip-path="url(#${clip})" opacity="0.16" stroke="${kit.palette.dark}" stroke-width="4">
      ${Array.from({ length: 8 }, (_, index) => {
        const offset = index * 34 - 80
        return `<path d="M ${x + offset} ${y + h} L ${x + offset + 160} ${y}"/>`
      }).join("")}
    </g>`
  }

  if (pattern === "vertical-stripes") {
    return `<g clip-path="url(#${clip})">${Array.from(
      { length: 4 },
      (_, index) =>
        `<rect x="${x + 12 + index * 48}" y="${y}" width="22" height="${h}" fill="${accent}"/>`
    ).join("")}</g>`
  }
  if (pattern === "center-stripe") {
    return `<g clip-path="url(#${clip})"><rect x="${x + w * 0.36}" y="${y}" width="${w * 0.28}" height="${h}" fill="${accent}"/><rect x="${x + w * 0.43}" y="${y}" width="${w * 0.14}" height="${h}" fill="${secondary}"/></g>`
  }
  if (pattern === "split") {
    return `<g clip-path="url(#${clip})"><rect x="${x + w / 2}" y="${y}" width="${w / 2}" height="${h}" fill="${secondary}"/><path d="M ${x + w / 2 - 18} ${y} L ${x + w / 2 + 18} ${y + h} L ${x + w / 2 + 2} ${y + h} L ${x + w / 2 - 34} ${y} Z" fill="${accent}"/></g>`
  }
  if (pattern === "hoops") {
    return `<g clip-path="url(#${clip})">${Array.from(
      { length: 4 },
      (_, index) =>
        `<rect x="${x}" y="${y + 30 + index * 56}" width="${w}" height="18" fill="${accent}"/>`
    ).join("")}</g>`
  }
  if (pattern === "vertical-gradient") {
    const gradientId = `gradient-${kit.kitKey}-${regionName}`
    return `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${kit.palette.primary}"/><stop offset="100%" stop-color="${secondary}"/></linearGradient></defs><g clip-path="url(#${clip})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${gradientId})"/><g opacity="0.08" stroke="${accent}" stroke-width="2">${Array.from({ length: 7 }, (_, index) => `<path d="M ${x - 20 + index * 34} ${y + h} L ${x + 50 + index * 34} ${y}"/>`).join("")}</g></g>`
  }
  if (pattern === "tonal-geometric") {
    return `<g clip-path="url(#${clip})" fill="none" stroke="${accent}" stroke-width="7" opacity="0.42">${Array.from(
      { length: 5 },
      (_, index) => {
        const top = y - 30 + index * 62
        return `<path d="M ${x - 22} ${top} L ${x + 28} ${top + 38} L ${x + 72} ${top + 8} L ${x + 122} ${top + 46} L ${x + w + 22} ${top + 12}"/>`
      }
    ).join("")}</g>`
  }
  if (pattern === "flow-streak") {
    return `<g clip-path="url(#${clip})" fill="none" stroke-linecap="round"><path d="M ${x - 28} ${y + h * 0.24} C ${x + w * 0.22} ${y + h * 0.12}, ${x + w * 0.48} ${y + h * 0.72}, ${x + w + 30} ${y + h * 0.48}" stroke="${kit.palette.dark}" stroke-width="34" opacity="0.88"/><path d="M ${x - 24} ${y + h * 0.38} C ${x + w * 0.28} ${y + h * 0.28}, ${x + w * 0.6} ${y + h * 0.86}, ${x + w + 26} ${y + h * 0.6}" stroke="${accent}" stroke-width="19" opacity="0.92"/></g>`
  }
  if (pattern === "tonal-texture") {
    return `<g clip-path="url(#${clip})" opacity="0.72">${Array.from({ length: 30 }, (_, index) => {
      const column = index % 6
      const row = Math.floor(index / 6)
      const cx = x + 16 + column * 34 + (row % 2) * 8
      const cy = y + 18 + row * 48
      const color = index % 5 === 0 ? accent : secondary
      const radius = index % 5 === 0 ? 3.5 : 5.5
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`
    }).join("")}</g>`
  }
  return `<g clip-path="url(#${clip})" fill="none" stroke="${accent}" stroke-width="18" opacity="0.96">
    ${Array.from({ length: 4 }, (_, index) => {
      const top = y - 22 + index * 66
      return `<path d="M ${x - 18} ${top} L ${x + w / 2} ${top + 52} L ${x + w + 18} ${top}"/>`
    }).join("")}
  </g>`
}

function shirtDetailSvg(kit: KitItem) {
  const sleeveRegions = [rect.sleeveL, rect.sleeveR]
  const dualTrim =
    kit.design === "contrast-raglan"
      ? sleeveRegions
          .map(
            (region) => `<g fill="${kit.palette.dark}">
            <rect x="${region.x}" y="${region.y + 17}" width="${region.w}" height="7"/>
            <rect x="${region.x}" y="${region.y + 31}" width="${region.w}" height="7"/>
          </g>`
          )
          .join("")
      : ""
  return `${dualTrim}<rect x="${rect.collar.x}" y="${rect.collar.y}" width="${rect.collar.w}" height="${rect.collar.h}" fill="${kit.palette.dark}"/><rect x="${rect.cuffs.x}" y="${rect.cuffs.y}" width="${rect.cuffs.w}" height="${rect.cuffs.h}" fill="${kit.palette.dark}"/>`
}

function luminance(hex: string) {
  const value = hex.replace("#", "")
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function escapeXml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function sponsorColor(kit: KitItem) {
  return (
    kit.sponsor?.color ?? (luminance(kit.palette.primary) > 0.55 ? kit.palette.dark : "#FFFFFF")
  )
}

function sponsorLogoPath(kit: KitItem) {
  const logo = kit.sponsor?.logo
  if (!logo) return null
  const filePath = path.join(LOGO_DIR, logo)
  return existsSync(filePath) ? filePath : null
}

const tintedLogoCache = new Map<string, Buffer>()

// Renders the sponsor logo as a single-color silhouette (like real kit
// sponsor prints) sized for the chest box, or null when no usable logo.
async function sponsorOverlay(kit: KitItem) {
  const logoPath = sponsorLogoPath(kit)
  if (!logoPath) return null
  const color = sponsorColor(kit)
  const scale = SIZE / LOGICAL_SIZE
  const cacheKey = `${logoPath}:${color}`
  let tinted = tintedLogoCache.get(cacheKey)
  if (!tinted) {
    // Render generously, trim transparent margins (some sources ship square
    // canvases with the mark in a narrow band), then fit the chest box.
    const oversized = await sharp(logoPath, { density: 150 })
      .resize(1200, 1200, { fit: "inside" })
      .ensureAlpha()
      .png()
      .toBuffer()
    const rendered = await sharp(oversized)
      .trim({ background: "rgba(0,0,0,0)", threshold: 12 })
      .resize(SPONSOR_BOX.w * scale, SPONSOR_BOX.h * scale, { fit: "inside" })
      .png()
      .toBuffer()
    const meta = await sharp(rendered).metadata()
    tinted = await sharp({
      create: {
        width: meta.width ?? SPONSOR_BOX.w * scale,
        height: meta.height ?? SPONSOR_BOX.h * scale,
        channels: 4,
        background: color,
      },
    })
      .composite([{ input: rendered, blend: "dest-in" }])
      .png()
      .toBuffer()
    tintedLogoCache.set(cacheKey, tinted)
  }
  const meta = await sharp(tinted).metadata()
  return {
    input: tinted,
    left: Math.round((rect.front.x + SPONSOR_BOX.cx) * scale - (meta.width ?? 0) / 2),
    top: Math.round((rect.front.y + SPONSOR_BOX.cy) * scale - (meta.height ?? 0) / 2),
  }
}

function sponsorText(kit: KitItem, regionName: "front" | "back") {
  const sponsor = kit.sponsor
  if (!sponsor) return ""
  if (sponsorLogoPath(kit)) return ""
  const region = rect[regionName]
  const color = sponsorColor(kit)
  const style = sponsor.style ?? "sans"
  const fontAttrs =
    style === "serif-italic"
      ? `font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="600"`
      : style === "wide"
        ? `font-family="Arial, sans-serif" font-weight="700" letter-spacing="2.5"`
        : `font-family="Arial, sans-serif" font-weight="700"`
  const perChar = style === "wide" ? 0.82 : 0.6
  const size = Math.max(13, Math.min(27, Math.floor(148 / (sponsor.text.length * perChar))))
  const cx = region.x + region.w / 2
  return `<text x="${cx}" y="${region.y + 104}" text-anchor="middle" font-size="${size}" fill="${color}" ${fontAttrs}>${escapeXml(sponsor.text)}</text>`
}

function kitSvg(kit: KitItem) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${LOGICAL_SIZE} ${LOGICAL_SIZE}">
    <defs>
      <clipPath id="clip-front"><rect x="${rect.front.x}" y="${rect.front.y}" width="${rect.front.w}" height="${rect.front.h}"/></clipPath>
      <clipPath id="clip-back"><rect x="${rect.back.x}" y="${rect.back.y}" width="${rect.back.w}" height="${rect.back.h}"/></clipPath>
    </defs>
    <rect width="${LOGICAL_SIZE}" height="${LOGICAL_SIZE}" fill="${kit.palette.primary}"/>
    ${fillRect(rect.front, kit.palette.primary)}
    ${fillRect(rect.back, kit.palette.primary)}
    ${fillRect(rect.sleeveL, kit.palette.secondary)}
    ${fillRect(rect.sleeveR, kit.palette.secondary)}
    ${fillRect(rect.waist, kit.palette.shorts)}
    ${fillRect(rect.shortsL, kit.palette.shorts)}
    ${fillRect(rect.shortsR, kit.palette.shorts)}
    ${fillRect(rect.socksL, kit.palette.socks)}
    ${fillRect(rect.socksR, kit.palette.socks)}
    ${patternSvg(kit, "front")}
    ${patternSvg(kit, "back")}
    ${shirtDetailSvg(kit)}
    ${sponsorText(kit, "front")}
  </svg>`
}

async function removePriorGeneratedFiles() {
  try {
    const previous = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest
    await Promise.all(
      previous.entries.map(async (entry) => {
        const filename = path.basename(entry.url)
        if (/^[a-z0-9-]+\.r\d+\.[a-f0-9]{8}\.png$/.test(filename)) {
          await rm(path.join(OUTPUT_DIR, filename), { force: true })
        }
      })
    )
  } catch {
    // First generation has no manifest.
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })
  await removePriorGeneratedFiles()
  const entries: ManifestEntry[] = []

  for (const kit of [...KIT_CATALOG].sort((a, b) => a.kitKey.localeCompare(b.kitKey))) {
    const overlay = await sponsorOverlay(kit)
    const base = sharp(Buffer.from(kitSvg(kit)))
    const png = await (overlay ? base.composite([overlay]) : base)
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: true })
      .toBuffer()
    const sha256 = createHash("sha256").update(png).digest("hex")
    const filename = `${kit.kitKey}.r${kit.revision}.${sha256.slice(0, 8)}.png`
    await writeFile(path.join(OUTPUT_DIR, filename), png)
    entries.push({
      kitKey: kit.kitKey,
      revision: kit.revision,
      url: `/metaverse/avatar3d/kits/v1/${filename}`,
      sha256,
      width: SIZE,
      height: SIZE,
      byteSize: png.byteLength,
      generatedWith: `sharp-${sharp.versions.sharp}`,
    })
  }

  const manifest: Manifest = {
    version: 1,
    atlasSize: SIZE,
    generatedWith: `sharp-${sharp.versions.sharp}`,
    entries,
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  console.log(`Generated ${entries.length} kit atlases in ${OUTPUT_DIR}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
