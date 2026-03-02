/**
 * 게시판별 토픽 키워드 정의
 * 글 제목/내용에서 키워드를 매칭하여 토픽 점유율 산출
 */

export interface TopicDef {
  /** 토픽 표시명 */
  label: string
  /** 매칭할 키워드 (OR 조건, 대소문자 무시) */
  keywords: string[]
  /** 표시 색상 (tailwind bg class) */
  color: string
}

export const TOPIC_KEYWORDS: Record<string, TopicDef[]> = {
  football: [
    {
      label: "맨유",
      keywords: ["맨유", "맨체스터 유나이티드", "manchester united", "man utd", "man united"],
      color: "bg-red-500",
    },
    { label: "아스날", keywords: ["아스날", "아스널", "arsenal"], color: "bg-red-400" },
    { label: "리버풀", keywords: ["리버풀", "liverpool"], color: "bg-red-600" },
    { label: "첼시", keywords: ["첼시", "chelsea"], color: "bg-blue-500" },
    {
      label: "맨시티",
      keywords: ["맨시티", "맨체스터 시티", "manchester city", "man city"],
      color: "bg-sky-400",
    },
    {
      label: "토트넘",
      keywords: ["토트넘", "tottenham", "spurs", "손흥민"],
      color: "bg-slate-300",
    },
    {
      label: "바르셀로나",
      keywords: ["바르셀로나", "바르사", "barcelona", "barca"],
      color: "bg-blue-700",
    },
    {
      label: "레알 마드리드",
      keywords: ["레알", "레알마드리드", "real madrid"],
      color: "bg-yellow-100",
    },
    { label: "바이에른", keywords: ["바이에른", "뮌헨", "bayern"], color: "bg-red-700" },
    { label: "PSG", keywords: ["PSG", "파리", "paris saint"], color: "bg-blue-900" },
    {
      label: "K리그",
      keywords: [
        "K리그",
        "전북",
        "울산",
        "FC서울",
        "수원",
        "인천",
        "대전",
        "포항",
        "제주",
        "강원",
        "광주FC",
        "대구FC",
        "김천",
      ],
      color: "bg-green-500",
    },
    {
      label: "국가대표",
      keywords: ["국가대표", "국대", "월드컵", "아시안컵", "A매치"],
      color: "bg-rose-500",
    },
  ],
  baseball: [
    { label: "삼성", keywords: ["삼성", "라이온즈", "samsung lions"], color: "bg-blue-500" },
    { label: "LG", keywords: ["LG", "트윈스", "엘지"], color: "bg-red-600" },
    { label: "두산", keywords: ["두산", "베어스"], color: "bg-slate-600" },
    { label: "KT", keywords: ["KT", "위즈", "케이티"], color: "bg-black" },
    { label: "SSG", keywords: ["SSG", "랜더스", "에스에스지"], color: "bg-red-500" },
    { label: "NC", keywords: ["NC", "다이노스", "엔씨"], color: "bg-amber-600" },
    { label: "한화", keywords: ["한화", "이글스"], color: "bg-orange-500" },
    { label: "롯데", keywords: ["롯데", "자이언츠"], color: "bg-blue-800" },
    { label: "KIA", keywords: ["KIA", "키아", "타이거즈", "기아"], color: "bg-red-700" },
    { label: "키움", keywords: ["키움", "히어로즈"], color: "bg-purple-600" },
    {
      label: "MLB",
      keywords: ["MLB", "메이저리그", "양키스", "다저스", "오타니", "류현진", "김하성", "대리그"],
      color: "bg-blue-400",
    },
  ],
  basketball: [
    { label: "레이커스", keywords: ["레이커스", "lakers", "LA 레이커스"], color: "bg-purple-500" },
    { label: "셀틱스", keywords: ["셀틱스", "보스턴", "celtics"], color: "bg-green-600" },
    {
      label: "워리어스",
      keywords: ["워리어스", "골든스테이트", "warriors", "커리"],
      color: "bg-yellow-400",
    },
    { label: "너겟츠", keywords: ["너겟츠", "덴버", "nuggets", "요키치"], color: "bg-blue-500" },
    { label: "벅스", keywords: ["벅스", "밀워키", "bucks", "아데토쿤보"], color: "bg-green-700" },
    {
      label: "KBL",
      keywords: [
        "KBL",
        "프로농구",
        "전자랜드",
        "삼성 썬더스",
        "KCC",
        "현대모비스",
        "SK나이츠",
        "LG세이커스",
        "원주DB",
        "안양KGC",
        "소노",
      ],
      color: "bg-orange-500",
    },
  ],
  volleyball: [
    { label: "현대건설", keywords: ["현대건설", "힐스테이트"], color: "bg-green-600" },
    { label: "흥국생명", keywords: ["흥국생명", "핑크스파이더스"], color: "bg-pink-500" },
    { label: "GS칼텍스", keywords: ["GS칼텍스", "킹스타즈", "GS"], color: "bg-blue-500" },
    { label: "한국도로공사", keywords: ["도로공사", "하이패스"], color: "bg-orange-500" },
    { label: "IBK기업은행", keywords: ["기업은행", "IBK", "알토스"], color: "bg-blue-700" },
    { label: "AI페퍼스", keywords: ["페퍼스", "AI페퍼스", "pepper"], color: "bg-red-500" },
    { label: "삼성화재", keywords: ["삼성화재", "블루팡스"], color: "bg-blue-600" },
    { label: "대한항공", keywords: ["대한항공", "점보스"], color: "bg-sky-500" },
    { label: "KB손보", keywords: ["KB손보", "스타즈"], color: "bg-yellow-500" },
    { label: "우리카드", keywords: ["우리카드", "우리WON"], color: "bg-blue-400" },
  ],
  game: [
    {
      label: "LoL",
      keywords: ["롤", "LoL", "리그오브레전드", "리그 오브 레전드", "league of legends"],
      color: "bg-blue-500",
    },
    { label: "발로란트", keywords: ["발로란트", "valorant"], color: "bg-red-500" },
    { label: "오버워치", keywords: ["오버워치", "overwatch", "옵치"], color: "bg-orange-500" },
    { label: "스팀/PC", keywords: ["스팀", "steam", "PC", "에픽"], color: "bg-slate-600" },
    {
      label: "닌텐도",
      keywords: ["닌텐도", "스위치", "nintendo", "switch", "젤다", "마리오", "포켓몬"],
      color: "bg-red-600",
    },
    {
      label: "플스",
      keywords: ["플레이스테이션", "PS5", "PS4", "플스", "playstation", "소니"],
      color: "bg-blue-700",
    },
    {
      label: "모바일",
      keywords: ["모바일", "리니지", "메이플", "쿠키런", "원신", "블아"],
      color: "bg-green-500",
    },
    {
      label: "마크/샌드박스",
      keywords: ["마인크래프트", "마크", "minecraft", "발하임", "팰월드"],
      color: "bg-emerald-600",
    },
  ],
  movies: [
    {
      label: "마블/DC",
      keywords: [
        "마블",
        "marvel",
        "DC",
        "어벤져스",
        "스파이더맨",
        "배트맨",
        "슈퍼맨",
        "MCU",
        "DCU",
      ],
      color: "bg-red-500",
    },
    { label: "넷플릭스", keywords: ["넷플릭스", "netflix", "넷플"], color: "bg-red-600" },
    {
      label: "디즈니+",
      keywords: ["디즈니", "disney", "디즈니+", "디즈니플러스"],
      color: "bg-blue-500",
    },
    {
      label: "한국영화",
      keywords: ["한국영화", "국내영화", "천만", "충무로"],
      color: "bg-yellow-500",
    },
    {
      label: "호러/스릴러",
      keywords: ["호러", "공포", "horror", "스릴러", "thriller"],
      color: "bg-slate-700",
    },
    {
      label: "애니/지브리",
      keywords: ["지브리", "ghibli", "픽사", "pixar", "애니메이션 영화"],
      color: "bg-green-400",
    },
    {
      label: "한드/K드라마",
      keywords: ["한드", "K드라마", "kdrama", "드라마", "SBS", "KBS", "MBC", "tvN", "JTBC"],
      color: "bg-purple-500",
    },
    {
      label: "미드/해외드라마",
      keywords: ["미드", "해외드라마", "HBO", "왕좌의게임", "하우스오브드래곤"],
      color: "bg-indigo-500",
    },
  ],
  music: [
    {
      label: "아이돌/K-POP",
      keywords: [
        "아이돌",
        "컴백",
        "뉴진스",
        "에스파",
        "방탄",
        "BTS",
        "블랙핑크",
        "스트레이키즈",
        "세븐틴",
        "르세라핌",
        "IVE",
        "아이브",
      ],
      color: "bg-pink-500",
    },
    {
      label: "힙합",
      keywords: ["힙합", "래퍼", "래핑", "비트", "사이퍼", "SMTM", "쇼미", "드레이크", "켄드릭"],
      color: "bg-yellow-600",
    },
    {
      label: "밴드/인디",
      keywords: ["밴드", "인디", "록", "rock", "indie", "기타", "페스티벌"],
      color: "bg-emerald-500",
    },
    {
      label: "팝/해외",
      keywords: ["팝", "pop", "테일러", "위켄드", "빌보드", "billboard", "그래미"],
      color: "bg-blue-400",
    },
    {
      label: "차트/음방",
      keywords: ["차트", "음방", "멜론", "지니", "스포티파이", "spotify", "1위", "음원"],
      color: "bg-orange-500",
    },
  ],
  idol: [
    {
      label: "BTS/방탄",
      keywords: ["BTS", "방탄", "방탄소년단", "지민", "정국", "RM", "뷔", "슈가", "진", "제이홉"],
      color: "bg-purple-500",
    },
    {
      label: "블랙핑크",
      keywords: ["블랙핑크", "blackpink", "블핑", "제니", "지수", "로제", "리사"],
      color: "bg-pink-500",
    },
    {
      label: "뉴진스",
      keywords: ["뉴진스", "newjeans", "민지", "하니", "다니엘", "해린", "혜인"],
      color: "bg-blue-400",
    },
    {
      label: "에스파",
      keywords: ["에스파", "aespa", "카리나", "윈터", "닝닝", "지젤"],
      color: "bg-violet-500",
    },
    { label: "세븐틴", keywords: ["세븐틴", "seventeen", "SVT", "세봉"], color: "bg-rose-400" },
    {
      label: "아이브",
      keywords: ["아이브", "IVE", "장원영", "안유진", "레이", "리즈", "가을", "이서"],
      color: "bg-red-400",
    },
    {
      label: "스트레이키즈",
      keywords: ["스트레이키즈", "stray kids", "스키즈", "SKZ"],
      color: "bg-black",
    },
    {
      label: "르세라핌",
      keywords: ["르세라핌", "le sserafim", "사쿠라", "김채원", "허윤진", "카즈하", "홍은채"],
      color: "bg-blue-600",
    },
    {
      label: "기타 아이돌",
      keywords: [
        "아이돌",
        "컴백",
        "데뷔",
        "팬미팅",
        "팬사인회",
        "음방",
        "직캠",
        "엔시티",
        "NCT",
        "트와이스",
        "있지",
        "ITZY",
        "엔하이픈",
        "TXT",
      ],
      color: "bg-gray-500",
    },
  ],
  anime: [
    { label: "원피스", keywords: ["원피스", "one piece", "루피"], color: "bg-red-500" },
    {
      label: "나루토/보루토",
      keywords: ["나루토", "보루토", "naruto", "boruto"],
      color: "bg-orange-500",
    },
    {
      label: "귀멸의 칼날",
      keywords: ["귀멸", "귀칼", "demon slayer", "탄지로"],
      color: "bg-green-600",
    },
    {
      label: "주술회전",
      keywords: ["주술회전", "jujutsu", "고죠", "이타도리"],
      color: "bg-blue-500",
    },
    { label: "진격의 거인", keywords: ["진격", "거인", "attack on titan"], color: "bg-slate-600" },
    {
      label: "건담/메카",
      keywords: ["건담", "gundam", "메카", "에반게리온", "에바"],
      color: "bg-blue-700",
    },
    {
      label: "이세계",
      keywords: ["이세계", "전생", "isekai", "오버로드", "무직전생", "리제로"],
      color: "bg-purple-500",
    },
    {
      label: "웹툰/만화",
      keywords: ["웹툰", "manhwa", "네이버웹툰", "카카오", "만화"],
      color: "bg-green-500",
    },
  ],
  "free-board": [
    {
      label: "유머",
      keywords: ["ㅋㅋ", "웃긴", "유머", "개웃", "짤", "밈", "meme"],
      color: "bg-yellow-400",
    },
    {
      label: "질문/정보",
      keywords: ["질문", "궁금", "어떻게", "추천", "정보", "팁"],
      color: "bg-blue-500",
    },
    {
      label: "일상/잡담",
      keywords: ["일상", "잡담", "오늘", "출근", "퇴근", "주말"],
      color: "bg-green-400",
    },
    { label: "뉴스/이슈", keywords: ["뉴스", "속보", "이슈", "논란", "사건"], color: "bg-red-500" },
  ],
}
