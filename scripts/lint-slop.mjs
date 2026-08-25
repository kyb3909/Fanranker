/**
 * anti-slop Oxlint 실행기 — `pnpm lint:slop`
 *
 * ## 왜 래퍼가 필요한가
 * anti-slop 플러그인은 TypeScript 소스(`tools/oxlint/anti-slop/index.ts`)다.
 * oxlint 가 이 플러그인을 로드할 때 node 를 쓰는데, Node 22 는 `.ts` 를 그냥 못 읽는다
 * (`ERR_UNKNOWN_FILE_EXTENSION`). 그래서 `--experimental-strip-types` 가 필요하다.
 * Node 23.6 부터는 기본으로 켜져 있어서 붙일 필요가 없다.
 *
 * 이걸 위해 `cross-env` 를 새로 넣지 않는다 — 의존성 하나를 아끼는 편이 낫다.
 */
import { spawnSync } from "node:child_process"

const [major, minor] = process.versions.node.split(".").map(Number)
const needsFlag = major < 23 || (major === 23 && minor < 6)

const NODE_OPTIONS = [process.env.NODE_OPTIONS, needsFlag && "--experimental-strip-types"]
  .filter(Boolean)
  .join(" ")

const result = spawnSync("oxlint", process.argv.slice(2), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_OPTIONS },
})

process.exit(result.status ?? 1)
