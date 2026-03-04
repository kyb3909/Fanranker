/**
 * 봇 시드 스크립트 - 커뮤니티 초기 콘텐츠 생성
 *
 * 5개의 봇 프로필을 생성하고, 각 봇이 관련 커뮤니티에 10개의 게시글을 작성합니다.
 * 게시글마다 다른 봇들이 댓글과 추천을 달아 자연스러운 커뮤니티 느낌을 만듭니다.
 *
 * 사용법:
 *   npx tsx scripts/seed-bot-content.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('환경 변수가 필요합니다:')
  if (!SUPABASE_URL) console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  if (!SUPABASE_SERVICE_ROLE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ============================================================
// 봇 프로필 정의
// ============================================================

interface BotProfile {
  user_id: string
  nickname: string
  avatar_url: string | null
  community_slug: string
}

const BOTS: BotProfile[] = [
  {
    user_id: 'user_bot_축구팬01',
    nickname: '축구광 민수',
    avatar_url: null,
    community_slug: 'football',
  },
  {
    user_id: 'user_bot_야구팬01',
    nickname: '야구덕후 지훈',
    avatar_url: null,
    community_slug: 'baseball',
  },
  {
    user_id: 'user_bot_자유01',
    nickname: '커뮤러 서연',
    avatar_url: null,
    community_slug: 'free-board',
  },
  {
    user_id: 'user_bot_농구팬01',
    nickname: '농구매니아 현우',
    avatar_url: null,
    community_slug: 'basketball',
  },
  {
    user_id: 'user_bot_게임러01',
    nickname: '겜덕 수아',
    avatar_url: null,
    community_slug: 'game',
  },
]

// ============================================================
// 게시글 데이터 (봇별 10개씩)
// ============================================================

interface PostData {
  title: string
  content: string
}

const POSTS_BY_BOT: Record<string, PostData[]> = {
  // 축구광 민수 - football
  user_bot_축구팬01: [
    {
      title: '살라 이적설 진짜인가요? PSG 갈 확률은?',
      content:
        '살라가 계약 연장 안 하면 PSG 간다는 소문이 자꾸 도는데 진짜인가요? 리버풀 입장에서는 절대 보내면 안 되는 선수인데... 개인적으로는 잔류할 것 같긴 합니다. 살라 없는 리버풀은 상상이 안 가네요.',
    },
    {
      title: '프리미어리그 이번 시즌 우승 예상',
      content:
        '아스날 vs 맨시티 경쟁이 또 치열할 것 같은데 여러분은 어디 찍으셨나요? 저는 올해 아스날이 드디어 우승할 것 같습니다. 사카 폼이 장난 아니에요. 라이스도 완전 적응했고.',
    },
    {
      title: '음바페 레알 적응 어떻게 보시나요',
      content:
        '솔직히 처음에는 좀 겉도는 느낌이었는데 최근 경기 보니까 확실히 좋아졌음. 비니시우스랑 호흡도 맞아가고. 그래도 PSG 때만큼의 원맨쇼는 어려울 듯.',
    },
    {
      title: '챔피언스리그 조별리그 개편 어떻게 생각하세요?',
      content:
        '스위스 시스템으로 바뀌었는데 경기 수가 너무 많아진 거 아닌가 싶기도 하고... 근데 다양한 팀끼리 붙으니까 재미는 확실히 늘었습니다. 여러분 의견이 궁금합니다.',
    },
    {
      title: '손흥민 올 시즌 득점 10골 가능할까?',
      content:
        '나이가 있다 보니 체력 관리가 관건인데, 최근 폼을 보면 아직 충분히 가능할 것 같아요. 토트넘이 팀 전체적으로 좀 더 안정되면 어시스트도 많이 올릴 듯.',
    },
    {
      title: '분데스리가 볼 만한 팀 추천 좀',
      content:
        '프리미어리그만 보다가 다른 리그도 좀 보려고 하는데 분데스리가에서 재밌는 팀 있나요? 레버쿠젠이 작년에 무패 우승 했다던데 올해도 강한가요?',
    },
    {
      title: '역대 최고의 프리킥 키커는 누구?',
      content:
        '미하일로비치, 베컴, 호나우지뉴, 메시... 다들 프리킥 하면 떠오르는 선수가 다를 것 같은데요. 저는 개인적으로 주니뉴요. 무회전 프리킥의 원조죠. 여러분은요?',
    },
    {
      title: '첼시 감독 또 바뀌나요 ㅋㅋ',
      content:
        '첼시 근황이 너무 웃기면서도 안쓰럽네요. 구단주가 바뀌고 나서 감독을 몇 명이나 갈아치운 건지... 이번에는 좀 오래 갔으면 좋겠는데 성적이 안 나오면 또 짤릴 듯.',
    },
    {
      title: '라리가 바르사 젊은 선수들 미쳤다',
      content:
        '야말, 페드리, 가비 복귀하면 라리가 최강 아닌가요? 라마시아 출신들이 이렇게 한꺼번에 잘 나오는 게 진짜 대단함. 메시 이후 암흑기 끝난 느낌입니다.',
    },
    {
      title: '축구 보면서 먹기 좋은 야식 추천',
      content:
        '새벽에 프리미어리그 볼 때 항상 뭐 먹을지 고민인데 다들 뭐 드시나요? 치킨은 너무 느끼하고 최근에는 떡볶이 시켜먹는데 이것도 질림. 가볍게 먹을 만한 거 추천 부탁합니다.',
    },
  ],

  // 야구덕후 지훈 - baseball
  user_bot_야구팬01: [
    {
      title: 'KBO 올 시즌 신인왕 누가 될까요',
      content:
        '작년 드래프트 1순위 선수들 스프링캠프 영상 보니까 몇 명 진짜 기대되더라고요. 타자 쪽에서는 확실히 장타력 있는 선수가 눈에 띄는데, 투수 쪽도 괜찮은 루키가 있어서 경쟁이 치열할 듯.',
    },
    {
      title: 'MLB 오타니 올해 40-40 또 할 수 있을까?',
      content:
        '작년에 50-50이라는 미친 기록을 세웠는데 올해도 가능할지 궁금하네요. 투수 복귀하면 이도류로 돌아오는 건데, 몸 상태만 괜찮으면 진짜 또 해낼 것 같아요.',
    },
    {
      title: '직관할 때 꿀팁 공유합니다',
      content:
        '야구장 자주 가는 편인데 몇 가지 팁 공유할게요. 1. 평일 경기가 자리 잡기 좋음 2. 치킨은 미리 주문하고 가면 줄 안 서도 됨 3. 3루쪽 내야석이 해가 안 들어서 여름에 편함. 다들 꿀팁 있으면 알려주세요!',
    },
    {
      title: '역대 KBO 최고의 외국인 선수는?',
      content:
        '개인적으로 에릭 테임즈를 뽑고 싶은데 타일러도 대단했고... 투수로는 린드블럼? 다들 누구를 최고로 꼽으시나요? 시대별로 레전드급 외국인 선수가 한 명씩은 있었던 것 같아요.',
    },
    {
      title: '올해 한국시리즈 우승팀 예상',
      content:
        'KBO 프리시즌 시작되면서 각 팀 전력 분석하고 있는데, 올해는 전력이 꽤 평준화된 느낌이에요. SSG가 좀 약해졌고 두산이 보강을 잘 한 것 같은데 여러분 생각은?',
    },
    {
      title: '야구 초보인데 포지션별 역할 설명해주실 분',
      content:
        '여자친구가 야구에 관심 가지기 시작했는데 포지션 설명하려니까 막상 쉽지 않네요. 유격수랑 2루수 차이, 선발 중계 마무리 차이 등 쉽게 설명할 수 있는 방법 있을까요?',
    },
    {
      title: '야구장 맥주 가격 너무 비싸지 않나요',
      content:
        '직관 갈 때마다 맥주값이 아까운데 안 마실 수도 없고... 한 잔에 5000원이 넘으니까 4~5잔만 마셔도 만원 훌쩍인데. 다들 어떻게 생각하세요? 그래도 분위기 값이라 마시긴 하지만.',
    },
    {
      title: '투수 구속 논쟁 - 빠르기만 하면 되나?',
      content:
        '요즘 150km 던지는 투수가 흔해졌는데, 구속만 빠르다고 좋은 투수는 아니잖아요. 제구력이나 구종 다양성이 더 중요한 것 같은데... 그래도 일단 구속이 기본이긴 하죠.',
    },
    {
      title: '치어리더 응원 문화에 대한 생각',
      content:
        '한국 야구 치어리더 문화가 세계적으로 독특하다고 하더라고요. 외국인 친구가 한국 야구 영상 보고 깜짝 놀라더라구요. 개인적으로는 응원 문화가 야구장 분위기를 확실히 살려준다고 봅니다.',
    },
    {
      title: '야구 글러브 추천 좀 해주세요',
      content:
        '동호회 야구 시작했는데 글러브를 뭘 사야 할지 모르겠어요. 예산은 10~15만원 정도인데 입문용으로 괜찮은 브랜드나 모델 추천 부탁드립니다. 포지션은 외야입니다.',
    },
  ],

  // 커뮤러 서연 - free-board
  user_bot_자유01: [
    {
      title: '자취 요리 레시피 공유해요 - 초간단 파스타',
      content:
        '자취생 필수 레시피! 올리브오일에 마늘 볶다가 면 삶은 물 반 국자 넣고 면 넣으면 끝. 여기에 계란 노른자 올리면 카르보나라 비슷한 게 됩니다. 재료비 3천원도 안 드는 갓성비 요리예요.',
    },
    {
      title: '넷플릭스 뭐 볼지 추천 좀요',
      content:
        '최근에 볼 만한 드라마나 영화 추천해주세요. 장르 안 가리는데 너무 무거운 건 빼고요. 최근에 본 건 다 재미없었는데 추천 목록이 바닥났습니다.',
    },
    {
      title: '알바 면접 팁 공유합니다',
      content:
        '카페 알바 3곳 면접 봤는데 전부 붙었어요. 비결은 1. 미리 매장 가서 분위기 파악 2. 면접 때 구체적인 경험 이야기 3. 시간 유연하다고 어필하기. 사소하지만 확실히 차이 나더라구요.',
    },
    {
      title: '오늘 날씨 미쳤다 ㅋㅋ',
      content:
        '아침에 출근할 때 춥길래 패딩 입고 나왔는데 점심때 20도 넘어서 땀 줄줄;;; 이게 뭔 날씨인지 환절기 옷 고르기가 제일 어려운 것 같아요. 다들 오늘 뭐 입고 나오셨나요?',
    },
    {
      title: '카페 추천 - 서울 핫플 정리',
      content:
        '주말에 갈 만한 서울 카페 정리해봤어요. 성수동 쪽은 너무 사람 많아서 빼고, 연남동 골목에 숨은 카페들이 의외로 분위기 좋고 조용합니다. 망원동 쪽도 괜찮아요. 구체적인 곳 궁금하시면 댓글 달아주세요!',
    },
    {
      title: '다이어트 중인데 야식 참는 법',
      content:
        '밤 10시만 되면 배고파지는데 이거 어떻게 참으시나요? 물 마셔도 안 되고 양치해도 안 되고... 결국 어제도 라면 끓여먹었습니다. 의지박약 인간의 슬픔이에요.',
    },
    {
      title: '직장인 점심 메뉴 고르기 세계 최대 난제',
      content:
        '매일 점심마다 뭐 먹을지 고민하는 시간이 제일 길어요. 회사 근처 식당은 다 가봤고 배달은 비싸고... 도시락 싸는 게 답인가요? 직장인분들 점심 어떻게 해결하시나요?',
    },
    {
      title: '강아지 키우는 분들 질문 있어요',
      content:
        '강아지 입양 고민 중인데 자취하면서 키울 수 있을까요? 출퇴근 시간이 길어서 혼자 있는 시간이 8시간 정도 되는데 괜찮은지 경험 있는 분들 조언 부탁드려요.',
    },
    {
      title: '요즘 MBTI 얘기 안 하면 대화 안 되나요',
      content:
        '처음 만나는 사람마다 MBTI 물어보는데 저는 솔직히 잘 모르겠거든요. INFP라고 하면 다들 뭔가 기대하는 눈빛인데... 그냥 성격 테스트일 뿐인데 너무 진지하게 받아들이는 것 같기도.',
    },
    {
      title: '주말에 혼자 할 만한 것 추천',
      content:
        '친구들이 다 바쁘고 혼자 주말 보내야 하는데 뭐 하면 좋을까요? 영화관은 질리고 카페도 매일 가니까 좀 새로운 거 하고 싶은데. 혼자서도 재밌게 보낼 수 있는 취미 추천해주세요!',
    },
  ],

  // 농구매니아 현우 - basketball
  user_bot_농구팬01: [
    {
      title: 'NBA 올 시즌 MVP 레이스 누가 앞서나요',
      content:
        '요키치, 돈치치, 셈 둘 다 엄청난데 올해 MVP 누가 될 것 같아요? 개인적으로 요키치가 3년 연속은 좀 어렵지 않을까 싶고, 돈치치가 갈 수도 있을 것 같습니다.',
    },
    {
      title: '르브론 은퇴 시기 언제쯤일까',
      content:
        '40살인데도 아직 경기에서 뛰고 있다는 게 진짜 대단해요. 본인이 브로니랑 같이 뛰겠다고 했으니까 올해까지는 할 것 같은데, 체력적으로 힘들지 않을까. 역대 최고 논쟁에서 조던과 비교될 정도의 커리어인 건 확실.',
    },
    {
      title: 'KBL 한국 농구 좀 더 관심 가져주세요',
      content:
        'NBA만 보지 말고 KBL도 좀 봐주세요ㅜㅜ 재미있는 경기 많은데 관중이 너무 적어요. 직관 가격도 저렴하고 선수들한테 사인도 잘 받을 수 있는데... 국내 농구도 충분히 매력 있습니다.',
    },
    {
      title: '농구 시작하려는데 무릎 보호대 필수인가요?',
      content:
        '30대에 농구 입문하려고 하는데 무릎이 걱정이에요. 보호대 차고 하면 괜찮을까요? 아니면 다른 운동부터 체력 만들고 시작하는 게 나을까요? 주변에 같이 할 사람은 있는데 체력이 문제네요.',
    },
    {
      title: '커리 3점슛 폼 따라하다 어깨 나갈 뻔',
      content:
        'YouTube에서 커리 슈팅 폼 분석 영상 보고 따라했는데 어깨에 무리가 오더라고요 ㅋㅋ 프로선수 폼을 아마추어가 그대로 따라하면 안 되는 이유를 몸소 체험했습니다. 기본기부터 다시 해야겠어요.',
    },
    {
      title: '역대 최고의 NBA 파이널 시리즈는?',
      content:
        '2016년 캐벌리어스 vs 워리어스 1-3에서 뒤집은 시리즈를 아직도 잊을 수 없어요. 르브론의 체이스다운 블록은 NBA 역사상 최고의 장면 중 하나. 다들 기억에 남는 파이널 시리즈 있으신가요?',
    },
    {
      title: '농구화 추천 - 가성비 좋은 모델',
      content:
        '농구화 살 건데 20만원 이하로 추천 부탁드려요. 나이키 르브론 시리즈가 괜찮다는데 발볼이 좁다고도 하고... 아디다스 할든도 괜찮나요? 실착감 후기 알려주세요.',
    },
    {
      title: '픽업 게임에서 이기는 꿀팁',
      content:
        '동네 농구 코트에서 픽업 게임 자주 하는데 이기는 팀의 공통점이 있더라고요. 1. 패스 많이 하는 팀 2. 리바운드 싸움 지지 않는 팀 3. 쓸데없이 3점 안 쏘는 팀. 개인기보다 팀워크가 진짜 중요합니다.',
    },
    {
      title: 'NBA 유니폼 어디서 사야 안 속나요?',
      content:
        '인터넷에 가품이 너무 많아서 어디서 사야 할지 모르겠어요. 나이키 공홈은 너무 비싸고 해외직구는 불안하고... 정품 인증 되는 곳이나 믿을 만한 사이트 알려주시면 감사하겠습니다.',
    },
    {
      title: '웸반야마 이 선수 진짜 사기 아닌가요',
      content:
        '224cm에 가드처럼 드리블하고 3점도 쏘고 블록도 미친 듯이 하는데 이게 가능한 인간인가요? NBA 역사를 다시 쓸 선수라는 말이 과장이 아닌 것 같습니다. 앞으로가 더 기대됩니다.',
    },
  ],

  // 겜덕 수아 - game
  user_bot_게임러01: [
    {
      title: 'T1 페이커 은퇴하면 롤 볼 이유가 있나',
      content:
        '페이커가 은퇴하면 LCK 시청률 반토막 날 것 같은데... 물론 다른 선수들도 잘하지만 페이커의 존재감은 다르잖아요. 롤드컵 우승이 몇 번째인지 셀 수도 없는 레전드인데 은퇴하면 진짜 슬플 듯.',
    },
    {
      title: '발로란트 요원 추천 - 입문자용',
      content:
        '발로란트 처음 시작하는데 어떤 요원부터 하면 좋을까요? 에임이 좀 약한 편이라 총 잘 못 쏴도 팀에 기여할 수 있는 요원이면 좋겠는데. 센티널이나 컨트롤러 쪽이 좋을까요?',
    },
    {
      title: 'LCK 스프링 시즌 예상 순위',
      content:
        'T1, 젠지, 한화가 3강 체제인 것 같은데 올해는 DRX나 KT도 좀 올라올 수 있을 것 같아요. 특히 DRX 로스터 보강이 잘 된 느낌. 다들 순위 예상 어떻게 하시나요?',
    },
    {
      title: '게이밍 키보드 추천 좀요',
      content:
        '기계식 키보드 사려는데 적축이 좋을까요 갈축이 좋을까요? 게임 위주로 쓸 건데 타건음이 너무 큰 건 싫어요. 예산 10만원 선에서 괜찮은 모델 있으면 알려주세요. 현재는 멤브레인 쓰고 있어요.',
    },
    {
      title: '오버워치2 시즌 미쳤다 ㅋㅋ',
      content:
        '새 시즌 패치 내용 보셨나요? 밸런스가 또 이상하게 바뀌었어요. 디바 너프 왜 한 거지 이미 픽률 낮았는데... 블리자드 밸런스 팀은 진짜 게임 안 하나 싶을 때가 있습니다.',
    },
    {
      title: 'e스포츠 선수 수명이 너무 짧지 않나요',
      content:
        '프로게이머 은퇴 나이가 20대 중반이라니... 일반 직장인 기준으로 이제 막 시작하는 나이에 은퇴라니 좀 안타깝죠. 은퇴 후 진로도 스트리머나 코치 말고는 선택지가 적은 것 같아요.',
    },
    {
      title: '스팀 세일 기간에 사면 좋은 게임 추천',
      content:
        '스팀 세일 곧 하는데 살 게임 목록 정리 중이에요. 발더스 게이트3은 꼭 해보라는데 시간이 너무 많이 드는 게 문제고... 가볍게 즐길 수 있는 인디 게임도 추천해주세요!',
    },
    {
      title: '롤 솔랭 탈출 못하겠어요 도와주세요',
      content:
        '실버에서 골드를 못 올라가겠어요. 라인전은 이기는데 중반 이후에 팀싸움에서 자꾸 지는 패턴이에요. 원딜 포지션인데 포지셔닝 팁이나 챔프 추천 있으시면 알려주세요ㅜㅜ',
    },
    {
      title: '게임 중독인지 취미인지 구분이 안 됨',
      content:
        '하루에 4-5시간은 게임하는데 이게 중독인 건지 그냥 취미인 건지 모르겠어요. 할 일 다 하고 남는 시간에 하는 거긴 한데 주변에서는 너무 많이 한다고 하네요. 여러분은 하루에 얼마나 하시나요?',
    },
    {
      title: '마인크래프트 건축 자랑합니다',
      content:
        '2주 동안 만든 중세 성 건축물인데 나름 잘 만든 것 같아요. 내부에 레드스톤 장치도 넣었고 마을 주민 동선까지 설계했어요. 건축 서버 추천도 받고 싶고 같이 할 분도 찾고 있습니다.',
    },
  ],
}

// ============================================================
// 댓글 데이터 (봇별 댓글 풀 - 다른 커뮤니티 게시글에도 쓸 수 있는 범용 + 특화 댓글)
// ============================================================

interface CommentPool {
  generic: string[] // 어디든 쓸 수 있는 범용 댓글
  specific: Record<string, string[]> // 특정 community_slug별 특화 댓글
}

const COMMENT_POOLS: Record<string, CommentPool> = {
  user_bot_축구팬01: {
    generic: [
      'ㅋㅋㅋ 공감합니다',
      '오 좋은 정보 감사합니다!',
      '저도 그렇게 생각해요',
      '진짜요? 몰랐네',
      '재밌게 읽었어요 ㅎㅎ',
      '와 대박이다',
      '이건 좀 다른 의견인데... 그래도 존중합니다',
      '이 글 저장해둘게요',
    ],
    specific: {
      baseball: [
        '야구도 좋지만 축구가 최고죠 ㅋㅋ 농담이에요',
        '야구 직관도 가끔 가는데 분위기 좋더라구요',
        '아 MLB도 좀 봐야 하는데 시간이 안 나네',
      ],
      basketball: [
        'NBA도 가끔 보는데 확실히 스피디하니까 재밌음',
        '농구 체력이 진짜 대단한 것 같아요',
        '조던 vs 르브론 논쟁은 축구에서 메시 vs 호날두 같은 거죠 ㅋㅋ',
      ],
      'free-board': [
        '오 맞아요 저도 그런 경험 있어요',
        '자취 동지시군요 ㅋㅋ 힘내세요',
        '공감 백배... 직장인의 슬픔이죠',
      ],
      game: [
        '롤은 좀 했었는데 요즘은 안 하네요',
        '페이커 레전드인 건 인정합니다',
        'e스포츠도 스포츠의 일종이라고 봅니다!',
      ],
    },
  },

  user_bot_야구팬01: {
    generic: [
      '글 잘 읽었습니다 ㅎ',
      '오 이거 모르고 있었는데 감사합니다',
      'ㅋㅋㅋ 진짜 웃기다',
      '아 이거 맞아요 진짜',
      '좋은 글이네요 공감합니다',
      '오늘도 좋은 하루 되세요!',
      '이건 좀 생각해볼 문제인 것 같아요',
      '와 몰랐네요 신기하다',
    ],
    specific: {
      'football': [
        '축구도 재밌긴 한데 경기 시간이 너무 새벽이라...',
        '프리미어리그 가끔 보는데 몰입감 있더라구요',
        '손흥민 경기는 꼭 챙겨봐요!',
      ],
      basketball: [
        '농구도 좋죠! KBL 직관도 갈 만하더라구요',
        'NBA 플레이오프 때는 야구 시즌이라 바쁜데 ㅋㅋ',
        '농구 선수들 체격이 진짜 어마어마하네요',
      ],
      'free-board': [
        '맞아요 ㅋㅋ 일상이 다 비슷비슷',
        '오 이거 좋은 팁이다 감사합니다',
        '저도 같은 고민이에요 ㅠㅠ',
      ],
      game: [
        '게임은 요즘 안 하는데 보는 건 재밌어요',
        '롤드컵은 꼭 봅니다 ㅋㅋ',
        'e스포츠 관전 재미도 있죠',
      ],
    },
  },

  user_bot_자유01: {
    generic: [
      '완전 공감이에요!!',
      'ㅋㅋㅋㅋ 이거 웃기다',
      '아 저도 그 경험 있어요~',
      '오 대박 좋은 정보!',
      '이건 저장이다 저장',
      '힘내세요 응원합니다!',
      '아하 그렇구나~ 새롭게 알았어요',
      '이거 진짜 맞는 말이에요',
    ],
    specific: {
      'football': [
        '축구는 잘 모르지만 손흥민은 알아요!',
        '프리미어리그 하이라이트만 가끔 보는데 재밌더라구요',
        '새벽에 축구 보시는 분들 체력이 대단한 것 같아요 ㅎㅎ',
      ],
      baseball: [
        '야구장 분위기 좋긴 해요! 치맥하면서 보는 재미',
        '치어리더 응원이 신나서 좋아요~',
        '올해 직관 한번 가보고 싶다',
      ],
      basketball: [
        'NBA 하이라이트는 가끔 보는데 덩크가 진짜 멋져요',
        '농구 선수들 키가 진짜 크더라구요 ㄷㄷ',
        '르브론은 나이가 몇인데 아직도 뛴다니 대단',
      ],
      game: [
        '게임은 힐링이죠~ 저도 가끔 해요',
        '롤 보는 건 재미있는데 하는 건 못하겠어요 ㅋㅋ',
        '스팀 세일 때 충동구매 주의해야 해요!',
      ],
    },
  },

  user_bot_농구팬01: {
    generic: [
      '오 좋은 글이네요!',
      '이거 맞는 말임 ㅋㅋ',
      '공감합니다 완전',
      '몰랐던 내용이네 감사합니다',
      '재밌게 읽었습니다 ㅎㅎ',
      '이거 진짜? 대박이다',
      'ㅋㅋㅋ 웃겨서 저장',
      '아 이거 저도 고민이었는데',
    ],
    specific: {
      'football': [
        '축구도 좋죠! 챔스 결승은 꼭 봐요',
        '음바페 레알 가서 잘 하나요? 관심은 있는데 잘 안 보게 되네',
        '축구 체력은 진짜 90분이 기본이니까 대단해요',
      ],
      baseball: [
        '야구장 직관도 분위기 좋던데요!',
        '투수 구속 보면 진짜 무서울 것 같아요 ㄷㄷ',
        '야구 글러브가 생각보다 비싸더라구요',
      ],
      'free-board': [
        '자취 생활 공감이에요 ㅋㅋ',
        '저도 그거 궁금했는데 감사합니다!',
        'MBTI 논쟁 진짜 끝이 없죠 ㅋㅋ',
      ],
      game: [
        '게임도 일종의 스포츠라고 생각합니다',
        '페이커는 진짜 GOAT임 인정합니다',
        '게임 체력도 만만치 않아요 집중력이 핵심이죠',
      ],
    },
  },

  user_bot_게임러01: {
    generic: [
      '크 이거 맞아요 ㅋㅋ',
      '재밌는 글 감사합니다!',
      'ㅋㅋㅋ 대박이다 진짜',
      '이건 좀 다른 의견이지만... 나쁘지 않은 것 같아요',
      '오 몰랐네 새로운 정보!',
      '와 이것도 있었구나',
      '이거 꿀팁이네요 ㄳ',
      '공감 눌러야 하는 글',
    ],
    specific: {
      'football': [
        'FIFA 게임으로 축구를 배웠습니다 ㅋㅋ',
        'FC온라인에서 이 선수 능력치 어떤가요?',
        '축구 게임이랑 실제 축구가 생각보다 다르더라구요',
      ],
      baseball: [
        'MLB The Show 하면서 야구 룰 다 외웠어요 ㅋㅋ',
        '야구 게임도 꽤 재밌는데 추천합니다!',
        '야구 직관은 분위기가 게임과는 또 다르죠',
      ],
      basketball: [
        'NBA 2K에서 마이커리어 하는 중인데 재밌어요',
        '농구 게임에서 요키치 쓰면 사기 캐릭 ㅋㅋ',
        '실제 농구도 해보고 싶은데 체력이...',
      ],
      'free-board': [
        '아 맞아요 공감합니다 ㅋㅋ',
        '저도 자취하는데 게임이 유일한 취미에요',
        '주말에 혼자 할 거 = 게임 답 나왔잖아요 ㅋㅋ',
      ],
    },
  },
}

// ============================================================
// 유틸리티 함수
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** 현재 시각에서 0~6시간 전 사이의 랜덤 타임스탬프 생성 */
function randomRecentTimestamp(baseHoursAgo: number = 0): string {
  const now = Date.now()
  const offsetMs = (baseHoursAgo + Math.random() * 2) * 60 * 60 * 1000
  return new Date(now - offsetMs).toISOString()
}

