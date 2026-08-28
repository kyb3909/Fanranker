import type { ClubKey } from "./kits"

export type ExpansionClubKey = Exclude<ClubKey, "arsenal" | "chelsea">

export type KitReferenceSource = {
  season: "2026/27"
  verifiedAt: "2026-08-28"
  homeUrl: string
  awayUrl: string
}

// Official club/store sources used only to verify current-season color blocking.
// Playable kits remain original, logo-free interpretations rather than replicas.
export const KIT_REFERENCE_SOURCES: Record<ExpansionClubKey, KitReferenceSource> = {
  "manchester-united": {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl: "https://store.manutd.com/en-gb/c/kit/home/mens",
    awayUrl: "https://store.manutd.com/en-gb/c/kit/away/mens",
  },
  liverpool: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.liverpoolfc.com/news/lfc-and-adidas-unveil-2026-27-home-kit-inspired-iconic-title-winning-season",
    awayUrl:
      "https://www.liverpoolfc.com/news/liverpool-fc-officially-unveils-new-adidas-away-kit-2026-27/",
  },
  "manchester-city": {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.mancity.com/news/club/manchester-city-202627-home-kit-launched-63914816?hl=en-GB",
    awayUrl: "https://www.mancity.com/news/club/away-kit-202627-launch-63921042",
  },
  tottenham: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.tottenhamhotspur.com/news/1074148/gallery-new-nike-202627-home-kit-up-close",
    awayUrl:
      "https://www.tottenhamhotspur.com/news/1074152/gallery-new-nike-202627-away-kit-up-close",
  },
  "real-madrid": {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.realmadrid.com/en-US/news/football/first-team/latest-news/asi-es-la-nueva-camiseta-para-la-temporada-2026-27-03-06-2026",
    awayUrl:
      "https://www.realmadrid.com/en-US/news/football/first-team/latest-news/el-real-madrid-y-adidas-presentan-la-segunda-camiseta-para-la-temporada-2026-27-23-07-2026",
  },
  barcelona: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.fcbarcelona.com/en/news/4528818/fc-barcelona-presents-new-202627-kit-with-unique-show-at-the-macba-museum",
    awayUrl:
      "https://www.fcbarcelona.com/en/club/news/4542918/fc-barcelonas-202627-away-kit-embodies-the-ambition-to-keep-pushing-beyond-your-own-limits",
  },
  "atletico-madrid": {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://en.atleticodemadrid.com/noticias/atletico-de-madrid-home-kit-for-the-2026-27-season",
    awayUrl:
      "https://en.atleticodemadrid.com/noticias/we-present-our-away-kit-for-the-2026-27-season",
  },
  "bayern-munich": {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://fcbayern.com/en/news/2026/05/the-new-fc-bayern-home-shirt-for-the-2026-27-season",
    awayUrl: "https://fcbayern.com/en/news/2026/07/2026-27-away-kit-iconic-jersey-in-a-retro-style",
  },
  psg: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.psg.fr/en/content/actu_en_-paris-saint-germain-and-nike-unveil-the-2026-2027-psg-club-news-25-26",
    awayUrl:
      "https://www.psg.fr/en/content/paris-saint-germain-and-nike-unveil-the-2026-2027-away-kit-inspired-by-the-sound-of-pariq",
  },
  "ac-milan": {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.acmilan.com/en/news/articles/media/2026-05-22/ac-milan-and-puma-unveil-the-2026-27-home-kit",
    awayUrl:
      "https://www.acmilan.com/en/news/articles/media/2026-07-21/after-istanbul-there-is-always-athens-ac-milan-and-puma-unveil-the-new-2026-27-away-kit",
  },
  juventus: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.juventus.com/en/news/articles/adidas-and-juventus-present-the-new-2026-27-home-kit",
    awayUrl:
      "https://www.juventus.com/en/news/articles/adidas-and-juventus-unveil-the-2026-27-away-shirt",
  },
  "inter-milan": {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl: "https://www.inter.it/en/news/inter-nike-new-home-kit-2026-2027-season",
    awayUrl: "https://www.inter.it/en/news/inter-away-kit-2026-2027",
  },
  roma: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.asroma.com/en/news/75630/as-roma-and-adidas-unveil-the-new-home-kit-for-the-202627-season",
    awayUrl:
      "https://www.asroma.com/en/news/75737/as-roma-and-adidas-unveil-the-new-away-kit-for-the-202627-season",
  },
  napoli: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl: "https://sscnapoli.it/en/ssc-napoli-and-ea7-unveil-the-2026-27-home-jersey/",
    awayUrl: "https://sscnapoli.it/en/ssc-napoli-and-ea7-present-napoles-the-2026-27-away-jersey/",
  },
  dortmund: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.bvb.de/de/en/news/news-overview/news.html/2026/5/8/A-tribute-to-Dortmund-The-BVB-home-kit-for-the-2026-27-season.html",
    awayUrl:
      "https://www.bvb.de/de/en/news/news-overview/news.html/2026/8/11/Wherever-we-go-This-is-the-new-away-kit.html",
  },
  leverkusen: {
    season: "2026/27",
    verifiedAt: "2026-08-28",
    homeUrl:
      "https://www.bayer04.de/en-us/news/bayer04/bayer-04-202627-home-jersey-with-classic-stripes",
    awayUrl:
      "https://www.bayer04.de/en-us/news/bayer04/three-cheers-for-the-city-of-colours-bayer-04-unveil-new-away-kit",
  },
}
