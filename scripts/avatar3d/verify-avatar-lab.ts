import { mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { chromium } from "playwright"
import sharp from "sharp"
import {
  AVAILABLE_CLUBS,
  getKitsForClub,
  INITIAL_KIT_BALANCE,
  KIT_CATALOG,
} from "../../lib/metaverse/avatar3d/kits"

const root = process.cwd()
const outputDir = path.join(root, "output", "playwright")
const clubCaptureDir = path.join(outputDir, "avatar-clubs")
const baseUrl = process.env.AVATAR_LAB_URL ?? "http://127.0.0.1:4193/avatar-lab"

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    }
    return entities[character] ?? character
  })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await mkdir(clubCaptureDir, { recursive: true })
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const consoleErrors: string[] = []
  const ignoredExternalWarnings: string[] = []
  const failedRequests: string[] = []
  const loadedAtlases = new Set<string>()

  page.on("console", (message) => {
    if (message.type() !== "error") return
    const text = message.text()
    if (/google\.com.*report-only Content Security Policy/i.test(text)) {
      ignoredExternalWarnings.push(text)
      return
    }
    consoleErrors.push(text)
  })
  page.on("requestfailed", (request) => {
    const url = new URL(request.url())
    const isLocalAsset =
      url.origin === new URL(baseUrl).origin &&
      (url.pathname.startsWith("/metaverse/avatar3d/") || url.pathname.startsWith("/_next/"))
    if (isLocalAsset)
      failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`)
  })
  page.on("response", (response) => {
    if (
      response.url().includes("/metaverse/avatar3d/kits/v1/") &&
      response.url().endsWith(".png")
    ) {
      if (!response.ok()) failedRequests.push(`${response.status()} ${response.url()}`)
      loadedAtlases.add(response.url())
    }
  })

  const documentResponse = await page.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  })
  if (!documentResponse?.ok()) {
    throw new Error(`Avatar lab document failed: ${documentResponse?.status() ?? "no response"}`)
  }
  await page.locator("canvas").waitFor({ state: "visible" })
  await page.waitForTimeout(1_500)
  const waitForRenderedKit = async (kitKey: string) => {
    await page.waitForFunction(
      (expectedKitKey) => {
        const canvas = document.querySelector("canvas")
        return (
          canvas?.getAttribute("data-rendered-kit") === expectedKitKey &&
          canvas?.getAttribute("data-kit-render-status") === "texture"
        )
      },
      kitKey,
      { timeout: 10_000 }
    )
    await page.waitForTimeout(50)
  }
  const home = getKitsForClub("arsenal").find((kit) => kit.kitKey === "red-horizon-home")
  if (!home) throw new Error("Arsenal home kit is missing")
  await page.locator(`[aria-label^="${home.name}"]`).click()
  await waitForRenderedKit(home.kitKey)
  await page.locator("canvas").screenshot({ path: path.join(outputDir, "avatar-kit-home-uv.png") })

  const away = getKitsForClub("arsenal").find((kit) => kit.kitKey === "ivory-orbit-away")
  if (!away) throw new Error("Arsenal away kit is missing")
  await page.locator(`[aria-label^="${away.name}"]`).click()
  await waitForRenderedKit(away.kitKey)
  await page.locator("canvas").screenshot({ path: path.join(outputDir, "avatar-kit-away-uv.png") })

  const awayCard = page.locator(`[data-kit-key="${away.kitKey}"]`)
  const balanceBefore = Number(
    await page.locator("[data-shop-balance]").getAttribute("data-shop-balance")
  )
  await awayCard.locator("[data-kit-action]").click()
  await page.waitForFunction(
    (kitKey) =>
      document.querySelector(`[data-kit-key="${kitKey}"]`)?.getAttribute("data-kit-equipped") ===
      "true",
    away.kitKey,
    { timeout: 5_000 }
  )
  const balanceAfter = Number(
    await page.locator("[data-shop-balance]").getAttribute("data-shop-balance")
  )
  const equippedAfterPurchase = await page
    .locator("[data-equipped-kit]")
    .getAttribute("data-equipped-kit")
  const ownedCountAfterPurchase = Number(
    await page.locator("[data-owned-kit-count]").getAttribute("data-owned-kit-count")
  )
  await page.locator("[data-avatar-stage]").screenshot({
    path: path.join(outputDir, "avatar-kit-purchase-equipped.png"),
  })

  const previewed: string[] = []
  const clubCaptures: Array<{ clubKey: string; path: string }> = []
  const kitCaptures: Array<{ kitKey: string; input: Buffer; frameHash: string }> = []
  for (const club of AVAILABLE_CLUBS) {
    const clubKits = getKitsForClub(club.clubKey)
    if (clubKits.length === 0) throw new Error(`No kit for ${club.clubKey}`)
    await page.locator(`[data-club-key="${club.clubKey}"]`).click()
    for (const [kitIndex, kit] of clubKits.entries()) {
      await page.locator(`[data-kit-key="${kit.kitKey}"] [data-kit-preview]`).click()
      await waitForRenderedKit(kit.kitKey)
      previewed.push(kit.kitKey)
      const renderedFrame = await page.locator("canvas").screenshot({ type: "png" })
      const label = Buffer.from(
        `<svg width="240" height="150" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="240" height="24" fill="#020617" fill-opacity="0.88"/><text x="8" y="16" fill="#ffffff" font-family="Arial,sans-serif" font-size="11">${escapeXml(kit.name)}</text></svg>`
      )
      const thumbnail = await sharp(renderedFrame)
        .resize(240, 150, { fit: "cover" })
        .composite([{ input: label, left: 0, top: 0 }])
        .png()
        .toBuffer()
      kitCaptures.push({
        kitKey: kit.kitKey,
        input: thumbnail,
        frameHash: createHash("sha256").update(renderedFrame).digest("hex"),
      })
      if (kitIndex === 0) {
        const capturePath = path.join(clubCaptureDir, `${club.clubKey}.png`)
        await page.locator("[data-avatar-stage]").screenshot({ path: capturePath })
        clubCaptures.push({ clubKey: club.clubKey, path: capturePath })
      }
    }
  }

  const bodyText = await page.locator("body").innerText()
  const report = {
    clubs: AVAILABLE_CLUBS.length,
    kits: KIT_CATALOG.length,
    previewed,
    loadedAtlasRequests: loadedAtlases.size,
    uniqueRenderedFrames: new Set(kitCaptures.map((capture) => capture.frameHash)).size,
    purchase: {
      kitKey: away.kitKey,
      balanceBefore,
      balanceAfter,
      expectedBalanceAfter: INITIAL_KIT_BALANCE - away.priceGold,
      equippedAfterPurchase,
      ownedCountAfterPurchase,
    },
    consoleErrors,
    ignoredExternalWarnings,
    failedRequests,
    placeholderSponsorVisible: /AERIA/i.test(bodyText),
  }
  await writeFile(
    path.join(outputDir, "avatar-kit-qa.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  )
  await browser.close()

  const cellWidth = 320
  const cellHeight = 200
  const columns = 6
  const contactInputs = await Promise.all(
    clubCaptures.map(async ({ path: capturePath }, index) => ({
      input: await sharp(capturePath)
        .resize(cellWidth, cellHeight, { fit: "cover" })
        .png()
        .toBuffer(),
      left: (index % columns) * cellWidth,
      top: Math.floor(index / columns) * cellHeight,
    }))
  )
  await sharp({
    create: {
      width: columns * cellWidth,
      height: Math.ceil(clubCaptures.length / columns) * cellHeight,
      channels: 4,
      background: "#020617",
    },
  })
    .composite(contactInputs)
    .png()
    .toFile(path.join(outputDir, "avatar-club-home-contact-sheet.png"))

  const allKitColumns = 8
  await sharp({
    create: {
      width: allKitColumns * 240,
      height: Math.ceil(kitCaptures.length / allKitColumns) * 150,
      channels: 4,
      background: "#020617",
    },
  })
    .composite(
      kitCaptures.map((capture, index) => ({
        input: capture.input,
        left: (index % allKitColumns) * 240,
        top: Math.floor(index / allKitColumns) * 150,
      }))
    )
    .png()
    .toFile(path.join(outputDir, "avatar-all-kits-contact-sheet.png"))

  if (previewed.length !== KIT_CATALOG.length) {
    throw new Error(`Expected ${KIT_CATALOG.length} kit previews, got ${previewed.length}`)
  }
  if (new Set(previewed).size !== KIT_CATALOG.length)
    throw new Error("Duplicate or missing kit previews")
  if (loadedAtlases.size !== KIT_CATALOG.length) {
    throw new Error(`Expected ${KIT_CATALOG.length} loaded atlases, got ${loadedAtlases.size}`)
  }
  if (new Set(kitCaptures.map((capture) => capture.frameHash)).size !== KIT_CATALOG.length) {
    throw new Error("One or more kit selections produced an identical rendered canvas")
  }
  if (balanceBefore !== INITIAL_KIT_BALANCE)
    throw new Error(`Unexpected initial balance: ${balanceBefore}`)
  if (balanceAfter !== INITIAL_KIT_BALANCE - away.priceGold) {
    throw new Error(`Purchase balance mismatch: ${balanceAfter}`)
  }
  if (equippedAfterPurchase !== away.kitKey) throw new Error("Purchased kit was not equipped")
  if (ownedCountAfterPurchase !== 2)
    throw new Error(`Expected 2 owned kits, got ${ownedCountAfterPurchase}`)
  if (report.placeholderSponsorVisible) throw new Error("Placeholder sponsor is visible")
  if (failedRequests.length > 0) throw new Error(`Failed requests: ${failedRequests.join(", ")}`)
  if (consoleErrors.length > 0) throw new Error(`Console errors: ${consoleErrors.join(" | ")}`)
  console.log(
    `Verified ${AVAILABLE_CLUBS.length} clubs, ${previewed.length} kit renders, and purchase/equip flow`
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
