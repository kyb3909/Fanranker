# 풋볼 메이저 아르카나 — 타로 카드 덱

`/tarot`(루나의 축구 점집)에서 쓰는 메이저 아르카나 22장 카드 이미지 덱.

> 축구의 전설적인 선수와 감독, 역사적인 장면과 밈을 메이저 아르카나 22장으로 재해석한
> 황금 필사본풍 타로 덱입니다. 그림은 축구 테마로 바뀌지만 카드의 기본 의미와
> 정·역방향 해석은 전통적인 메이저 아르카나 체계를 따릅니다.

## 원본과 배포본

- **원본 (locked masters)**: `D:\Projects\tarot\football_deck\final\*.png` — 1024×1536 PNG 22장, 총 ~74.7MB.
  잠금 정책상 수정·덮어쓰기 금지, 무결성은 같은 폴더의 `SHA256SUMS.txt`로 검증
  (⚠️ CRLF 파일이라 `tr -d '\r'` 후 `sha256sum -c`). 용량 때문에 저장소에는 넣지 않는다.
- **배포본**: `public/tarot/cards/{0..21}.webp` — 512×768 (2:3), sharp `quality: 82`.
  `app/api/tarot/reading/route.ts`가 `/tarot/cards/${arcanaNumber}.webp`로 참조.

## 매핑 규칙

- 원본 파일명 앞의 `00`~`21` 숫자가 arcana 번호 0~21과 정확히 대응한다.
  **번호 기준으로만 연결하고 알파벳순에 의존하지 말 것.**
- 카드 번호와 영문 제목이 이미지 안에 이미 그려져 있다 — 별도 제목 오버레이 불필요.
- 카드 의미·정/역방향 해석(`lib/tarot/cards.ts`)과 리딩 로직은 덱과 무관하게 불변.
  덱은 그림만 바꾼다.

## 재생성

원본이 갱신되면 sharp로 다시 변환한다 (매핑 검증 + 1024×1536 검증 포함):

```js
// scripts 없이 1회성 — 파일명 NN_ 프리픽스를 arcana 번호로 파싱해
// sharp().resize(512, 768).webp({ quality: 82 }) 로 public/tarot/cards/{n}.webp 출력
```

## 카드별 축구 인물 매핑

| No. | 카드 | 캐스팅 |
|---:|---|---|
| 00 | THE FOOL | 호나우지뉴 |
| 01 | THE MAGICIAN | 펩 과르디올라 |
| 02 | THE HIGH PRIESTESS | 샤키라 |
| 03 | THE EMPRESS | 프렝키 더 용 (여성화) |
| 04 | THE EMPEROR | 리오넬 메시 |
| 05 | THE HIEROPHANT | 알렉스 퍼거슨 경 |
| 06 | THE LOVERS | 지네딘 지단 & 마르코 마테라치 |
| 07 | THE CHARIOT | 킬리안 음바페 |
| 08 | STRENGTH | 즐라탄 이브라히모비치 |
| 09 | THE HERMIT | 아르센 벵거 |
| 10 | WHEEL OF FORTUNE | 안토니 |
| 11 | JUSTICE | 디디에 드록바 |
| 12 | THE HANGED MAN | 웨인 루니 |
| 13 | DEATH | 찰리 애덤 |
| 14 | TEMPERANCE | 엘링 홀란 |
| 15 | THE DEVIL | 잔니 인판티노 |
| 16 | THE TOWER | 말디니 · 네스타 · 스탐 · 카푸 |
| 17 | THE STAR | 조제 무리뉴 |
| 18 | THE MOON | 호나우두 나자리우 |
| 19 | THE SUN | 크리스티아누 호날두 |
| 20 | JUDGEMENT | 이을용 |
| 21 | THE WORLD | 펠레 & 디에고 마라도나 |

상세 소스 이력(v2/v3 등 선정 과정)은 원본 폴더의 `FINAL_SELECTION.md` 참조.