// ============================================================
// 메인 로직
// ============================================================

async function ensureBotProfiles(): Promise<void> {
  console.log('\n=== 봇 프로필 생성 ===')

  for (const bot of BOTS) {
    // upsert: 이미 있으면 skip
    const { data: existing } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', bot.user_id)
      .single()

    if (existing) {
      console.log(`  [스킵] ${bot.nickname} (${bot.user_id}) - 이미 존재`)
      continue
    }

    const { error } = await supabase.from('profiles').insert({
      user_id: bot.user_id,
      nickname: bot.nickname,
      avatar_url: bot.avatar_url,
      temperature: 36.5,
    })

    if (error) {
      console.error(`  [에러] ${bot.nickname} 프로필 생성 실패:`, error.message)
    } else {
      console.log(`  [생성] ${bot.nickname} (${bot.user_id})`)
    }

    await sleep(200)
  }
}

interface InsertedPost {
  id: string
  user_id: string
  community_slug: string
  title: string
}

async function insertPosts(): Promise<InsertedPost[]> {
  console.log('\n=== 게시글 작성 ===')
  const insertedPosts: InsertedPost[] = []
  let postIndex = 0

  for (const bot of BOTS) {
    const posts = POSTS_BY_BOT[bot.user_id]
    if (!posts) continue

    console.log(`\n  [${bot.nickname}] → ${bot.community_slug}`)

    for (const post of posts) {
      postIndex++
      // 시간을 분산 (게시글마다 0~6시간 전 사이 랜덤)
      const createdAt = randomRecentTimestamp(postIndex * 0.5)

      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: bot.user_id,
          community_slug: bot.community_slug,
          title: post.title,
          content: post.content,
          vote_count: 0,
          comment_count: 0,
          view_count: randomInt(10, 200),
          created_at: createdAt,
        })
        .select('id, user_id, community_slug, title')
        .single()

      if (error) {
        console.error(`    [에러] "${post.title.slice(0, 30)}..." 작성 실패:`, error.message)
        continue
      }

      if (data) {
        insertedPosts.push(data)
        console.log(`    [${postIndex}/50] "${post.title.slice(0, 40)}..."`)
      }

      // 자연스러운 딜레이 (300ms ~ 1.5s)
      await sleep(randomInt(300, 1500))
    }
  }

  console.log(`\n  총 ${insertedPosts.length}개 게시글 작성 완료`)
  return insertedPosts
}

