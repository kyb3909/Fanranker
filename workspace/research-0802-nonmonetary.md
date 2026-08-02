# 비화폐 리텐션 패턴 리서치 (2026-08-02)

## 개요
gongnori 온보딩 이벤트에서 경품 예산 축소(195~205만원)를 위한 비화폐 보상 설계.
핵심 가설: **큰 경품(유입) + 작은 데일리 추첨(재방문)** 조합의 유효성 검증.

---

## 패턴 목록

### 1. **한정 뱃지/호칭의 희소성 효과**
- **메커니즘**: 시간 또는 수량 제한으로 획득 불가능한 상태를 만들어 심리적 가치 증대 (FOMO + scarcity bias)
- **증거/사례**: 
  - Stack Overflow 뱃지 도입 후 사용자 기여 행동 변화 측정 성공 (Ashton Anderson et al.)
  - 44% 참여자가 월별 스트릭 6개월 이상 유지 (배지 보유 그룹) [https://blog.jericommerce.com/resources/loyalty-program-card-ideas-retention]
  - 뱃지 도입 시 점수만 제공하는 경우대비 의류 구매 13% 증가, 친구추가 116% 증가 (Duolingo 내부 데이터) [https://learningloop.io/plays/psychology/rewards]
- **우리 적용**: "창단 멤버(#1~#N)" 호칭을 일회성 이벤트로 제한 → 이벤트 종료 후 신규가입자는 영원히 획득 불가 → 초기 커뮤니티에 영구적 지위 제공. 보상금 0원.

---

### 2. **영구 기록(Hall of Fame/Leaderboard)의 장기 동기 유지**
- **메커니즘**: 순위나 이름이 영구히 남으면 손실 혐오감 + 유산(legacy) 심리로 재방문 동기 형성. 시간이 지날수록 "기록 지키기" 비용이 높아짐.
- **증거/사례**:
  - 영구 명예의 전당(hall of fame)은 "평생 업적" 기념 → 일시적 리더보드와 달리 거래 불가능한 지위 제공 [https://halloffamewall.com/blog/hall-of-fame-comprehensive-guide/]
  - 주기적(weekly) 리더보드는 신규 유저도 경쟁 가능하지만, 영구 리더보드는 초기 파워유저가 top 20을 고착화 → 신규는 2개월 내 참여 포기 [https://trophy.so/blog/how-to-build-a-leaderboards-feature]
  - GitHub 기여도 그래프는 만료되지 않는 영구 기록 → 네트워크 효과: 기록이 많을수록 이탈 비용 ↑ [https://thedecisionlab.com/biases/overjustification-effect]
  - Strava: 14억 Kudos/년(20% 증가) → 사회적 검증의 누적이 탈출 방지 [https://trophy.so/blog/strava-gamification-case-study]
- **우리 적용**: 예측 성적 상위 1% 영구 기록 + "월별 TOP 10" 이중 구조. 영구 기록에 이름 남으면 재방문율 상승 (손실 혐오). 월별은 리셋되므로 재참여 기회 제공.

---

### 3. **변동 비율 보상(Variable Ratio)의 습관 형성**
- **메커니즘**: 예측 불가능한 시점의 소액 보상(일일 추첨)이 고정 보상보다 강한 반복 행동 유발. 심리학의 "슬롯머신 효과" = 다음 번엔 당첨될 수도 모른다는 기대감.
- **증거/사례**:
  - 변동 비율(VR) 강화 일정이 고정 비율(FR)보다 강력한 자극 생성 [https://www.digia.tech/post/gamification-mobile-apps-streaks-rewards-retention/]
  - 일일 로그인 리워드 에스컬레이션(연속 보상↑)은 스트릭 상실 공포로 재방문 유도. Duolingo: 14일 이상 리텐션 +14% (streak wager) [https://darewell.co/en/duolingo-streaks-retention-secret/]
  - 스핀-투-휠·스크래치 카드는 VR 스케줄 → 각 시도마다 "최대상 가능성" 느낌 = 강한 반복 몰입 [https://www.appcues.com/blog/variable-rewards]
  - F2P 게임: 일일 변동 보상이 일괄 환영 보너스(고정)보다 Day-30 리텐션 향상 [https://www.xtremepush.com/blog/f2p-games-vs-welcome-bonuses-igaming]
- **우리 적용**: 큰 경품(예산 集中)은 분산시켜 주/월별 추첨 → 매번 "혹시 내 차례?"라는 기대감 유지. 소액이라도 빈도 높으면 습관화 가능.

---

### 4. **과잉정당화 효과(Overjustification) — 보상 종료 후 급락**
- **메커니즘**: 외적 보상(경품·점수)이 갑자기 중단되면 내적 동기가 훼손된 상태에서 행동이 급락. "왜 보상도 없는데 하나?"라는 심리 전환.
- **증거/사례**:
  - Edward Deci & Mark Lepper 연구: 이미 즐기던 활동에 외적 보상 추가 → 내적 동기 감소. 보상 중단 후 미참여율 ↑ [https://study.com/learn/lesson/overjustification-effect-motivation-examples.html]
  - 보상 기반 게이미피케이션 종료 시 engagement 급격히 감소 → "보상이 끝났으니 게임도 끝났다" 심리 [https://www.ama.org/2026/05/15/when-gamification-pays-off-and-when-it-doesnt-driving-engagement-without-losing-value/]
  - 뱃지/점수 제거 후 참여율이 "시작 전보다 더 낮아지는" 보상 철수 효과 [https://www.ama.org/2026/05/15/when-gamification-pays-off-and-when-it-doesnt-driving-engagement-without-losing-value/]
  - Meta-analysis: 유형적 예상 보상(tangible expected rewards)은 내재적 동기를 신뢰성 있게 감소 [https://www.structural-learning.com/post/overjustification-effect]
- **우리 적용**: 위험 신호. 큰 경품만으로 유입 후 이벤트 종료 → 참여 0이 될 수 있음. **회피법**: (1) 초기 유입자에게 영구 호칭 부여 (보상 종료 후에도 가치 유지), (2) 내적 동기 추가 (커뮤니티 정체성, 팬덤 소속감).

---

### 5. **정체성 기반 게이미피케이션(Identity-Based) vs 보상 기반**
- **메커니즘**: "뱃지 수집가"(보상 추구)보다 "나는 활동적인 팬"(정체성 추구)이 더 오래 지속. 자기개념일관성이 손실혐오감보다 강력.
- **증거/사례**:
  - 의미 있는 게이미피케이션(mastery, autonomy, relatedness) vs 보상 중심 = 전자가 내재 동기 유지 [https://www.edume.com/blog/gamification-effectiveness]
  - Duolingo: "나는 스트릭 유지자다"는 정체성이 보상 자체보다 10m user × 365일 retention 동인 [https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-goals/]
  - 창단 멤버는 "초기 신앙자"라는 정체성 → 경품 종료 후에도 커뮤니티 일부로 남음
  - 장기 변화: 초기 외적 보상(큰 경품)에서 시작 → 중기 내적 전환(정체성·소속감) → 후기 자기강화(지위 유지욕) [https://macrobiangames.com/blog/game-based-motivation-psychology-learning-engagement/]
- **우리 적용**: 경품을 "창단 멤버 확정 기준"으로 프레임 → "입장료" 아닌 "등록증". 예측 3회 참여 = 멤버 정식 인증 → 호칭은 영구.

---

### 6. **스트릭(연속)의 손실혐오 심리**
- **메커니즘**: "0으로 떨어짐"의 심리적 고통이 "다시 1로 올림"의 즐거움보다 크다 (손실혐오감 = 이득의 2.5배). 연속 기록은 중단되면 재시작 비용이 매우 높음.
- **증거/사례**:
  - 10m Duolingo users: 365일 스트릭 유지 (20% 사용층). Streak freeze 사용 시 장기 리텐션 +10% [https://gitnux.org/duolingo-user-statistics/]
  - 스트릭 시작(Day 1~7)이 가장 중요 → 7일 이상 달성 시 Day-30 retain rate +14% [https://www.trypropel.ai/resources/blogs/duolingo-customer-retention-strategy/]
  - "어제 했으니 오늘도 해야 한다" 심리 = 매일 지급이 아닌 연속 기록 보호의 강력한 동기
- **우리 적용**: 예측 3회(분산된 날짜)가 아니라 "주 1회 최소" 연속 참여 조건 → 1주 미참여 = 리셋 → 손실혐오감으로 복귀율 ↑.

---

### 7. **팬덤 커뮤니티의 호칭·지위 효과**
- **증거/사례**:
  - 생생한 팬 로열티 스펙트럼: 캐주얼(낮은 참여) → 활동적(정기 참여) → 커뮤니티 통합 → 장기 옹호자(입소문) [https://www.fanofthematchgame.com/article/fan-retention-strategies]
  - 지위 기반 충성도 프로그램(tiered): 달성 가능성 + 독점성 균형 → 참여 ↑ 지출 ↑ [https://www.concentrix.com/insights/blog/loyalty-for-building-long-term-sports-fan-engagement/]
  - 커뮤니티 참여 기회 ↑ = 고객 리텐션 +67% (스포츠 팬 연구) [https://acr-journal.com/article/fan-loyalty-continuum-and-its-impact-on-consumer-commitment-in-sports--1498/]
  - 팬 감정 투자는 합리적 근거 아닌 심리적 정체성 = 호칭이 "자부심의 표현" 역할 [https://pmc.ncbi.nlm.nih.gov/articles/PMC12407401/]
- **우리 적용**: gongnori 축구팬 커뮤니티 → "아스날 창단 멤버", "리버풀 초대 서포터" 등 팀별 호칭. 한 번 얻으면 영구히 보유 = 팬 정체성의 일부. 경품 가치 0원 but 심리 가치 높음.

---

### 8. **이벤트 참여자의 체리피킹(event drop-off) 문제**
- **메커니즘**: 이벤트 참여 동기가 순수 경품인 경우, 경품 기간 종료 후 참여자의 40~50%가 즉시 이탈. "입장료"가 경품뿐이면 경품이 끝나면 플레이도 끝남.
- **증거/사례**:
  - 가상 이벤트 평균 완료율: 42% (full attendance) [https://webinarninja.com/blog/virtual-event-roi-heres-how-to-ensure-the-best-results/]
  - 이벤트 참여자 중 사후 설문 회신율이 매우 낮음 → 참여=경품만 목표였음을 시사 [https://formbricks.com/blog/post-event-survey-questions]
  - 불완전한 온보딩(가이드 부재) 서버는 첫주 리텐션 -80% vs 온보딩 완성 서버 (Discord 연구) [https://buildmydiscord.com/en/blog/discord-server-onboarding-create-perfect-new-member-experiences-in-2026]
- **우리 적용**: 위험. 경품만 강조 → 유입은 되지만 경품 종료 후 회귀율 저조. **회피**: (1) 유입 경품(큰) + 호칭(영구) 결합, (2) 예측 시스템 자체의 내적 몰입도 높이기 (피드백·커뮤니티).

---

### 9. **희소성의 디지털 인플레이션(scarcity dilution) 위험**
- **메커니즘**: "한정판" 호칭을 너무 많이 주면 한정의 의미 상실. 100명 한정 vs 500명 한정은 심리 가치가 큰 차이.
- **증거/사례**:
  - 블록체인 게임(CryptoKitties): 디지털 희소성 유지 실패 → 소유자 가치 인식 급락 [https://www.researchgate.net/publication/377601133_Towards_Retention_Analysis_in_NFT-based_Blockchain_Games]
  - 한정판 과잉 생산 = 배타성 훼손 = 원하는 사람의 심리 만족 감소 [https://www.brandingmag.com/fernando-arendar/the-science-behind-special-editions/]
  - 희소성 인지(perceived scarcity)는 FOMO 유도하지만, 실제 희소성 부재 시 신뢰도 추락 [https://www.alibaba.com/product-insights/why-are-limited-edition-collectibles-resold-for-so-much-psychology-of-scarcity.html]
- **우리 적용**: "창단 멤버" 절대 상한선 정하기 (예: 이벤트 기간 유입 기반 최대 수). 이벤트 종료 후 한 명도 추가 불가. 초기 멤버=영구적 Elite 지위 유지.

---

### 10. **주기적 리셋(weekly leaderboard) vs 영구 기록의 하이브리드**
- **메커니즘**: 영구 순위는 초기자 고착화 → 신규 낙담. 주기적 리셋은 모두 공평 but 무의미감. **하이브리드**: 월별 상위 5% + 영구 hall of fame "1회 이상 top 10 달성자".
- **증거/사례**:
  - Trophy 권장: 신규 참여자 유지 → 주간 리셋 주요 경쟁 메커니즘, 영구 순위는 hall of fame 용 [https://trophy.so/blog/how-to-build-a-leaderboards-feature]
  - Strava segments: KOM/QOM(최고 기록) + Local Legend(빈번함) → 두 경쟁 축으로 다양한 승리 가능 경로 제공 [https://trophy.so/blog/strava-gamification-case-study]
  - 우회 경로 제공 = 모든 참여자 "언젠가 이기기" 기대감 유지 [https://www.latterly.org/strava-marketing-strategy/]
- **우리 적용**: 월별 예측 실적 리더보드(리셋) + 연간 누적 hall of fame(영구) 이중 구조 → 신규도 달 초엔 0부터 시작, 연간 누적은 한 번 올라가면 내려가지 않음.

---

## 검증되지 않은 항목 (미확인)

- [ ] **최소 3회 참여 기준의 과학적 근거**: 일반적 습관형성 연구(Lally et al.)는 9회/6주 권장 [https://www.mdpi.com/2076-328X/16/4/535]. "3회"의 출처 불명확.
- [ ] **번호가 매겨진 초기 멤버십(#1~#N) 실제 사례**: 학술 연구 사례 미발견. Discord/Reddit 커뮤니티 사례는 대중적이지만 통제된 연구 부재.

---

## 요약: gongnori 개막 온보딩 이벤트 설계 제안

| 요소 | 설계 | 근거 | 예산 영향 |
|------|------|------|----------|
| **유입 경품** | 월 1회 추첨, 약 50~100만원/월 × 3개월 | 변동 비율 보상의 습관화 | 150~300만원 |
| **창단 멤버 호칭** | 이벤트 기간 유입 전원 + 예측 3회 달성 → 호칭 영구 부여 | 정체성 기반 리텐션, 과잉정당화 회피 | 0원 |
| **월별 리더보드** | 주기적 리셋, top 5 추가 소상품 | 신규도 경쟁 가능, 공평성 | 10~20만원 |
| **연간 hall of fame** | "1회 이상 top 10 달성" 영구 기록 | 손실혐오감, 지위 심리 | 0원 |
| **총 예산** | — | — | **160~320만원** (기존 195~205만원과 비슷 또는 20% 축소 가능) |

**핵심 효과**:
- 큰 경품(유입) = 변동 비율로 빈도 높임
- 호칭(리텐션) = 정체성 + 영구성으로 과잉정당화 회피
- 리더보드 하이브리드 = 신규 참여감 + 장기자 지위 보호

---

## 참고 출처

- [https://www.cs.cornell.edu/home/kleinber/www13-badges.pdf](https://www.cs.cornell.edu/home/kleinber/www13-badges.pdf) — Steering User Behavior with Badges (Cornell)
- [https://blog.jericommerce.com/resources/loyalty-program-card-ideas-retention](https://blog.jericommerce.com/resources/loyalty-program-card-ideas-retention) — 44% retention 데이터
- [https://learningloop.io/plays/psychology/rewards](https://learningloop.io/plays/psychology/rewards) — Duolingo 13%/116% 증가
- [https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/) — Duolingo Streak System
- [https://gitnux.org/duolingo-user-statistics/](https://gitnux.org/duolingo-user-statistics/) — 10m 365day streak 통계
- [https://thedecisionlab.com/biases/overjustification-effect](https://thedecisionlab.com/biases/overjustification-effect) — Overjustification Effect
- [https://www.ama.org/2026/05/15/when-gamification-pays-off-and-when-it-doesnt-driving-engagement-without-losing-value/](https://www.ama.org/2026/05/15/when-gamification-pays-off-and-when-it-doesnt-driving-engagement-without-losing-value/) — Gamification 보상 제거 효과
- [https://trophy.so/blog/how-to-build-a-leaderboards-feature](https://trophy.so/blog/how-to-build-a-leaderboards-feature) — Leaderboard 디자인 (주간 vs 영구)
- [https://trophy.so/blog/strava-gamification-case-study](https://trophy.so/blog/strava-gamification-case-study) — Strava 사례
- [https://www.digia.tech/post/gamification-mobile-apps-streaks-rewards-retention/](https://www.digia.tech/post/gamification-mobile-apps-streaks-rewards-retention/) — Variable Ratio Schedule
- [https://www.appcues.com/blog/variable-rewards](https://www.appcues.com/blog/variable-rewards) — Variable Rewards in Product Design
- [https://www.fanofthematchgame.com/article/fan-retention-strategies](https://www.fanofthematchgame.com/article/fan-retention-strategies) — Sports Fan Loyalty Continuum
- [https://www.concentrix.com/insights/blog/loyalty-for-building-long-term-sports-fan-engagement/](https://www.concentrix.com/insights/blog/loyalty-for-building-long-term-sports-fan-engagement/) — 호칭과 지위의 팬 리텐션 효과
- [https://pmc.ncbi.nlm.nih.gov/articles/PMC12407401/](https://pmc.ncbi.nlm.nih.gov/articles/PMC12407401/) — Fandom Circle Formation
- [https://webinarninja.com/blog/virtual-event-roi-heres-how-to-ensure-the-best-results/](https://webinarninja.com/blog/virtual-event-roi-heres-how-to-ensure-the-best-results/) — 42% 이벤트 완료율
- [https://buildmydiscord.com/en/blog/discord-server-onboarding-create-perfect-new-member-experiences-in-2026](https://buildmydiscord.com/en/blog/discord-server-onboarding-create-perfect-new-member-experiences-in-2026) — 온보딩 리텐션 +80%
- [https://study.com/learn/lesson/overjustification-effect-motivation-examples.html](https://study.com/learn/lesson/overjustification-effect-motivation-examples.html) — Deci & Lepper 과잉정당화
- [https://www.edume.com/blog/gamification-effectiveness](https://www.edume.com/blog/gamification-effectiveness) — Identity vs Reward-Based Gamification
- [https://www.trypropel.ai/resources/blogs/duolingo-customer-retention-strategy/](https://www.trypropel.ai/resources/blogs/duolingo-customer-retention-strategy/) — Duolingo Day-7/Day-30 data
- [https://www.latterly.org/strava-marketing-strategy/](https://www.latterly.org/strava-marketing-strategy/) — Strava Segments & KOM/QOM
- [https://acr-journal.com/article/fan-loyalty-continuum-and-its-impact-on-consumer-commitment-in-sports--1498/](https://acr-journal.com/article/fan-loyalty-continuum-and-its-impact-on-consumer-commitment-in-sports--1498/) — 67% 커뮤니티 참여 효과
- [https://www.mdpi.com/2076-328X/16/4/535](https://www.mdpi.com/2076-328X/16/4/535) — 9회/6주 습관 형성 연구
- [https://www.researchgate.net/publication/377601133_Towards_Retention_Analysis_in_NFT-based_Blockchain_Games](https://www.researchgate.net/publication/377601133_Towards_Retention_Analysis_in_NFT-based_Blockchain_Games) — 블록체인 희소성
- [https://www.brandingmag.com/fernando-arendar/the-science-behind-special-editions/](https://www.brandingmag.com/fernando-arendar/the-science-behind-special-editions/) — 한정판 심리
