// server-only 무해화 스텁 (vitest 전용).
// 실제 패키지는 클라이언트 조건에서 throw 하도록 설계돼 있어, node 환경인 vitest 가
// 서버 모듈을 import 하면 그대로 터진다. 테스트에서는 no-op 로 대체한다.
// 프로덕션 번들에는 영향 없음 — vitest.config.ts 의 alias 로만 연결된다.
export {}
