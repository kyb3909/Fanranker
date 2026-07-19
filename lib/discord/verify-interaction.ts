/**
 * 디스코드 인터랙션 서명 검증 (Ed25519).
 * 디스코드는 버튼 클릭을 우리 엔드포인트로 POST 하며, 앱 Public Key 로
 * 서명(x-signature-ed25519, x-signature-timestamp)을 검증해야 한다.
 * 외부 의존성 없이 node:crypto 로 raw 32바이트 키를 SPKI 로 감싸 검증.
 */
import crypto from "node:crypto"

// Ed25519 SPKI DER 접두사 (raw 32바이트 공개키 앞에 붙이면 KeyObject 생성 가능)
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")

export function verifyDiscordSignature(params: {
  rawBody: string
  signature: string | null
  timestamp: string | null
  hexPublicKey: string
}): boolean {
  const { rawBody, signature, timestamp, hexPublicKey } = params
  if (!signature || !timestamp || !hexPublicKey) return false
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(hexPublicKey, "hex")]),
      format: "der",
      type: "spki",
    })
    return crypto.verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, "hex"))
  } catch {
    return false
  }
}
