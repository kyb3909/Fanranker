import { TOPIC_KEYWORDS } from "@/lib/constants/topic-keywords"

/**
 * favorite_team 텍스트 → team_map_pins.team_id 매칭
 *
 * TOPIC_KEYWORDS의 키워드 배열을 활용하여 유연하게 매칭
 * 예: "삼성" → kbo_samsung, "토트넘" → epl_tottenham
 */

interface TeamMapping {
  team_id: string
  short_name: string
  keywords: string[]
}

// 정적 매핑: team_short_name → team_id
// team_map_pins 시드 데이터 기반
const TEAM_ID_MAP: TeamMapping[] = [
  // KBO
  { team_id: "kbo_samsung", short_name: "삼성", keywords: ["삼성", "라이온즈", "samsung lions"] },
  { team_id: "kbo_lg", short_name: "LG", keywords: ["LG", "트윈스", "엘지"] },
  { team_id: "kbo_doosan", short_name: "두산", keywords: ["두산", "베어스"] },
  { team_id: "kbo_kt", short_name: "KT", keywords: ["KT", "위즈", "케이티"] },
  { team_id: "kbo_ssg", short_name: "SSG", keywords: ["SSG", "랜더스", "에스에스지"] },
  { team_id: "kbo_nc", short_name: "NC", keywords: ["NC", "다이노스", "엔씨"] },
  { team_id: "kbo_hanwha", short_name: "한화", keywords: ["한화", "이글스"] },
  { team_id: "kbo_lotte", short_name: "롯데", keywords: ["롯데", "자이언츠"] },
  { team_id: "kbo_kia", short_name: "KIA", keywords: ["KIA", "키아", "타이거즈", "기아"] },
  { team_id: "kbo_kiwoom", short_name: "키움", keywords: ["키움", "히어로즈"] },

  // K리그1
  { team_id: "kl1_jeonbuk", short_name: "전북", keywords: ["전북", "현대 모터스"] },
  { team_id: "kl1_ulsan", short_name: "울산", keywords: ["울산", "울산 HD"] },
  { team_id: "kl1_fcseoul", short_name: "FC서울", keywords: ["FC서울", "서울FC", "에프씨서울"] },
  { team_id: "kl1_suwon", short_name: "수원", keywords: ["수원", "수원FC"] },
  { team_id: "kl1_incheon", short_name: "인천", keywords: ["인천", "인천 유나이티드"] },
  { team_id: "kl1_daejeon", short_name: "대전", keywords: ["대전", "하나 시티즌"] },
  { team_id: "kl1_pohang", short_name: "포항", keywords: ["포항", "스틸러스"] },
  { team_id: "kl1_jeju", short_name: "제주", keywords: ["제주", "제주 유나이티드"] },
  { team_id: "kl1_gangwon", short_name: "강원", keywords: ["강원", "강원FC"] },
  { team_id: "kl1_gwangju", short_name: "광주FC", keywords: ["광주FC", "광주 FC"] },
  { team_id: "kl1_daegu", short_name: "대구FC", keywords: ["대구FC", "대구 FC"] },
  { team_id: "kl1_gimcheon", short_name: "김천", keywords: ["김천", "상무"] },

  // KBL
  { team_id: "kbl_et", short_name: "전자랜드", keywords: ["전자랜드"] },
  { team_id: "kbl_samsung", short_name: "삼성 썬더스", keywords: ["삼성 썬더스", "썬더스"] },
  { team_id: "kbl_kcc", short_name: "KCC", keywords: ["KCC", "이지스"] },
  { team_id: "kbl_mobis", short_name: "현대모비스", keywords: ["현대모비스", "모비스", "피버스"] },
  { team_id: "kbl_sk", short_name: "SK나이츠", keywords: ["SK나이츠", "나이츠"] },
  { team_id: "kbl_lg", short_name: "LG세이커스", keywords: ["LG세이커스", "세이커스"] },
  { team_id: "kbl_db", short_name: "원주DB", keywords: ["원주DB", "DB", "프로미"] },
  { team_id: "kbl_kgc", short_name: "안양KGC", keywords: ["안양KGC", "KGC", "정관장"] },
  { team_id: "kbl_sono", short_name: "소노", keywords: ["소노", "스카이거너스"] },
  { team_id: "kbl_sono2", short_name: "BNK", keywords: ["BNK", "BNK썸"] },

  // V리그 남자
  { team_id: "vl_samsung", short_name: "삼성화재", keywords: ["삼성화재", "블루팡스"] },
  { team_id: "vl_korean", short_name: "대한항공", keywords: ["대한항공", "점보스"] },
  { team_id: "vl_kb", short_name: "KB손보", keywords: ["KB손보", "스타즈"] },
  { team_id: "vl_woori", short_name: "우리카드", keywords: ["우리카드", "우리WON"] },
  { team_id: "vl_hyundai", short_name: "현대캐피탈", keywords: ["현대캐피탈", "스카이워커스"] },
  { team_id: "vl_ok", short_name: "OK금융", keywords: ["OK금융", "읏맨"] },
  { team_id: "vl_pepper", short_name: "한국전력", keywords: ["한국전력", "빅스톰"] },

  // V리그 여자
  { team_id: "vlw_hyundai", short_name: "현대건설", keywords: ["현대건설", "힐스테이트"] },
  { team_id: "vlw_heungkuk", short_name: "흥국생명", keywords: ["흥국생명", "핑크스파이더스"] },
  { team_id: "vlw_gs", short_name: "GS칼텍스", keywords: ["GS칼텍스", "킹스타즈", "GS"] },
  {
    team_id: "vlw_road",
    short_name: "도로공사",
    keywords: ["도로공사", "하이패스", "한국도로공사"],
  },
  { team_id: "vlw_ibk", short_name: "IBK기업은행", keywords: ["기업은행", "IBK", "알토스"] },
  { team_id: "vlw_pepper", short_name: "AI페퍼스", keywords: ["페퍼스", "AI페퍼스"] },
  { team_id: "vlw_hillstate", short_name: "정관장", keywords: ["레드스파크스"] },

  // EPL
  {
    team_id: "epl_manutd",
    short_name: "맨유",
    keywords: ["맨유", "맨체스터 유나이티드", "manchester united", "man utd"],
  },
  {
    team_id: "epl_mancity",
    short_name: "맨시티",
    keywords: ["맨시티", "맨체스터 시티", "manchester city"],
  },
  { team_id: "epl_liverpool", short_name: "리버풀", keywords: ["리버풀", "liverpool"] },
  { team_id: "epl_arsenal", short_name: "아스날", keywords: ["아스날", "아스널", "arsenal"] },
  { team_id: "epl_chelsea", short_name: "첼시", keywords: ["첼시", "chelsea"] },
  { team_id: "epl_tottenham", short_name: "토트넘", keywords: ["토트넘", "tottenham", "spurs"] },
  { team_id: "epl_newcastle", short_name: "뉴캐슬", keywords: ["뉴캐슬", "newcastle"] },
  {
    team_id: "epl_astonvilla",
    short_name: "아스톤빌라",
    keywords: ["아스톤빌라", "빌라", "aston villa"],
  },
  { team_id: "epl_brighton", short_name: "브라이턴", keywords: ["브라이턴", "brighton"] },
  { team_id: "epl_westham", short_name: "웨스트햄", keywords: ["웨스트햄", "west ham"] },

  // 라리가
  {
    team_id: "liga_barca",
    short_name: "바르셀로나",
    keywords: ["바르셀로나", "바르사", "barcelona", "barca"],
  },
  { team_id: "liga_real", short_name: "레알", keywords: ["레알", "레알마드리드", "real madrid"] },
  { team_id: "liga_atletico", short_name: "아틀레티코", keywords: ["아틀레티코", "atletico"] },
  { team_id: "liga_sevilla", short_name: "세비야", keywords: ["세비야", "sevilla"] },
  { team_id: "liga_bilbao", short_name: "빌바오", keywords: ["빌바오", "athletic bilbao"] },

  // 분데스리가
  { team_id: "buli_bayern", short_name: "바이에른", keywords: ["바이에른", "뮌헨", "bayern"] },
  { team_id: "buli_bvb", short_name: "도르트문트", keywords: ["도르트문트", "dortmund", "BVB"] },
  { team_id: "buli_leverkusen", short_name: "레버쿠젠", keywords: ["레버쿠젠", "leverkusen"] },
  { team_id: "buli_leipzig", short_name: "라이프치히", keywords: ["라이프치히", "leipzig"] },
  {
    team_id: "buli_frankfurt",
    short_name: "프랑크푸르트",
    keywords: ["프랑크푸르트", "frankfurt"],
  },

  // 세리에A
  { team_id: "seriea_juve", short_name: "유벤투스", keywords: ["유벤투스", "유베", "juventus"] },
  { team_id: "seriea_inter", short_name: "인테르", keywords: ["인테르", "인테르 밀란", "inter"] },
  { team_id: "seriea_acmilan", short_name: "AC밀란", keywords: ["AC밀란", "밀란", "ac milan"] },
  { team_id: "seriea_napoli", short_name: "나폴리", keywords: ["나폴리", "napoli"] },
  { team_id: "seriea_roma", short_name: "로마", keywords: ["로마", "roma"] },

  // 리그앙
  { team_id: "l1_psg", short_name: "PSG", keywords: ["PSG", "파리", "paris saint"] },
  { team_id: "l1_marseille", short_name: "마르세유", keywords: ["마르세유", "marseille"] },
  { team_id: "l1_lyon", short_name: "리옹", keywords: ["리옹", "lyon"] },
  { team_id: "l1_monaco", short_name: "모나코", keywords: ["모나코", "monaco"] },
  { team_id: "l1_lille", short_name: "릴", keywords: ["릴", "lille"] },
]

