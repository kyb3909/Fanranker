// 구단별 뉴스 플레이스홀더 이미지 생성 (OpenAI gpt-image-1).
//
// ## 팀명 텍스트를 굽지 않는다 (2026-08-12 운영자 결정)
// 원래는 sharp 로 팀명을 합성했다(모델이 한글을 뭉개서). 그런데 이 이미지가 쓰이는
// 히어로 카드는 **사진 위에 기사 제목을 얹는** 구조라, 구워진 팀명과 제목이 겹쳐
// 둘 다 안 읽혔다. 운영자: "그냥 엠블럼만 있는 게 낫다."
//
// 텍스트를 빼면 조판 문제가 통째로 사라진다 — 썸네일(104×76)에서 양옆이 잘려 팀명이
// 날아가던 문제도, 히어로에서 제목과 부딪히던 문제도 같은 원인이었다. 어느 팀인지는
// 카드의 말머리 칩이 이미 말하고 있으므로 이미지가 또 말할 필요가 없다.
//
// 스크림(좌→우 어두운 그라디언트)도 함께 뺐다. 흰 글자 가독성용이었는데 글자가 없어졌고,
// 히어로 카드는 UI 가 자체 스크림을 덧씌우고 있어 이중으로 어두워지고 있었다.
//
//   node scripts/gen-team-news-cards.mjs                # 샘플 3개 (유료 — API 호출)
//   node scripts/gen-team-news-cards.mjs --all          # 전체 21장 (유료 — 약 $5)
//   node scripts/gen-team-news-cards.mjs --only epl_arsenal
//   node scripts/gen-team-news-cards.mjs --recompose    # 보관된 원본으로 다시 굽기 (공짜)
//
// 크롭·화질처럼 **조판만** 바꿀 때는 --recompose 를 쓴다. 원본 아트가 RAW_DIR 에
// 남아 있어 API 를 다시 부르지 않는다. (원본이 없던 시절, 텍스트를 빼려고 21장을
// 통째로 다시 생성해야 했다 — 그 값이 $5 였다.)
import "dotenv/config"
import sharp from "sharp"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const OUT = "public/images/news-team"
/** 원본 아트 보관소 — 조판만 바꿀 때 재생성을 피한다 (gitignore) */
const RAW_DIR = "public/images/_news-team-raw"
const W = 1200
const H = 630

