# 게시물 온도(Temperature) 공식

게시물의 "인기"를 나타내는 온도는 **Engagement Score**에 **시간 감쇠**와 **신규 부스트**를 적용해 계산합니다.

---

## 1. Engagement Score (E)

```
E = w_up × ln(1 + vote_count) + w_comment × ln(1 + comment_count) + w_view × ln(1 + view_count_unique)
```

| 가중치 | 값 | 설명 |
|--------|-----|------|
| `w_up` | 10 | 추천 1개의 영향력 |
| `w_comment` | 7 | 댓글 1개의 영향력 |
| `w_view` | 0.5 | 조회 1개의 영향력 |

`ln()` 함수로 초반에 빠르게 올라가고, 숫자가 많아지면 완만해짐.

---

## 2. Time Decay (D)

```
D = 2 ^ (-(age_hours / decay_half_life))
```

- **반감기**: **48시간** (2일)
- 48시간이 지나면 점수가 **절반**
- 96시간(4일) 후에는 1/4
- 7일 후 자연 리셋 (pg_cron)

---

## 3. New Post Boost

새 글에 초기 가시성을 부여:

| 경과 시간 | 부스트 |
|-----------|--------|
| 0~30분 | 5.0 (최대) |
| 30분~2시간 | 5.0 → 0 (선형 감소) |
| 2시간 이후 | 0 |

---

## 4. 최종 공식

```
temperature = min(100, max(0, E × D + boost))
```

---

## 5. 예시 (초창기 사이트)

| 추천 | 댓글 | 조회 | E | 0h | 24h | 48h |
|------|------|------|------|-----|-----|-----|
| 1 | 1 | 5 | 12.7 | 17.7 | 10.6 | 6.3 |
| 5 | 3 | 20 | 29.1 | 29.1 | 24.5 | 14.6 |
| 10 | 10 | 50 | 42.7 | 42.7 | 35.9 | 21.4 |
| 30 | 20 | 100 | 58.0 | 58.0 | 48.7 | 29.0 |
| 100 | 50 | 500 | 76.8 | 76.8 | 64.5 | 38.4 |

---

## 6. 온도 색상 (그라데이션)

HSL 기반 연속 그라데이션: 파란색(0°) → 빨간색(100°)

```
hue = 220 - (temp / 100) × 220
saturation = 70% + (temp / 100) × 15%
lightness = 50% - (temp / 100) × 5%
color = hsl(hue, saturation, lightness)
```

---

## 7. 구현 위치

| 위치 | 역할 |
|------|------|
| DB `scoring_config` 테이블 | 가중치 설정 (w_up, w_comment 등) |
| DB `update_temperature_score()` | 서버 계산 (트리거 → 큐 → 처리) |
| DB `process_temperature_queue()` | 큐 처리 (pg_cron 매분 실행) |
| `lib/temperature.ts` | 클라이언트 fallback 계산 + 색상 유틸 |
| 3개 컴포넌트 | `getTemperatureStyle()` 사용 |

---

## 8. 큐 처리 흐름

```
댓글 INSERT → trigger_on_comment_for_temp → enqueue_temperature_update
추천 INSERT → sync_post_vote_count → enqueue_temperature_update
                                          ↓
                              temperature_update_queue
                                          ↓
                         pg_cron (매분) → process_temperature_queue(50)
                                          ↓
                              update_temperature_score(post_id)
```
