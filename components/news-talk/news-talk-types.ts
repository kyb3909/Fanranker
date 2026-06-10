// Shared types and mock data for the news-talk system

type TickerTag = "live" | "breaking" | "result"

export interface ItemDetail {
  summary: string[]
  source: string
  sourceUrl: string
  redditUrl?: string
  thumbnailUrl?: string | null
  mediaType?: "youtube" | "image" | "article" | null
  participants: number
  score?: number
  category?: string
  importance?: number
  postedAt?: string
  originalTitle?: string
}

export interface TalkBoardItem {
  id: string
  tag: TickerTag
  text: string
  detail?: ItemDetail
}

interface Comment {
  id: string
  author: string
  content: string
  timestamp: string
  likes: number
  isLiked: boolean
}

interface NewsTalkBoardProps {
  item: TalkBoardItem
  isOpen: boolean
  onClose: () => void
}

// 뉴스별 상세 데이터 (목업) - 게시판별 ID 매핑
export const NEWS_DETAILS: Record<
  string,
  {
    summary: string[]
    source: string
    sourceUrl: string
    participants: number
  }
> = {
  // 해외축구
  "of-1": {
    summary: [
      "손흥민이 EPL 시즌 10호골을 기록하며 득점 랭킹 5위에 올랐다.",
      "후반 65분 왼발 중거리슛으로 골망을 흔들었다.",
      "토트넘은 이번 경기 2-1 승리를 거두며 4위 자리를 공고히 했다.",
    ],
    source: "ESPN",
    sourceUrl: "#",
    participants: 342,
  },
  "of-2": {
    summary: [
      "카레라스의 후반 89분 결승골로 레알 마드리드가 발렌시아 원정에서 1-0 승리.",
      "비니시우스가 부상으로 빠진 가운데 팀이 하나로 뭉쳤다.",
      "라리가 순위 1위 바르셀로나와의 격차를 3점으로 좁혔다.",
    ],
    source: "Marca",
    sourceUrl: "#",
    participants: 189,
  },
  "of-3": {
    summary: [
      "PSG가 마르세유를 상대로 4-0 대승을 거뒀다.",
      "뎀벨레와 크바라츠헬리아가 각각 2골씩 넣으며 멀티골을 기록.",
      "리그1 선두 자리를 굳건히 지키며 우승을 향해 순항 중.",
    ],
    source: "L'Equipe",
    sourceUrl: "#",
    participants: 156,
  },
  "of-4": {
    summary: [
      "맨시티가 챔피언스리그 16강 진출을 확정지었다.",
      "하이두크 스플리트를 상대로 합산 5-1 승리.",
      "홀란드가 2경기 연속 골을 터뜨리며 팀을 이끌었다.",
    ],
    source: "BBC Sport",
    sourceUrl: "#",
    participants: 213,
  },
  "of-5": {
    summary: [
      "바이에른 뮌헨이 도르트문트를 3-1로 격파했다.",
      "김민재가 풀타임 출전하며 안정적인 수비를 보여줬다.",
      "뮐러와 사네가 각각 한 골씩 기여했다.",
    ],
    source: "Kicker",
    sourceUrl: "#",
    participants: 178,
  },
  // 국내축구
  "df-1": {
    summary: [
      "K리그1 2025 시즌이 드디어 개막한다.",
      "울산 HD와 전북 현대의 맞대결로 시즌이 시작된다.",
      "올해 승격팀의 활약이 기대되는 시즌.",
    ],
    source: "K리그",
    sourceUrl: "#",
    participants: 287,
  },
  "df-2": {
    summary: [
      "대한민국 A매치 소집 명단이 발표됐다.",
      "이강인, 손흥민이 모두 포함되어 공격진 기대감이 높다.",
      "다음 달 월드컵 예선 2연전이 예정되어 있다.",
    ],
    source: "KFA",
    sourceUrl: "#",
    participants: 445,
  },
  "df-3": {
    summary: [
      "FC서울이 수원FC를 상대로 2-0 완승을 거뒀다.",
      "주민규가 시즌 첫 골을 기록하며 팀 승리를 이끌었다.",
      "서울은 개막 2연승으로 순위 상위권에 자리잡았다.",
    ],
    source: "SPOTV",
    sourceUrl: "#",
    participants: 134,
  },
  "df-4": {
    summary: [
      "제주 유나이티드가 새 외국인 공격수 영입을 공식 발표했다.",
      "브라질 출신으로 지난 시즌 리그 15골을 기록한 선수.",
      "팀의 공격력 보강에 큰 도움이 될 것으로 기대된다.",
    ],
    source: "제주 유나이티드",
    sourceUrl: "#",
    participants: 98,
  },
  // 야구
  "bb-1": {
    summary: [
      "2025 KBO 시범경기가 2월 28일 개막 확정.",
      "올해는 총 72경기가 진행되며 전 구단이 참여한다.",
      "신인 드래프트 1순위 지명자들의 첫 모습도 볼 수 있을 전망.",
    ],
    source: "SPOTV",
    sourceUrl: "#",
    participants: 278,
  },
  "bb-2": {
    summary: [
      "김도영이 스프링캠프 첫 실전 타격에서 3타수 2안타를 기록했다.",
      "멀티히트로 시즌 준비 상태가 양호함을 증명.",
      "올시즌 30-30 클럽 달성이 기대된다.",
    ],
    source: "MBC 스포츠",
    sourceUrl: "#",
    participants: 356,
  },
  "bb-3": {
    summary: [
      "LG 트윈스가 삼성 라이온즈를 시범경기에서 5-3으로 이겼다.",
      "오스틴이 3타수 2안타 1홈런으로 활약했다.",
      "선발 투수진의 안정적인 이닝 소화가 인상적이었다.",
    ],
    source: "JTBC",
    sourceUrl: "#",
    participants: 189,
  },
  "bb-4": {
    summary: [
      "SSG 랜더스가 새 외국인 투수와 계약을 완료했다.",
      "MLB 마이너리그 출신으로 강속구가 무기인 우완 투수.",
      "로테이션 3선발로 기대된다.",
    ],
    source: "SSG 랜더스",
    sourceUrl: "#",
    participants: 145,
  },
  // 농구
  "bk-1": {
    summary: [
      "르브론 제임스가 NBA 통산 42,000득점을 달성했다.",
      "역대 최다 득점 기록을 계속 경신 중.",
      "40세의 나이에도 여전히 리그 최정상급 활약을 보여주고 있다.",
    ],
    source: "ESPN",
    sourceUrl: "#",
    participants: 512,
  },
  "bk-2": {
    summary: [
      "KBL 원주 DB가 서울 SK를 87-82로 이겼다.",
      "4쿼터 역전극을 펼치며 짜릿한 승리.",
      "외국인 선수가 더블더블을 기록하며 팀을 이끌었다.",
    ],
    source: "KBL",
    sourceUrl: "#",
    participants: 98,
  },
  "bk-3": {
    summary: [
      "허웅이 KBL 올스타전 팬투표에서 1위를 차지했다.",
      "압도적인 득표수로 선정되며 팬들의 사랑을 확인.",
      "올스타전은 다음 달 개최 예정.",
    ],
    source: "KBL",
    sourceUrl: "#",
    participants: 234,
  },
  "bk-4": {
    summary: [
      "보스턴 셀틱스가 마이애미 히트를 112-98로 꺾었다.",
      "테이텀이 35득점을 올리며 팀 승리를 이끌었다.",
      "셀틱스는 동부 컨퍼런스 1위 자리를 유지 중.",
    ],
    source: "NBA",
    sourceUrl: "#",
    participants: 167,
  },
  // 배구
  "vb-1": {
    summary: [
      "대한항공과 현대캐피탈의 V리그 빅매치가 진행 중이다.",
      "현재 3세트까지 2-1로 대한항공이 앞서고 있다.",
      "정지석의 활약이 돋보이는 경기.",
    ],
    source: "V리그",
    sourceUrl: "#",
    participants: 87,
  },
  "vb-2": {
    summary: [
      "흥국생명이 GS칼텍스를 3-1로 이겼다.",
      "이소영이 25득점을 올리며 원맨쇼를 펼쳤다.",
      "흥국생명은 플레이오프 진출을 확정지었다.",
    ],
    source: "KOVO",
    sourceUrl: "#",
    participants: 65,
  },
  "vb-3": {
    summary: [
      "V리그 남자부 플레이오프 일정이 확정됐다.",
      "준플레이오프는 3월 15일, 플레이오프는 3월 22일 시작.",
      "대한항공과 현대캐피탈의 우승 다툼이 예상된다.",
    ],
    source: "KOVO",
    sourceUrl: "#",
    participants: 112,
  },
  "vb-4": {
    summary: [
      "OK금융그룹이 삼성화재를 3-0으로 완파했다.",
      "레오가 20득점을 올리며 경기를 지배했다.",
      "시즌 최다 연승 기록을 경신 중.",
    ],
    source: "V리그",
    sourceUrl: "#",
    participants: 78,
  },
  // e스포츠
  "es-1": {
    summary: [
      "LCK 스프링 T1이 GEN을 상대로 2-1 역전승.",
      "페이커의 아지르 캐리가 3세트를 결정지었다.",
      "T1은 이번 시즌 5승 1패로 2위를 기록 중.",
    ],
    source: "Inven",
    sourceUrl: "#",
    participants: 421,
  },
  "es-2": {
    summary: [
      "VCT 퍼시픽 DRX와 PRX의 대결이 진행 중이다.",
      "1맵에서 DRX가 리드를 잡고 있다.",
      "Buzz의 제트 플레이가 돋보이는 경기.",
    ],
    source: "VCT",
    sourceUrl: "#",
    participants: 198,
  },
  "es-3": {
    summary: [
      "페이커가 LCK 통산 500승 달성을 눈앞에 두고 있다.",
      "현재 498승으로 역대 최다승 기록도 보유 중.",
      "이번 주말 경기에서 대기록 달성이 유력하다.",
    ],
    source: "LCK",
    sourceUrl: "#",
    participants: 567,
  },
  "es-4": {
    summary: [
      "한화생명이 농심을 2-0으로 완파했다.",
      "제카가 2경기 연속 MVP를 수상하며 팀을 이끌었다.",
      "한화는 상위권 도약을 노리고 있다.",
    ],
    source: "Inven",
    sourceUrl: "#",
    participants: 234,
  },
  // 자유게시판
  "fb-1": {
    summary: [
      "직관 필수 준비물 체크리스트가 화제.",
      "좌석별 시야 비교 사진이 큰 호응을 얻었다.",
      "경기장 맛집 정보도 함께 공유되고 있다.",
    ],
    source: "커뮤니티",
    sourceUrl: "#",
    participants: 156,
  },
  "fb-2": {
    summary: [
      "역대 최고의 스포츠 명장면을 주제로 토론이 진행 중.",
      "2002 월드컵, 김연아 올림픽 금메달 등이 후보로 올라와 있다.",
      "현재 투표에서 2002 월드컵이 1위를 기록 중.",
    ],
    source: "커뮤니티",
    sourceUrl: "#",
    participants: 289,
  },
  "fb-3": {
    summary: [
      "이번 주 베스트 유머글 TOP 5가 선정됐다.",
      '1위는 "축구 해설위원 말실수 모음" 게시글.',
      "총 2,300개의 추천을 받았다.",
    ],
    source: "커뮤니티",
    sourceUrl: "#",
    participants: 178,
  },
  // 정보게시판
  "tp-1": {
    summary: [
      "프리미어리그 26라운드 주요 분석 포인트가 업데이트됐다.",
      "강등권 팀들의 최근 상승세에 주목할 필요가 있다.",
      "빅6 팀의 부상자 현황도 함께 정리되어 있다.",
    ],
    source: "분석가",
    sourceUrl: "#",
    participants: 203,
  },
  "tp-2": {
    summary: [
      "KBO 시범경기 주목 포인트를 분석했다.",
      "신인 선수들의 실전 적응도가 핵심 관전 포인트.",
      "외국인 선수 교체 구단들의 전력 변화도 체크 필요.",
    ],
    source: "분석가",
    sourceUrl: "#",
    participants: 167,
  },
  "tp-3": {
    summary: [
      "지난주 가장 높은 적중률을 기록한 분석가가 발표됐다.",
      "1위 분석가의 적중률은 78%로 역대 최고 수준.",
      "분석 방법론과 노하우도 함께 공개됐다.",
    ],
    source: "분석가",
    sourceUrl: "#",
    participants: 134,
  },
}