const TEAMS = [
  // 팀을 못 뽑는 기사(리그 전체·협회·복수 구단)용 중립 카드. 사이트 톤인 와인을 쓴다.
  {
    id: "default",
    ko: "축구 소식",
    en: "FOOTBALL",
    hue: "deep wine burgundy (#961e37) with warm ivory accents",
    motif: "stadium floodlights, pitch lines and a stylised football rendered as clean geometry",
  },
  { id: "epl_arsenal", ko: "아스날", en: "ARSENAL", hue: "deep crimson red and white", motif: "North London, cannon-era industrial geometry" },
  { id: "epl_liverpool", ko: "리버풀", en: "LIVERPOOL", hue: "rich scarlet red", motif: "Merseyside docks, liver bird silhouette abstracted into geometry" },
  { id: "epl_chelsea", ko: "첼시", en: "CHELSEA", hue: "royal blue", motif: "West London, lion heraldry abstracted into geometry" },
  { id: "epl_mancity", ko: "맨체스터 시티", en: "MAN CITY", hue: "sky blue and white", motif: "Manchester canals, ship and rose abstracted" },
  { id: "epl_manutd", ko: "맨체스터 유나이티드", en: "MAN UTD", hue: "vivid red and black", motif: "Manchester industry, trident abstracted" },
  { id: "epl_tottenham", ko: "토트넘", en: "TOTTENHAM", hue: "navy blue and white", motif: "North London, cockerel abstracted into geometry" },
  // 흑백 구단이라 1차 생성물이 혼자 칙칙했다 — 구단 문장의 금색 해마에서 강조색을 빌린다
  { id: "epl_newcastle", ko: "뉴캐슬", en: "NEWCASTLE", hue: "crisp black and bright white with warm gold accents", motif: "Tyne bridge arch at sunset, seahorse silhouette abstracted, luminous sky behind" },
  { id: "epl_astonvilla", ko: "아스톤 빌라", en: "ASTON VILLA", hue: "claret and sky blue", motif: "Birmingham, lion abstracted" },
  { id: "epl_brighton", ko: "브라이턴", en: "BRIGHTON", hue: "blue and white stripes", motif: "seaside pier, seagull abstracted" },
  { id: "epl_westham", ko: "웨스트햄", en: "WEST HAM", hue: "claret and sky blue", motif: "East London, crossed hammers abstracted into geometry" },

  // ── 유럽 빅클럽 (EPL 외) ──
  // 흰색 구단이라 밝게 잡으니 좌측 텍스트 그라디언트와 겹쳐 탁해졌다 — 어둡게 깔고 금색을 세운다
  { id: "laliga_realmadrid", ko: "레알 마드리드", en: "REAL MADRID", hue: "deep midnight navy and royal purple base with brilliant gold and ivory highlights", motif: "royal crown and Cibeles fountain abstracted into geometry, high contrast" },
  { id: "laliga_barcelona", ko: "바르셀로나", en: "BARCELONA", hue: "deep blue and garnet red vertical bands", motif: "Catalan Sant Jordi cross and Gaudí mosaic geometry" },
  { id: "laliga_atletico", ko: "아틀레티코 마드리드", en: "ATLETICO", hue: "red and white vertical stripes with navy", motif: "Madrid bear and strawberry tree abstracted into geometry" },
  { id: "bundesliga_bayern", ko: "바이에른 뮌헨", en: "BAYERN", hue: "deep red and white with bavarian blue", motif: "Bavarian lozenge diamond pattern and Munich spires" },
  { id: "bundesliga_dortmund", ko: "도르트문트", en: "DORTMUND", hue: "vivid yellow and black", motif: "Ruhr industrial towers and bee-stripe geometry" },
  { id: "seriea_juventus", ko: "유벤투스", en: "JUVENTUS", hue: "black and white vertical stripes", motif: "Turin Mole Antonelliana spire and bull abstracted" },
  { id: "seriea_inter", ko: "인터 밀란", en: "INTER", hue: "navy blue and black stripes with gold", motif: "Milan Duomo spires and grass snake abstracted" },
  { id: "seriea_milan", ko: "AC밀란", en: "AC MILAN", hue: "deep red and black vertical stripes", motif: "Milan Duomo geometry and devil trident abstracted" },
  { id: "seriea_napoli", ko: "나폴리", en: "NAPOLI", hue: "azure sky blue and white", motif: "Vesuvius volcano silhouette and Naples bay geometry" },
  { id: "ligue1_psg", ko: "파리 생제르맹", en: "PSG", hue: "navy blue, red and white", motif: "Eiffel Tower and fleur-de-lis abstracted into geometry" },
]

/**
 * 프롬프트는 팀마다 hue/motif 두 곳만 바뀐다 — 나머지가 고정이라 스타일이 흔들리지 않는다.
 * ⚠️ 실제 구단 엠블럼·로고·유니폼 마크를 그리게 하지 않는다. 상표 문제도 있지만,
 *    이미지 모델이 뽑는 유사 엠블럼은 글자가 뭉개져 품질이 먼저 무너진다.
 */
function prompt(t) {
  return [
    "A modern abstract sports editorial background graphic, 3:2 landscape.",
    `Color palette: ${t.hue}, with deep shadow tones.`,
    `Visual motif: ${t.motif}, rendered as clean geometric shapes only.`,
    "Style: flat vector, bold diagonal composition, subtle grain, premium sports magazine aesthetic.",
    // 제목이 얹히는 자리는 하단이다 (히어로 카드 스크림이 to-top 그라디언트) —
    // 예전엔 좌측을 비우게 했는데, 굽는 텍스트가 없어진 지금 비워야 할 곳은 아래쪽이다
    "Bottom third must stay visually calm and uncluttered — a headline will be overlaid there.",
    "Absolutely NO text, NO letters, NO numbers, NO logos, NO emblems, NO crests, NO badges, NO players, NO faces.",
  ].join(" ")
}

