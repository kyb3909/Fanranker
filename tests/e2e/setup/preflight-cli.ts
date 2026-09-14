import { assertE2EPrerequisites } from "./preflight"

assertE2EPrerequisites().then(
  () => console.log("E2E 사전 점검 통과: 로컬 DB와 Clerk 개발키 설정 확인 (계정·DB 변경 없음)."),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "E2E 사전 점검 실패")
    process.exitCode = 1
  }
)