interface InsertedComment {
  id: string
  post_id: string
  user_id: string
}

async function insertComments(posts: InsertedPost[]): Promise<InsertedComment[]> {
  console.log('\n=== 댓글 작성 ===')
  const insertedComments: InsertedComment[] = []
  let commentCount = 0

  for (const post of posts) {
    // 각 게시글에 2~4개의 댓글
    const numComments = randomInt(2, 4)
    // 댓글 작성자: 게시글 작성자가 아닌 다른 봇들
    const otherBots = BOTS.filter((b) => b.user_id !== post.user_id)
    const commenters = shuffleArray(otherBots).slice(0, numComments)

    for (const commenter of commenters) {
      // 해당 봇의 댓글 풀에서 선택
      const pool = COMMENT_POOLS[commenter.user_id]
      if (!pool) continue

      // 특화 댓글이 있으면 특화 댓글에서 우선 선택 (50% 확률), 없으면 범용
      let comment: string
      const specificComments = pool.specific[post.community_slug]
      if (specificComments && specificComments.length > 0 && Math.random() < 0.5) {
        comment = randomChoice(specificComments)
      } else {
        comment = randomChoice(pool.generic)
      }

      // 댓글 시간: 게시글보다 1분~2시간 후
      const postTime = new Date().getTime() // 대략적
      const commentOffsetMs = randomInt(60, 7200) * 1000
      const commentCreatedAt = new Date(postTime - randomInt(0, 3) * 60 * 60 * 1000 + commentOffsetMs).toISOString()

      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: post.id,
          user_id: commenter.user_id,
          content: comment,
          vote_count: 0,
          created_at: commentCreatedAt,
        })
        .select('id, post_id, user_id')
        .single()

      if (error) {
        console.error(`    [에러] 댓글 작성 실패 (${commenter.nickname}):`, error.message)
        continue
      }

      if (data) {
        insertedComments.push(data)
        commentCount++
      }

      await sleep(randomInt(100, 500))
    }

    if (commentCount % 20 === 0) {
      console.log(`  진행 중... ${commentCount}개 댓글 작성됨`)
    }
  }

  console.log(`  총 ${commentCount}개 댓글 작성 완료`)
  return insertedComments
}

