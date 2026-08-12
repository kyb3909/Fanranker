/**
 * 실험실 표본 데이터 — 모든 변주가 **같은 기사**를 그린다.
 * 데이터가 다르면 레이아웃이 아니라 내용을 비교하게 된다.
 *
 * 실제 피드에서 가져온 4종: 투표 있음(짧은 라벨) / 투표 있음(긴 라벨) /
 * 타로(폴 없음) / 실사진(플레이스홀더 아님).
 */

export interface Sample {
  id: string
  source: string
  flair: string
  title: string
  comments: number
  votes: number
  ago: string
  image: string
  /** 실사진인가 (구단 플레이스홀더가 아님) */
  photo?: boolean
  vs?: { question: string; a: string; b: string; aPct: number; total: number }
  tarot?: string
}

export const SAMPLES: Sample[] = [
  {
    id: "s1",
    source: "잭 피트 브룩",
    flair: "토트넘",
    title: "토트넘 구단주 루이스 가족, 런던 NBA 유럽 프랜차이즈 인수 입찰 모색",
    comments: 4,
    votes: 2,
    ago: "13분 전",
    image: "/images/news-team/epl_tottenham.webp",
    vs: {
      question: "루이스 가족의 NBA 인수 가능할까?",
      a: "NBA 인수는 긍정적이다",
      b: "NBA 인수는 불확실하다",
      aPct: 50,
      total: 0,
    },
  },
  {
    id: "s2",
    source: "가제타",
    flair: "뉴스",
    title: "아모림의 구상: 마르세유 시절처럼 라비오를 2선 공격수로 기용",
    comments: 0,
    votes: 0,
    ago: "1시간 전",
    image: "/images/news-team/epl_manutd.webp",
    vs: {
      question: "라비오를 2선 공격수로 쓸까?",
      a: "효과적일 것 같다",
      b: "위험할 수 있다",
      aPct: 50,
      total: 0,
    },
  },
  {
    id: "s3",
    source: "스카이",
    flair: "이적",
    title: "도르트문트, 사이드 엘 말라 영입 제안 5천만 유로 + 500만 유로로 증가",
    comments: 1,
    votes: 0,
    ago: "43분 전",
    image: "/images/news-team/bundesliga_dortmund.webp",
    tarot: "이 이적, 카드는 뭐라고 할까?",
  },
  {
    id: "s4",
    source: "디 애슬레틱",
    flair: "첼시",
    title: "월드컵 참가 선수 복귀 및 여름 이적생 4명 구단 합류",
    comments: 7,
    votes: 3,
    ago: "2시간 전",
    image: "/images/news-team/epl_chelsea.webp",
    photo: true,
    tarot: "이 이적, 카드는 뭐라고 할까?",
  },
]
