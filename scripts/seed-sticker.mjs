import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = "https://ekysrlhdrapmsnrkytif.supabase.co"
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// kyb3909 Clerk user ID
const CREATOR_ID = "user_38FwA7wLkxVsIgwkH6jTafXOXBE"

async function main() {
  const gifPath = path.join(__dirname, "..", "steven-gerrard-liverpool.gif")
  const fileBuffer = fs.readFileSync(gifPath)

  // 1. Storage 업로드
  const fileName = `stickers/${CREATOR_ID}/${Date.now()}-gerrard.gif`
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("posts")
    .upload(fileName, fileBuffer, {
      contentType: "image/gif",
      upsert: false,
    })

  if (uploadError) {
    console.error("Upload failed:", uploadError)
    process.exit(1)
  }

  const { data: publicUrlData } = supabase.storage
    .from("posts")
    .getPublicUrl(uploadData.path)

  console.log("Uploaded:", publicUrlData.publicUrl)

  // 2. stickers 테이블에 insert (approved 상태, 100포인트)
  const { data: sticker, error: insertError } = await supabase
    .from("stickers")
    .insert({
      creator_id: CREATOR_ID,
      name: "제라드 리버풀",
      image_url: publicUrlData.publicUrl,
      media_type: "animated",
      status: "approved",
      approved_at: new Date().toISOString(),
      price: 100,
      board_slug: "football",
      tags: ["제라드", "리버풀", "축구", "레전드"],
      pack_id: null,
    })
    .select()
    .single()

  if (insertError) {
    console.error("Insert failed:", insertError)
    process.exit(1)
  }

  console.log("Sticker created:", sticker.id)

  // 3. kyb3909에게 소유권 부여
  const { error: ownError } = await supabase
    .from("user_stickers")
    .insert({
      user_id: CREATOR_ID,
      sticker_id: sticker.id,
    })

  if (ownError) {
    console.error("Ownership failed:", ownError)
  } else {
    console.log("Ownership granted to kyb3909")
  }

  console.log("\nDone! Sticker ID:", sticker.id)
}

main()