/**
 * favorite_team 텍스트를 team_id로 매칭
 * 1. short_name 정확 매칭 (대소문자 무시)
 * 2. keywords 포함 매칭
 * 3. 매칭 실패 시 null 반환
 */
export function matchFavoriteTeamToId(favoriteTeam: string | null | undefined): string | null {
  if (!favoriteTeam || !favoriteTeam.trim()) return null

  const normalized = favoriteTeam.trim()
  const lower = normalized.toLowerCase()

  // 1. short_name 정확 매칭
  for (const mapping of TEAM_ID_MAP) {
    if (mapping.short_name.toLowerCase() === lower) {
      return mapping.team_id
    }
  }

  // 2. keywords 포함 매칭
  for (const mapping of TEAM_ID_MAP) {
    for (const keyword of mapping.keywords) {
      if (keyword.toLowerCase() === lower || lower.includes(keyword.toLowerCase())) {
        return mapping.team_id
      }
    }
  }

  // 3. TOPIC_KEYWORDS fallback (더 넓은 키워드 풀)
  const sportKeys = ["football", "baseball", "basketball", "volleyball"] as const
  for (const sport of sportKeys) {
    const topics = TOPIC_KEYWORDS[sport]
    if (!topics) continue
    for (const topic of topics) {
      if (topic.keywords.some((kw) => kw.toLowerCase() === lower)) {
        // topic.label로 TEAM_ID_MAP 재매칭
        const byLabel = TEAM_ID_MAP.find((m) => m.short_name === topic.label)
        if (byLabel) return byLabel.team_id
      }
    }
  }

  return null
}