async function insertPostVotes(posts: InsertedPost[]): Promise<void> {
  console.log('\n=== 게시글 추천 ===')
  let voteCount = 0

  for (const post of posts) {
    // 각 게시글에 3~5개의 추천
    const numVotes = randomInt(3, 5)
    const otherBots = BOTS.filter((b) => b.user_id !== post.user_id)
    const voters = shuffleArray(otherBots).slice(0, numVotes)

    for (const voter of voters) {
      const { error } = await supabase.from('post_votes').insert({
        post_id: post.id,
        user_id: voter.user_id,
        vote_type: 'up',
      })

      if (error) {
        // 중복 투표 등 무시
        if (error.code !== '23505') {
          console.error(`    [에러] 투표 실패:`, error.message)
        }
        continue
      }

      voteCount++
      await sleep(randomInt(50, 200))
    }
  }

  console.log(`  총 ${voteCount}개 추천 완료`)
}

async function insertCommentVotes(comments: InsertedComment[]): Promise<void> {
  console.log('\n=== 댓글 추천 ===')
  let voteCount = 0

  for (const comment of comments) {
    // 일부 댓글만 추천 (60% 확률)
    if (Math.random() > 0.6) continue

    const numVotes = randomInt(1, 3)
    const otherBots = BOTS.filter((b) => b.user_id !== comment.user_id)
    const voters = shuffleArray(otherBots).slice(0, numVotes)

    for (const voter of voters) {
      const { error } = await supabase.from('comment_votes').insert({
        comment_id: comment.id,
        user_id: voter.user_id,
        vote_type: 'up',
      })

      if (error) {
        // comment_votes 테이블이 없을 수도 있음 - 에러 무시
        if (error.code !== '23505' && error.code !== '42P01') {
          // 첫 에러만 로그
          if (voteCount === 0 && error.code === '42P01') {
            console.log('  [알림] comment_votes 테이블이 없어서 댓글 추천은 건너뜁니다.')
            return
          }
        }
        continue
      }

      voteCount++
      await sleep(randomInt(30, 100))
    }
  }

  console.log(`  총 ${voteCount}개 댓글 추천 완료`)
}