function getDefaultComments(itemId: string): Comment[] {
  const commentsByPrefix: Record<string, Comment[]> = {
    of: [
      {
        id: "c1",
        author: "축구매니아",
        content: "오 이거 실화??",
        timestamp: "2분 전",
        likes: 24,
        isLiked: false,
      },
      {
        id: "c2",
        author: "EPL워치",
        content: "대박이다 ㄷㄷ",
        timestamp: "5분 전",
        likes: 18,
        isLiked: false,
      },
      {
        id: "c3",
        author: "라리가팬",
        content: "역시 유럽축구는 재밌어",
        timestamp: "8분 전",
        likes: 12,
        isLiked: false,
      },
    ],
    df: [
      {
        id: "c1",
        author: "K리그팬",
        content: "올시즌 기대된다!",
        timestamp: "3분 전",
        likes: 15,
        isLiked: false,
      },
      {
        id: "c2",
        author: "국대서포터",
        content: "파이팅 대한민국!",
        timestamp: "6분 전",
        likes: 22,
        isLiked: false,
      },
    ],
    bb: [
      {
        id: "c1",
        author: "야구팬",
        content: "드디어 시즌 시작이다!",
        timestamp: "1분 전",
        likes: 30,
        isLiked: false,
      },
      {
        id: "c2",
        author: "KBO워치",
        content: "올해 우승팀은 어디일까",
        timestamp: "5분 전",
        likes: 22,
        isLiked: false,
      },
    ],
    bk: [
      {
        id: "c1",
        author: "농구팬",
        content: "오늘 경기 볼만했다",
        timestamp: "4분 전",
        likes: 11,
        isLiked: false,
      },
      {
        id: "c2",
        author: "NBA매니아",
        content: "미쳤다 진짜",
        timestamp: "7분 전",
        likes: 15,
        isLiked: false,
      },
    ],
    vb: [
      {
        id: "c1",
        author: "배구팬",
        content: "오늘 경기 대박!",
        timestamp: "3분 전",
        likes: 8,
        isLiked: false,
      },
      {
        id: "c2",
        author: "V리그워치",
        content: "플레이오프 기대된다",
        timestamp: "6분 전",
        likes: 12,
        isLiked: false,
      },
    ],
    es: [
      {
        id: "c1",
        author: "T1팬",
        content: "페이커 아지르 장인 ㄷㄷ",
        timestamp: "2분 전",
        likes: 35,
        isLiked: false,
      },
      {
        id: "c2",
        author: "LCK매니아",
        content: "역전승 소름돋는다",
        timestamp: "4분 전",
        likes: 28,
        isLiked: false,
      },
      {
        id: "c3",
        author: "겜덕후",
        content: "T1 우승 가자!",
        timestamp: "6분 전",
        likes: 19,
        isLiked: false,
      },
    ],
    fb: [
      {
        id: "c1",
        author: "자유인",
        content: "ㅋㅋㅋ 재밌다",
        timestamp: "1분 전",
        likes: 10,
        isLiked: false,
      },
      {
        id: "c2",
        author: "잡담러",
        content: "좋은 정보 감사합니다",
        timestamp: "4분 전",
        likes: 7,
        isLiked: false,
      },
    ],
    tp: [
      {
        id: "c1",
        author: "분석맨",
        content: "좋은 분석이네요",
        timestamp: "2분 전",
        likes: 14,
        isLiked: false,
      },
      {
        id: "c2",
        author: "정보통",
        content: "참고하겠습니다!",
        timestamp: "5분 전",
        likes: 9,
        isLiked: false,
      },
    ],
  }
  const prefix = itemId.split("-")[0]
  return commentsByPrefix[prefix] || []
}
