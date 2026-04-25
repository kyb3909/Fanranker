/**
 * 픽셀아트용 깔끔한 테두리 — scale-up 단일 outline.
 *
 * 4방향 sprite 복제 트릭은 캐릭터 내부 투명 영역(다리 사이·팔 옆)에 검정이 채워지는
 * 부작용이 있어 픽셀아트의 색이 가려짐. Scale-up 방식은:
 *  - 같은 sprite 1벌만 추가
 *  - source.scale × OUTLINE_SCALE (8% 확대) 로 키움
 *  - setTint(0x000000) + setTintMode(FILL) 로 픽셀 완전 검정
 *  - source.depth - 1 (캐릭터 뒤)
 *
 * 결과: 원본 가장자리 너머로 protrusion 만 보이고, 내부 투명 영역은 outline 도
 * 그대로 투명 (확대된 outline 의 source 매핑은 source 와 동일한 alpha 패턴).
 *
 * 사용:
 *   const outline = createSpriteOutline(scene, sourceSprite)
 *   // 매 update 에서:
 *   outline.sync()
 *   // 정리:
 *   outline.destroy()
 */

import * as Phaser from "phaser"

/** outline 두께 — sprite 확대 비율. 1.08 = 8% 확대 = 캐릭터 폭의 약 4% 가 protrusion 으로 보임. */
const OUTLINE_SCALE = 1.08

export interface SpriteOutline {
  /** 원본 sprite 의 현재 텍스처/프레임/위치/scale/flip 을 outline 카피에 동기화. 매 update 호출. */
  sync(): void
  /** outline sprite 정리 */
  destroy(): void
}

export function createSpriteOutline(
  scene: Phaser.Scene,
  source: Phaser.GameObjects.Sprite,
  color: number = 0x000000
): SpriteOutline {
  const outline = scene.add.sprite(source.x, source.y, source.texture.key)
  outline.setScale(source.scaleX * OUTLINE_SCALE, source.scaleY * OUTLINE_SCALE)
  // 픽셀 색을 완전히 검정으로 대체. Phaser 4 에서 setTintFill 은 deprecated.
  outline.setTint(color).setTintMode(Phaser.TintModes.FILL)
  outline.setDepth(source.depth - 1)
  outline.setOrigin(source.originX, source.originY)

  return {
    sync() {
      // 텍스처/프레임 sync — 애니 진행 따라 매 프레임 갱신
      if (outline.texture.key !== source.texture.key || outline.frame.name !== source.frame.name) {
        outline.setTexture(source.texture.key, source.frame.name)
      }
      outline.setPosition(source.x, source.y)
      outline.setScale(source.scaleX * OUTLINE_SCALE, source.scaleY * OUTLINE_SCALE)
      outline.setFlipX(source.flipX)
      outline.setVisible(source.visible)
    },
    destroy() {
      outline.destroy()
    },
  }
}
