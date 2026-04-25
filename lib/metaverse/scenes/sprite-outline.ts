/**
 * 픽셀아트용 깔끔한 1-2px 테두리 — 4방향 sprite 복제 트릭.
 *
 * Phaser 4 의 `addGlow` 필터는 픽셀아트에 사용하면 fuzzy/blurry 한 할로가 생겨
 * 지저분해 보임. 클래식 솔루션은 동일 sprite 를 +x, -x, +y, -y 로 1-2px 오프셋
 * 하여 검정 tint 로 4벌 더 그리고 그 위에 원본을 얹는 방식.
 * Stardew Valley · Celeste · Hyper Light Drifter 등에서 사용.
 *
 * 사용:
 *   const outline = createSpriteOutline(scene, sourceSprite)
 *   // 매 update 에서:
 *   outline.sync()
 *   // 정리 시:
 *   outline.destroy()
 */

import * as Phaser from "phaser"

const OUTLINE_OFFSETS: [number, number][] = [
  [-2, 0],
  [2, 0],
  [0, -2],
  [0, 2],
]

export interface SpriteOutline {
  /** 원본 sprite 의 현재 텍스처/프레임/위치/scale/flip 을 4 outline 카피에 동기화. 매 update 호출. */
  sync(): void
  /** 4 outline sprite 정리 */
  destroy(): void
}

export function createSpriteOutline(
  scene: Phaser.Scene,
  source: Phaser.GameObjects.Sprite,
  color: number = 0x000000
): SpriteOutline {
  const outlines = OUTLINE_OFFSETS.map(([dx, dy]) => {
    const o = scene.add.sprite(source.x + dx, source.y + dy, source.texture.key)
    o.setScale(source.scaleX, source.scaleY)
    // 픽셀 색을 완전히 검정으로 대체 (setTint 단독은 곱셈이라 어두워지기만 함).
    // Phaser 4 에서 setTintFill 은 deprecated → setTint + setTintMode(FILL).
    o.setTint(color).setTintMode(Phaser.TintModes.FILL)
    o.setDepth(source.depth - 1)
    o.setOrigin(source.originX, source.originY)
    return o
  })

  return {
    sync() {
      const visible = source.visible
      for (let i = 0; i < outlines.length; i++) {
        const o = outlines[i]
        const [dx, dy] = OUTLINE_OFFSETS[i]
        // 텍스처/프레임 sync — 애니메이션 진행 따라 매 프레임 갱신 필요
        if (o.texture.key !== source.texture.key || o.frame.name !== source.frame.name) {
          o.setTexture(source.texture.key, source.frame.name)
        }
        o.setPosition(source.x + dx, source.y + dy)
        o.setScale(source.scaleX, source.scaleY)
        o.setFlipX(source.flipX)
        o.setVisible(visible)
      }
    },
    destroy() {
      for (const o of outlines) o.destroy()
    },
  }
}
