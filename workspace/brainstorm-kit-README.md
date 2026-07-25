# gongnori 리텐션 브레인스토밍 (Claude Code 멀티에이전트)

이벤트 후 리텐션 실패를 진단하고 차별화 피처를 도출하는 가성비 최적화 토론 시스템.

## 설치
이 폴더의 `.claude/`와 `workspace/`를 **gongnori 프로젝트 루트에 복사**하세요.
(이미 `.claude/`가 있으면 `agents/`와 `commands/` 안의 파일만 합치면 됩니다.)

```
gongnori/
  .claude/
    agents/     ← researcher, visionary, contrarian, realist, synthesizer
    commands/   ← gongnori-brainstorm
  workspace/    ← brief.md (직접 채우기) + 결과물 저장 위치
```

## 사용법
1. **`workspace/brief.md`를 채우세요.** 특히 [이벤트 & 이탈 정황] 섹션. 이게 제일 중요합니다.
2. Claude Code에서 실행:
   ```
   /gongnori-brainstorm
   ```
3. 결과는 `workspace/RESULT.md`에 저장되고 대화에도 표시됩니다.

## 가성비 설계 (왜 싼가)
- **모델 티어링**: 리서치=Haiku, 토론=Sonnet, 종합만=Opus
- **총 5회 호출**: 리서치 1 + 병렬 진단 3 + 종합 1
- **파일 기반 상태 공유**: 에이전트끼리 대화로 긴 내용을 주고받지 않음 (디스크 경유)
- **컨텍스트 격리**: 서브에이전트라 각자 독립 컨텍스트. 원문·장황한 사고가 메인 대화로 안 샘
- **독립 병렬**: 3인이 서로 안 읽음 → 컨텍스트 제곱 폭발 방지

## 3인 페르소나
- **Visionary** (낙관): 이벤트는 성공의 씨앗, 증폭할 훅을 찾자
- **Contrarian** (비관): 잘못된 유저를 데려온 것, 피처 추가는 밑빠진 독
- **Realist** (현실): 데이터가 뭐라 말하나 + gongnori 스택으로 뭐가 가능한가

세 관점의 **대립**에서 인사이트가 나오도록 설계됨. 평균 내지 않음.

## 재사용
다음 안건에도 쓰려면 `brief.md`만 새로 채우고 다시 `/gongnori-brainstorm` 실행.
페르소나를 바꾸고 싶으면 `.claude/agents/`의 해당 파일만 수정.