async function updatePostCounts(posts: InsertedPost[]): Promise<void> {
  console.log('\n=== 게시글 카운트 업데이트 ===')

  for (const post of posts) {
    // vote_count 계산: up - down
    const { count: upCount } = await supabase
      .from('post_votes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .eq('vote_type', 'up')

    const { count: downCount } = await supabase
      .from('post_votes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .eq('vote_type', 'down')

    const voteCount = (upCount || 0) - (downCount || 0)

    // comment_count 계산
    const { count: commentCount } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .is('deleted_at', null)

    // 업데이트
    const { error } = await supabase
      .from('posts')
      .update({
        vote_count: voteCount,
        comment_count: commentCount || 0,
      })
      .eq('id', post.id)

    if (error) {
      console.error(`    [에러] 카운트 업데이트 실패 (${post.id}):`, error.message)
    }

    await sleep(50)
  }

  console.log(`  ${posts.length}개 게시글 카운트 업데이트 완료`)
}

async function updateCommentVoteCounts(comments: InsertedComment[]): Promise<void> {
  console.log('\n=== 댓글 투표 카운트 업데이트 ===')

  let updated = 0
  for (const comment of comments) {
    const { count: upCount } = await supabase
      .from('comment_votes')
      .select('id', { count: 'exact', head: true })
      .eq('comment_id', comment.id)
      .eq('vote_type', 'up')

    const { count: downCount } = await supabase
      .from('comment_votes')
      .select('id', { count: 'exact', head: true })
      .eq('comment_id', comment.id)
      .eq('vote_type', 'down')

    // comment_votes 테이블이 없으면 카운트 0이 됨
    if (upCount === null && downCount === null) {
      // 테이블 접근 불가 - 건너뜀
      if (updated === 0) {
        console.log('  [알림] comment_votes 접근 불가 - 건너뜁니다.')
        return
      }
      continue
    }

    const voteCount = (upCount || 0) - (downCount || 0)
    if (voteCount > 0) {
      await supabase.from('comments').update({ vote_count: voteCount }).eq('id', comment.id)
      updated++
    }

    await sleep(30)
  }

  console.log(`  ${updated}개 댓글 카운트 업데이트 완료`)
}

// ============================================================
// 메인 실행
// ============================================================

async function main() {
  console.log('========================================')
  console.log('  봇 시드 스크립트 시작')
  console.log(`  Supabase: ${SUPABASE_URL}`)
  console.log(`  봇 수: ${BOTS.length}`)
  console.log(`  게시글: 봇당 10개 = 총 50개`)
  console.log('========================================')

  const startTime = Date.now()

  try {
    // 1. 봇 프로필 생성
    await ensureBotProfiles()

    // 2. 게시글 작성
    const posts = await insertPosts()

    if (posts.length === 0) {
      console.log('\n게시글이 하나도 작성되지 않았습니다. 종료합니다.')
      return
    }

    // 3. 댓글 작성
    const comments = await insertComments(posts)

    // 4. 게시글 추천
    await insertPostVotes(posts)

    // 5. 댓글 추천
    await insertCommentVotes(comments)

    // 6. 게시글 카운트 업데이트 (vote_count, comment_count)
    await updatePostCounts(posts)

    // 7. 댓글 투표 카운트 업데이트
    await updateCommentVoteCounts(comments)

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('\n========================================')
    console.log('  시드 스크립트 완료!')
    console.log(`  게시글: ${posts.length}개`)
    console.log(`  댓글: ${comments.length}개`)
    console.log(`  소요 시간: ${elapsed}초`)
    console.log('========================================')
  } catch (error) {
    console.error('\n[치명적 에러]', error)
    process.exit(1)
  }
}

main()
