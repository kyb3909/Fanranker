# 게시물 온도(Temperature) 공식

게시물의 "인기"를 나타내는 온도는 **기본 점수**에 **시간에 따른 감쇠(반감기)**를 적용해 계산합니다.

---

## 1. 기본 점수 (base score)

```
base = (vote_count × 2 + comment_count × 3) / 10
```

- `vote_count`: 추천 수
- `comment_count`: 댓글 수
- 추천·댓글 비율: 2 : 3

---

## 2. 반감기 감쇠 (half-life decay)

시간이 지나면 점수가 서서히 떨어지도록 **반감기**를 적용합니다.

```
age_hours = (현재 시각 - created_at) / 3600   (시간 단위)
decay     = 0.5^(age_hours / HALF_LIFE_HOURS)
temperature = base × decay
```

- **반감기 (`HALF_LIFE_HOURS`)**: **24시간** (기본값)
- 24시간이 지나면 점수가 **절반**으로 줄어듦
- 48시간 후에는 1/4, 72시간 후에는 1/8 …

---

## 3. 최종 온도

```
temperature = min(100, max(0, round(base × decay, 1)))
```

- 0 ~ 100 범위로 제한
- 소수 첫째자리까지 표시

---

## 4. 구현 위치

- **계산**: `lib/temperature.ts` → `computeTemperature(post, now?)`
- **사용**: API `GET /api/posts` (온도순 정렬), 게시물 상세, 커뮤니티 피드 등

---

## 5. 예시

| 추천 | 댓글 | base | 경과 0h | 24h | 48h | 72h |
|------|------|------|---------|-----|-----|-----|
| 50   | 20   | 16   | 16.0    | 8.0 | 4.0 | 2.0 |
| 100  | 50   | 35   | 35.0    | 17.5| 8.75| 4.4 |

반감기를 바꾸려면 `lib/temperature.ts`의 `HALF_LIFE_HOURS` 값을 수정하면 됩니다.
