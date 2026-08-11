/**
 * 메이저 아르카나 22장 표준 의미 (라이더-웨이트-스미스 전통).
 *
 * 타로 서비스(D:/Projects/tarot, src/lib/tarot/cardMeanings.ts)에서 **그대로 이식**했다.
 * 해석 프롬프트에 주입되는 근거 데이터 — 모델이 카드 의미를 창작하지 못하게 막는 것이
 * 이 데이터의 존재 이유다. 축구 각색은 프롬프트(prompt.ts)가 하고, 여기 의미는 원본을
 * 유지한다: 근거를 축구로 미리 비틀면 모델이 두 번 각색해 카드 정체성이 무너진다.
 *
 * ⚠️ 수정 시 원본과 갈라진다. 의미 자체를 고칠 일이 생기면 양쪽을 같이 고칠 것.
 * 출처: RWS 공통 해석 전통(A.E. Waite 계열). 오락 목적.
 */

export interface CardMeaning {
  /** 0..21 */
  arcana: number
  name: string
  nameKo: string
  keywordsUpright: string[]
  keywordsReversed: string[]
  meaningUpright: string
  meaningReversed: string
}

export const CARD_MEANINGS: CardMeaning[] = [
  {
    arcana: 0,
    name: "The Fool",
    nameKo: "바보",
    keywordsUpright: ["새로운 시작", "순수", "모험", "자유", "잠재력"],
    keywordsReversed: ["무모함", "경솔", "준비 부족", "위험한 도약"],
    meaningUpright: "미지를 향한 순수한 첫걸음. 계산 없이 뛰어드는 용기와 무한한 가능성을 뜻한다.",
    meaningReversed:
      "생각 없는 도약이나 준비 부족. 무모함이 위험을 부르거나, 시작을 두려워하는 상태.",
  },
  {
    arcana: 1,
    name: "The Magician",
    nameKo: "마법사",
    keywordsUpright: ["의지", "창조력", "실행력", "집중", "자원 활용"],
    keywordsReversed: ["조작", "미숙함", "잠재력 낭비", "자기기만"],
    meaningUpright:
      "가진 자원과 재능을 현실로 구현하는 힘. 명확한 의지와 집중으로 원하는 것을 만든다.",
    meaningReversed: "능력을 잘못 쓰거나 낭비함. 조작·속임수, 또는 실행으로 옮기지 못하는 미숙함.",
  },
  {
    arcana: 2,
    name: "The High Priestess",
    nameKo: "여사제",
    keywordsUpright: ["직관", "무의식", "내면의 지혜", "신비", "잠재된 지식"],
    keywordsReversed: ["단절된 직관", "억압된 감정", "표면적 지식", "비밀"],
    meaningUpright: "말로 드러나지 않은 진실과 내면의 목소리. 직관에 귀 기울이고 기다릴 때다.",
    meaningReversed: "직관을 무시하거나 감정을 억누름. 겉으로만 아는 척, 또는 숨겨진 비밀.",
  },
  {
    arcana: 3,
    name: "The Empress",
    nameKo: "여황제",
    keywordsUpright: ["풍요", "모성", "창조", "자연", "감각적 충만"],
    keywordsReversed: ["의존", "창조성 막힘", "과보호", "공허"],
    meaningUpright: "풍요와 돌봄, 무언가를 낳고 기르는 힘. 감각적 충만과 창조의 시기.",
    meaningReversed: "지나친 의존이나 과보호, 또는 창조의 에너지가 막혀 공허함을 느끼는 상태.",
  },
  {
    arcana: 4,
    name: "The Emperor",
    nameKo: "황제",
    keywordsUpright: ["권위", "구조", "안정", "통제", "질서"],
    keywordsReversed: ["독재", "경직", "통제 상실", "미성숙한 권력"],
    meaningUpright: "질서와 구조를 세우는 힘. 책임감 있는 리더십과 안정된 기반을 뜻한다.",
    meaningReversed: "경직된 통제나 독선, 또는 권위를 잃고 질서가 무너지는 상태.",
  },
  {
    arcana: 5,
    name: "The Hierophant",
    nameKo: "교황",
    keywordsUpright: ["전통", "제도", "신념", "관습", "가르침"],
    keywordsReversed: ["관습 탈피", "반항", "자유로운 신념", "형식 거부"],
    meaningUpright:
      "전통과 제도, 검증된 길을 따르는 지혜. 가르침을 받거나 관습 안에서 답을 찾는다.",
    meaningReversed: "관습에 얽매이지 않고 자기만의 길을 감. 제도에 대한 반항이나 형식주의 거부.",
  },
  {
    arcana: 6,
    name: "The Lovers",
    nameKo: "연인",
    keywordsUpright: ["사랑", "결합", "조화", "선택", "가치의 일치"],
    keywordsReversed: ["불화", "잘못된 선택", "가치 충돌", "유혹"],
    meaningUpright:
      "깊은 결합과 조화, 그리고 마음이 이끄는 중요한 선택. 가치가 하나로 맞아떨어진다.",
    meaningReversed: "관계의 불화나 가치의 충돌, 또는 후회할 선택과 유혹.",
  },
  {
    arcana: 7,
    name: "The Chariot",
    nameKo: "전차",
    keywordsUpright: ["의지", "승리", "결단", "전진", "통제"],
    keywordsReversed: ["통제 상실", "방향 상실", "좌절", "공격성"],
    meaningUpright: "강한 의지로 상반된 힘을 다스려 앞으로 나아감. 결단과 집중이 승리를 부른다.",
    meaningReversed: "방향을 잃거나 통제하지 못해 멈춤. 조급함과 공격성이 일을 그르친다.",
  },
  {
    arcana: 8,
    name: "Strength",
    nameKo: "힘",
    keywordsUpright: ["용기", "인내", "내면의 힘", "부드러운 통제", "자기 확신"],
    keywordsReversed: ["자기 의심", "약함", "감정의 폭주", "무력감"],
    meaningUpright:
      "완력이 아니라 부드러움으로 다스리는 진짜 힘. 인내와 자기 확신으로 감정을 품는다.",
    meaningReversed: "자신을 의심하거나 감정에 휘둘림. 내면의 힘이 흔들려 무력해진 상태.",
  },
  {
    arcana: 9,
    name: "The Hermit",
    nameKo: "은둔자",
    keywordsUpright: ["성찰", "고독", "내면 탐구", "지혜", "안내"],
    keywordsReversed: ["고립", "외로움", "도피", "지나친 은둔"],
    meaningUpright: "홀로 물러나 내면을 비추는 시간. 성찰 끝에 얻은 지혜가 길을 밝힌다.",
    meaningReversed: "필요 이상의 고립이나 현실 도피, 또는 외로움에 갇힌 상태.",
  },
  {
    arcana: 10,
    name: "Wheel of Fortune",
    nameKo: "운명의 수레바퀴",
    keywordsUpright: ["변화", "순환", "전환점", "운명", "행운"],
    keywordsReversed: ["불운", "저항", "통제 밖의 변화", "정체"],
    meaningUpright: "돌아가는 운명의 수레바퀴 — 전환점과 흐름의 변화. 좋은 쪽으로 국면이 바뀐다.",
    meaningReversed: "흐름이 불리하게 돌거나, 통제할 수 없는 변화에 저항하며 정체됨.",
  },
  {
    arcana: 11,
    name: "Justice",
    nameKo: "정의",
    keywordsUpright: ["공정", "진실", "인과", "책임", "균형"],
    keywordsReversed: ["불공정", "회피", "편향", "책임 회피"],
    meaningUpright: "원인과 결과, 뿌린 대로 거두는 공정함. 진실과 책임에 근거한 균형 잡힌 판단.",
    meaningReversed: "불공정한 상황이나 편향된 판단, 또는 마땅한 책임을 회피하는 태도.",
  },
  {
    arcana: 12,
    name: "The Hanged Man",
    nameKo: "행맨",
    keywordsUpright: ["멈춤", "관점 전환", "희생", "내려놓기", "기다림"],
    keywordsReversed: ["정체", "무의미한 희생", "저항", "지연"],
    meaningUpright: "잠시 멈춰 세상을 거꾸로 바라봄. 내려놓고 기다릴 때 새로운 관점이 열린다.",
    meaningReversed: "쓸모없는 희생이나 제자리걸음, 변화를 거부해 발이 묶인 상태.",
  },
  {
    arcana: 13,
    name: "Death",
    nameKo: "죽음",
    keywordsUpright: ["끝과 시작", "변형", "전환", "놓아줌", "재생"],
    keywordsReversed: ["변화 저항", "집착", "정체", "두려움"],
    meaningUpright:
      "한 장이 끝나야 다음 장이 열린다. 낡은 것을 보내고 근본적으로 다시 태어나는 전환.",
    meaningReversed: "끝내야 할 것에 매달리며 변화를 거부함. 두려움이 재생을 막는다.",
  },
  {
    arcana: 14,
    name: "Temperance",
    nameKo: "절제",
    keywordsUpright: ["균형", "조화", "절제", "중용", "인내"],
    keywordsReversed: ["불균형", "과잉", "조급함", "부조화"],
    meaningUpright: "서로 다른 것을 섞어 조화를 빚는 절제의 기술. 인내와 중용으로 균형을 이룬다.",
    meaningReversed: "균형이 무너지고 과하거나 조급함. 극단으로 치우쳐 부조화가 생긴다.",
  },
  {
    arcana: 15,
    name: "The Devil",
    nameKo: "악마",
    keywordsUpright: ["속박", "집착", "유혹", "물질주의", "그림자"],
    keywordsReversed: ["해방", "자각", "속박에서 벗어남", "회복"],
    meaningUpright: "스스로 채운 사슬 — 집착·중독·유혹에 매인 상태. 벗어날 수 있음을 잊고 있다.",
    meaningReversed: "속박을 자각하고 사슬을 끊어냄. 유혹에서 벗어나 자유를 되찾는 회복.",
  },
  {
    arcana: 16,
    name: "The Tower",
    nameKo: "타워",
    keywordsUpright: ["급변", "붕괴", "각성", "진실의 폭로", "해방"],
    keywordsReversed: ["붕괴 회피", "지연된 재난", "저항", "내적 격변"],
    meaningUpright:
      "거짓 위에 세운 것이 한순간에 무너짐. 충격적이지만 진실을 드러내는 해방이기도 하다.",
    meaningReversed: "닥쳐올 붕괴를 미루거나 애써 피함, 또는 겉으로 드러나지 않는 내적 격변.",
  },
  {
    arcana: 17,
    name: "The Star",
    nameKo: "별",
    keywordsUpright: ["희망", "영감", "치유", "평온", "신뢰"],
    keywordsReversed: ["절망", "신뢰 상실", "낙담", "단절"],
    meaningUpright: "폭풍 뒤에 뜬 별 — 조용한 희망과 치유. 자신과 미래를 다시 신뢰하게 된다.",
    meaningReversed: "희망을 잃고 낙담함. 영감이 마르고 자신에 대한 신뢰가 흔들린다.",
  },
  {
    arcana: 18,
    name: "The Moon",
    nameKo: "달",
    keywordsUpright: ["불안", "환상", "무의식", "직관", "불확실"],
    keywordsReversed: ["혼란 해소", "두려움 극복", "진실 드러남", "억압 해제"],
    meaningUpright:
      "달빛 아래 흐릿한 길 — 불안과 환상, 확실치 않은 것들. 직관에 의지해 나아가야 한다.",
    meaningReversed: "안개가 걷히고 두려움의 실체가 드러남. 혼란이 풀리며 진실이 보인다.",
  },
  {
    arcana: 19,
    name: "The Sun",
    nameKo: "태양",
    keywordsUpright: ["기쁨", "성공", "활력", "명료함", "긍정"],
    keywordsReversed: ["일시적 흐림", "지연된 성공", "과신", "낙담"],
    meaningUpright: "환한 햇빛 같은 기쁨과 성공. 모든 것이 명료하고 활력이 넘치는 최상의 카드.",
    meaningReversed: "잠시 구름이 낀 상태 — 지연된 성공이나 일시적 낙담, 또는 지나친 낙관.",
  },
  {
    arcana: 20,
    name: "Judgement",
    nameKo: "심판",
    keywordsUpright: ["각성", "부활", "소명", "결산", "용서"],
    keywordsReversed: ["자기 비판", "회피", "미련", "부름 무시"],
    meaningUpright: "지난 것을 결산하고 새 소명에 눈뜨는 각성. 과거를 용서하고 다시 일어선다.",
    meaningReversed: "지나친 자기 비판이나 미련에 붙들림. 부름을 외면하며 결산을 미룬다.",
  },
  {
    arcana: 21,
    name: "The World",
    nameKo: "세계",
    keywordsUpright: ["완성", "성취", "통합", "여정의 끝", "충만"],
    keywordsReversed: ["미완성", "지연", "마무리 부족", "정체"],
    meaningUpright: "한 여정의 완성과 성취. 모든 조각이 하나로 통합되어 충만함에 이른다.",
    meaningReversed: "거의 다 왔지만 마무리가 남음. 완성 직전의 지연이나 미완의 아쉬움.",
  },
]

/** arcana 번호(0..21)로 의미 조회. v1 은 메이저만 — 마이너 56장은 이미지·의미가 없다. */
export function getCardMeaning(arcana: number): CardMeaning {
  const m = CARD_MEANINGS[arcana]
  if (!m || m.arcana !== arcana) {
    throw new Error(`알 수 없는 아르카나 번호: ${arcana}`)
  }
  return m
}
