// Importing Babylon's package barrels makes Next compile thousands of unused
// modules. The lab only needs glTF 2.0 and these concrete runtime modules.
import "@babylonjs/loaders/glTF/2.0/glTFLoader"
// Scene.beginAnimation & friends — required for the GLB's animation groups.
import "@babylonjs/core/Animations/animatable"

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { Engine } from "@babylonjs/core/Engines/engine"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator"
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent"
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder"
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import { Scene } from "@babylonjs/core/scene"
import type { ChibiCameraView } from "./chibi-spec"
import {
  APPEARANCE_MATERIAL_SLOTS,
  EYE_COLORS,
  EYE_SHAPES,
  FACE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  type AvatarAppearance,
} from "./appearance"
import { type KitCollarStyle, type KitItem } from "./kits"

type KitTextureManifest = {
  version: 1
  atlasSize: number
  entries: Array<{
    kitKey: string
    revision: number
    url: string
    sha256: string
    width: number
    height: number
    byteSize: number
  }>
}

// Average painted skin color in the Colin body texture (sampled from flat areas).
const SKIN_TEXTURE_BASE = { r: 231 / 255, g: 192 / 255, b: 173 / 255 } as const

// Clip names baked into the GLB by scripts/avatar3d/build_colin_avatar.py.
export type AvatarMotion = "idle" | "walk" | "cheer" | "kick" | "jump"

export type ChibiAvatarLab = {
  engine: Engine
  scene: Scene
  camera: ArcRotateCamera
  avatarRoot: TransformNode
  setKit(kit: KitItem): Promise<void>
  setAppearance(appearance: AvatarAppearance): void
  setAutoRotate(enabled: boolean): void
  setView(view: ChibiCameraView): void
  setMotion(motion: AvatarMotion): void
  dispose(): void
}

function makeGroundMaterial(scene: Scene) {
  const material = new PBRMaterial("avatar_lab_ground_material", scene)
  material.albedoColor = Color3.FromHexString("#14213d")
  material.emissiveColor = Color3.FromHexString("#14213d").scale(0.04)
  material.metallic = 0
  material.roughness = 0.96
  return material
}

async function loadKitTextureManifest() {
  const response = await fetch("/metaverse/avatar3d/kits/v1/manifest.json", { cache: "no-cache" })
  if (!response.ok) throw new Error(`Kit texture manifest failed with ${response.status}`)
  return (await response.json()) as KitTextureManifest
}