async function generate(t) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: prompt(t),
      size: "1536x1024",
      quality: "high",
      n: 1,
    }),
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`${t.id}: ${res.status} ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  const b64 = j.data?.[0]?.b64_json
  if (!b64) throw new Error(`${t.id}: 이미지 없음`)
  return Buffer.from(b64, "base64")
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(RAW_DIR, { recursive: true })
  const onlyIdx = process.argv.indexOf("--only")
  // 보관된 원본 아트로 다시 굽기만 한다 (API 호출 0회 = 공짜).
  // 크롭·화질처럼 **조판만** 바꿀 때 쓴다 — RAW_DIR 을 남기는 이유가 바로 이것이다.
  const recompose = process.argv.includes("--recompose")
  const list = process.argv.includes("--all") || recompose
    ? TEAMS
    : onlyIdx >= 0
      ? TEAMS.filter((t) => t.id === process.argv[onlyIdx + 1])
      : TEAMS.slice(0, 3)

  for (const t of list) {
    try {
      const art = recompose ? readFileSync(`${RAW_DIR}/${t.id}.png`) : await generate(t)
      // ⚠️ 원본 아트를 **반드시** 남긴다 (gitignore 대상). 1차 작업 때 합성본만 저장했다가
      //    조판을 고치려니 21장을 다시 생성해야 했다 — 텍스트 위치 하나 바꾸는 데 1시간.
      if (!recompose) writeFileSync(`${RAW_DIR}/${t.id}.png`, art)
      const out = await sharp(art)
        // ⚠️ position 은 **top** 이다 (center 아님). 모델은 3:2(1536×1024)로 그리는데
        // 저장은 OG 규격 1.9:1 이라 세로 21% 가 잘린다. center 로 자르면 위아래를 균등하게
        // 깎아 엠블럼 머리가 날아갔다("왜 닭머리가 잘림?" — 2026-08-12).
        // 프롬프트가 하단을 비우게 하므로 버릴 몫은 전부 아래에 있다 → 위를 붙이고 아래를 깎는다.
        // sharp.strategy.attention 도 시험했지만 그 빈 띠를 '관심 영역'으로 오인해 되살렸다.
        .resize(W, H, { fit: "cover", position: "top" })
        // WebP — PNG 로 뽑으면 장당 1.3MB 라 피드 썸네일로 무겁다(21장 27.6MB → 1.0MB)
        //
        // q88 → q80 사이에 절벽이 있다 (실측, 21장 합계): 2.36MB → 1.01MB 로 57% 가 빠지는데
        // 육안 차이가 없다. 그라디언트가 가장 심한 뉴캐슬 하늘을 1:1 로 잘라 q88/q80/q72 를
        // 나란히 비교했으나 밴딩이 안 보였다 — 프롬프트의 "subtle grain" 이 압축 아티팩트를
        // 가려주기 때문이다. effort 6 은 인코딩만 느려지고 화질 손해 없이 더 줄여준다.
        //
        // ⚠️ 해상도(1200)는 건드리지 말 것. 이 이미지는 OG 이미지로도 나간다
        // (app/post/[id]/page.tsx 의 openGraph.images ← post.image). 900 으로 내리면
        // 0.41MB 까지 떨어지지만 공유 카드가 흐려진다. 더 줄여야 하면 품질을 먼저 낮춘다.
        .webp({ quality: 80, effort: 6 })
        .toBuffer()
      writeFileSync(`${OUT}/${t.id}.webp`, out)
      console.log(`  ✓ ${t.id}  (${t.ko})`)
    } catch (e) {
      console.error(`  ✗ ${t.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(`\n${OUT} 에 저장했습니다.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