export async function createChibiAvatarLab(canvas: HTMLCanvasElement): Promise<ChibiAvatarLab> {
  const engine = new Engine(canvas, true, {
    antialias: true,
    preserveDrawingBuffer: false,
    stencil: true,
  })
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.75))

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.025, 0.035, 0.07, 1)

  const target = new Vector3(0, 1.52, 0)
  const camera = new ArcRotateCamera("avatar_lab_camera", -Math.PI / 2, 1.34, 4.25, target, scene)
  camera.lowerRadiusLimit = 3.05
  camera.upperRadiusLimit = 7
  camera.lowerBetaLimit = 0.72
  camera.upperBetaLimit = 1.58
  camera.wheelPrecision = 38
  camera.pinchPrecision = 85
  camera.attachControl(canvas, true)

  const hemi = new HemisphericLight("avatar_lab_fill", new Vector3(0, 1, -0.25), scene)
  hemi.intensity = 1.2
  hemi.diffuse = new Color3(0.78, 0.86, 1)
  hemi.groundColor = new Color3(0.14, 0.16, 0.24)

  const key = new DirectionalLight("avatar_lab_key", new Vector3(-0.55, -1, 0.7), scene)
  key.position = new Vector3(3.5, 6, -4)
  key.intensity = 1.8

  const shadowGenerator = new ShadowGenerator(1024, key)
  shadowGenerator.useBlurExponentialShadowMap = true
  shadowGenerator.blurKernel = 18
  shadowGenerator.bias = 0.001

  const ground = CreateDisc("avatar_lab_ground", { radius: 2.15, tessellation: 48 }, scene)
  ground.rotation.x = Math.PI / 2
  ground.position.y = -0.015
  ground.receiveShadows = true
  ground.material = makeGroundMaterial(scene)

  const [imported, kitTextureManifest] = await Promise.all([
    SceneLoader.ImportMeshAsync("", "/metaverse/avatar3d/", "colin-avatar-v1.glb", scene),
    loadKitTextureManifest(),
  ])
  const kitTextureAssets = new Map(kitTextureManifest.entries.map((entry) => [entry.kitKey, entry]))

  const avatarRoot = new TransformNode("avatar_preview_root", scene)
  avatarRoot.rotationQuaternion = Quaternion.Identity()

  const importedRoot = imported.meshes.find((mesh) => mesh.parent === null)
  if (importedRoot) importedRoot.parent = avatarRoot

  imported.meshes.forEach((mesh) => {
    if (mesh.getTotalVertices() > 0) {
      mesh.receiveShadows = true
      shadowGenerator.addShadowCaster(mesh)
    }
  })

  const findPbrMaterial = (materialName: string) => {
    const material = scene.materials.find(
      (candidate) =>
        candidate.name === materialName || candidate.name.startsWith(`${materialName}.`)
    )
    if (!(material instanceof PBRMaterial)) {
      throw new Error(`GLB is missing required PBR material slot: ${materialName}`)
    }
    return material
  }
  const kitAtlasMaterial = findPbrMaterial("KIT_ATLAS")
  const kitBootMaterial = findPbrMaterial("KIT_BOOTS")
  const kitSoleMaterial = findPbrMaterial("KIT_SOLE")

  const appearanceMaterials = new Map<keyof typeof APPEARANCE_MATERIAL_SLOTS, PBRMaterial>()
  for (const [role, materialName] of Object.entries(APPEARANCE_MATERIAL_SLOTS) as Array<
    [keyof typeof APPEARANCE_MATERIAL_SLOTS, string]
  >) {
    const material = scene.materials.find(
      (candidate) =>
        candidate.name === materialName || candidate.name.startsWith(`${materialName}.`)
    )
    if (!(material instanceof PBRMaterial)) {
      // The Colin GLB paints some face details (blush, mouth, eye line) into the
      // body texture, so not every slot exists as a separate material.
      continue
    }
    appearanceMaterials.set(role, material)
  }

  const eyeNodes = [
    "eye_l",
    "eye_r",
    "eye_white_l",
    "eye_white_r",
    "iris_l",
    "iris_r",
    "pupil_l",
    "pupil_r",
    "eye_highlight_l",
    "eye_highlight_r",
  ]
    .map((name) => scene.getTransformNodeByName(name) ?? scene.getMeshByName(name))
    .filter((node): node is TransformNode => node instanceof TransformNode)
  const eyeBaseScales = new Map(eyeNodes.map((node) => [node, node.scaling.clone()]))
  const eyebrowNodes = [scene.getMeshByName("eyebrow_l"), scene.getMeshByName("eyebrow_r")].filter(
    (node): node is AbstractMesh => node !== null
  )
  const cheekNodes = [scene.getMeshByName("cheek_l"), scene.getMeshByName("cheek_r")].filter(
    (node): node is AbstractMesh => node !== null
  )
  const mouthNode = scene.getMeshByName("mouth_mesh")
  const eyebrowBaseRotations = new Map(eyebrowNodes.map((node) => [node, node.rotation.z]))
  const cheekBaseScales = new Map(cheekNodes.map((node) => [node, node.scaling.clone()]))
  const mouthBaseScale = mouthNode?.scaling.clone()
  const hairStyleMeshes = new Map(
    Object.keys(HAIR_STYLES).map((style) => [
      style,
      imported.meshes.filter((mesh) => mesh.name.startsWith(`hair_style_${style}_`)),
    ])
  )
  hairStyleMeshes.forEach((meshes) => meshes.forEach((mesh) => mesh.setEnabled(false)))
  const collarMeshes = new Map<KitCollarStyle, AbstractMesh[]>([
    [
      "v",
      [scene.getMeshByName("collar_left"), scene.getMeshByName("collar_right")].filter(
        (mesh): mesh is AbstractMesh => mesh !== null
      ),
    ],
    [
      "crew",
      [scene.getMeshByName("kit_collar_crew")].filter(
        (mesh): mesh is AbstractMesh => mesh !== null
      ),
    ],
    [
      "polo",
      [scene.getMeshByName("kit_collar_polo_l"), scene.getMeshByName("kit_collar_polo_r")].filter(
        (mesh): mesh is AbstractMesh => mesh !== null
      ),
    ],
  ])
  collarMeshes.forEach((meshes) => meshes.forEach((mesh) => mesh.setEnabled(false)))

  // The glTF loader auto-plays the first clip; take over playback ourselves.
  imported.animationGroups.forEach((group) => group.stop())
  // The soccer ball lives in the GLB but only makes sense during the kick
  // clip. The loader may split the two-material mesh into primitives, so match
  // by name prefix ("ball", "ball_primitive0", ...) while excluding the
  // ball_anchor bone node and the eye_ball meshes.
  const ballNodes = [...scene.meshes, ...scene.transformNodes].filter(
    (node) => node.name === "ball" || node.name.startsWith("ball_primitive")
  )
  canvas.dataset.ballNodes = String(ballNodes.length)
  function playMotion(motion: AvatarMotion) {
    imported.animationGroups.forEach((group) => group.stop())
    ballNodes.forEach((node) => node.setEnabled(motion === "kick"))
    const target = imported.animationGroups.find((group) => group.name === motion)
    if (target) {
      target.play(true)
    } else if (imported.animationGroups.length > 0) {
      console.warn(
        `GLB has no "${motion}" clip; available:`,
        imported.animationGroups.map((g) => g.name)
      )
    }
    canvas.dataset.motion = motion
  }
  playMotion("idle")

  const kitTexturePromises = new Map<string, Promise<Texture>>()
  let kitRequestVersion = 0

  function loadKitTexture(url: string) {
    const cached = kitTexturePromises.get(url)
    if (cached) return cached
    const pending = new Promise<Texture>((resolve, reject) => {
      const texture = new Texture(
        url,
        scene,
        true,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
        () => resolve(texture),
        (message, exception) => reject(exception ?? new Error(message))
      )
      texture.name = `kit_atlas:${url}`
      texture.wrapU = Texture.CLAMP_ADDRESSMODE
      texture.wrapV = Texture.CLAMP_ADDRESSMODE
      texture.gammaSpace = true
    })
    kitTexturePromises.set(url, pending)
    return pending
  }

  async function applyKit(kit: KitItem) {
    canvas.dataset.pendingKit = kit.kitKey
    kitBootMaterial.albedoColor = Color3.FromHexString(kit.palette.boots)
    kitSoleMaterial.albedoColor = Color3.FromHexString(kit.palette.sole)
    const selectedCollar = kit.collar ?? "v"
    collarMeshes.forEach((meshes, collar) => {
      meshes.forEach((mesh) => mesh.setEnabled(collar === selectedCollar))
    })

    const requestVersion = ++kitRequestVersion
    const asset = kitTextureAssets.get(kit.kitKey)
    if (!asset) {
      kitAtlasMaterial.albedoTexture = null
      kitAtlasMaterial.albedoColor = Color3.FromHexString(kit.palette.primary)
      canvas.dataset.renderedKit = kit.kitKey
      canvas.dataset.kitRenderStatus = "fallback"
      delete canvas.dataset.pendingKit
      return
    }
    try {
      const texture = await loadKitTexture(asset.url)
      if (requestVersion !== kitRequestVersion) return
      kitAtlasMaterial.albedoColor = Color3.White()
      kitAtlasMaterial.albedoTexture = texture
      canvas.dataset.renderedKit = kit.kitKey
      canvas.dataset.kitRenderStatus = "texture"
      delete canvas.dataset.pendingKit
    } catch (error: unknown) {
      if (requestVersion !== kitRequestVersion) return
      console.warn(`Kit atlas failed for ${kit.kitKey}; using palette fallback.`, error)
      kitAtlasMaterial.albedoTexture = null
      kitAtlasMaterial.albedoColor = Color3.FromHexString(kit.palette.primary)
      canvas.dataset.renderedKit = kit.kitKey
      canvas.dataset.kitRenderStatus = "fallback"
      delete canvas.dataset.pendingKit
    }
  }

  function applyAppearance(appearance: AvatarAppearance) {
    const skin = SKIN_TONES[appearance.skinTone]
    const hair = HAIR_COLORS[appearance.hairColor]
    const eyes = EYE_COLORS[appearance.eyeColor]
    const eyeShape = EYE_SHAPES[appearance.eyeShape]
    const faceStyle = FACE_STYLES[appearance.faceStyle]

    hairStyleMeshes.forEach((meshes, style) => {
      meshes.forEach((mesh) => mesh.setEnabled(style === appearance.hairStyle))
    })

    const colors: Record<keyof typeof APPEARANCE_MATERIAL_SLOTS, string> = {
      skin: skin.color,
      skinShadow: skin.shadow,
      hair: hair.color,
      hairAccent: hair.accent,
      eyeLine: "#09030f",
      iris: eyes.color,
      eyeHighlight: "#fffaf2",
      blush: skin.blush,
      mouth: skin.mouth,
    }

    for (const [role, color] of Object.entries(colors) as Array<
      [keyof typeof APPEARANCE_MATERIAL_SLOTS, string]
    >) {
      const material = appearanceMaterials.get(role)
      if (!material) continue
      const target = Color3.FromHexString(color)
      if (role === "skin" && material.albedoTexture) {
        // The Colin body albedo is a painted texture; treat the tone as the
        // desired absolute color and divide by the texture's base skin color
        // so the multiply tint lands on the palette value instead of darkening.
        material.albedoColor = new Color3(
          Math.min(1, target.r / SKIN_TEXTURE_BASE.r),
          Math.min(1, target.g / SKIN_TEXTURE_BASE.g),
          Math.min(1, target.b / SKIN_TEXTURE_BASE.b)
        )
      } else {
        material.albedoColor = target
      }
    }

    for (const node of eyeNodes) {
      const base = eyeBaseScales.get(node)
      if (!base) continue
      node.scaling.x = base.x * eyeShape.eyeWidth
      node.scaling.y = base.y * eyeShape.eyeHeight
      node.scaling.z = base.z
    }

    for (const node of eyebrowNodes) {
      const base = eyebrowBaseRotations.get(node) ?? 0
      const side = node.name.endsWith("_l") ? -1 : 1
      node.rotation.z = base + side * faceStyle.browTilt
    }
    for (const node of cheekNodes) {
      const base = cheekBaseScales.get(node)
      if (!base) continue
      node.scaling.set(base.x * faceStyle.cheekScale, base.y, base.z * faceStyle.cheekScale)
    }
    if (mouthNode && mouthBaseScale) {
      mouthNode.scaling.set(
        mouthBaseScale.x * faceStyle.mouthWidth,
        mouthBaseScale.y,
        mouthBaseScale.z
      )
    }
  }

  let autoRotate = false
  let avatarYaw = 0
  scene.onBeforeRenderObservable.add(() => {
    if (!autoRotate || !avatarRoot.rotationQuaternion) return
    avatarYaw += engine.getDeltaTime() * 0.00036
    Quaternion.FromEulerAnglesToRef(0, avatarYaw, 0, avatarRoot.rotationQuaternion)
  })

  engine.runRenderLoop(() => scene.render())

  const onResize = () => engine.resize()
  window.addEventListener("resize", onResize)

  return {
    engine,
    scene,
    camera,
    avatarRoot,
    async setKit(kit) {
      await applyKit(kit)
    },
    setAppearance(appearance) {
      applyAppearance(appearance)
    },
    setAutoRotate(enabled) {
      autoRotate = enabled
    },
    setMotion(motion) {
      playMotion(motion)
    },
    setView(view) {
      const alphaByView: Record<ChibiCameraView, number> = {
        front: Math.PI / 2,
        "three-quarter": Math.PI / 4,
        side: 0,
      }
      camera.setTarget(target)
      camera.alpha = alphaByView[view]
      camera.beta = 1.34
      camera.radius = 4.25
    },
    dispose() {
      window.removeEventListener("resize", onResize)
      scene.dispose()
      engine.dispose()
    },
  }
}
