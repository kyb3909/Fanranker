// Walkable stadium demo for the Colin avatar: a football pitch with goals and
// simple stands, third-person controls, and the GLB's motion clips driven by
// movement (idle/walk/run) plus action keys (jump/kick/cheer).
import "@babylonjs/loaders/glTF/2.0/glTFLoader"
import "@babylonjs/core/Animations/animatable"

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { Engine } from "@babylonjs/core/Engines/engine"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator"
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent"
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture"
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import { Scene } from "@babylonjs/core/scene"
import { getKit, DEFAULT_KIT_KEY } from "./kits"

const PITCH_LENGTH = 46 // z axis (goal to goal)
const PITCH_WIDTH = 30 // x axis
const WALK_SPEED = 2.1
const RUN_SPEED = 4.6
const TURN_LERP = 0.18

type ActionMotion = "jump" | "kick" | "cheer"

export type StadiumWalkDemo = {
  dispose(): void
}

function paintPitchTexture(scene: Scene) {
  const texture = new DynamicTexture("pitch_texture", { width: 1024, height: 1536 }, scene, true)
  const ctx = texture.getContext() as CanvasRenderingContext2D
  const w = 1024
  const h = 1536
  ctx.fillStyle = "#2e7d3c"
  ctx.fillRect(0, 0, w, h)
  // mow stripes across the width
  ctx.fillStyle = "#35893f"
  const stripes = 12
  for (let i = 0; i < stripes; i += 2) {
    ctx.fillRect(0, (h / stripes) * i, w, h / stripes)
  }
  // lines: margins 6% — pitch play area inside
  const mx = w * 0.06
  const my = h * 0.05
  ctx.strokeStyle = "#f4f6f0"
  ctx.lineWidth = 7
  ctx.strokeRect(mx, my, w - mx * 2, h - my * 2)
  // halfway line + center circle
  ctx.beginPath()
  ctx.moveTo(mx, h / 2)
  ctx.lineTo(w - mx, h / 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, w * 0.14, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = "#f4f6f0"
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, 9, 0, Math.PI * 2)
  ctx.fill()
  // penalty boxes
  const boxW = w * 0.55
  const boxH = h * 0.14
  const smallW = w * 0.28
  const smallH = h * 0.055
  for (const top of [true, false]) {
    const yEdge = top ? my : h - my
    const dir = top ? 1 : -1
    ctx.strokeRect((w - boxW) / 2, top ? yEdge : yEdge - boxH, boxW, boxH)
    ctx.strokeRect((w - smallW) / 2, top ? yEdge : yEdge - smallH, smallW, smallH)
    ctx.beginPath()
    ctx.arc(w / 2, yEdge + dir * h * 0.095, 8, 0, Math.PI * 2)
    ctx.fill()
  }
  texture.update()
  return texture
}

function buildStadium(scene: Scene) {
  const pitch = CreateGround("pitch", { width: PITCH_WIDTH + 6, height: PITCH_LENGTH + 8 }, scene)
  const pitchMaterial = new PBRMaterial("pitch_material", scene)
  pitchMaterial.albedoTexture = paintPitchTexture(scene)
  pitchMaterial.metallic = 0
  pitchMaterial.roughness = 0.95
  pitch.material = pitchMaterial
  pitch.receiveShadows = true

  const postMaterial = new PBRMaterial("goal_material", scene)
  postMaterial.albedoColor = Color3.FromHexString("#f2f4f0")
  postMaterial.metallic = 0.1
  postMaterial.roughness = 0.4

  const goalHalfZ = PITCH_LENGTH / 2 - 1.2
  for (const zSign of [1, -1]) {
    const goal = new TransformNode(`goal_${zSign}`, scene)
    for (const xSign of [1, -1]) {
      const post = CreateBox("goal_post", { width: 0.22, height: 2.6, depth: 0.22 }, scene)
      post.position.set(xSign * 3.6, 1.3, zSign * goalHalfZ)
      post.material = postMaterial
      post.parent = goal
    }
    const crossbar = CreateBox("goal_crossbar", { width: 7.42, height: 0.22, depth: 0.22 }, scene)
    crossbar.position.set(0, 2.6, zSign * goalHalfZ)
    crossbar.material = postMaterial
    crossbar.parent = goal
  }

  const standMaterial = new PBRMaterial("stand_material", scene)
  standMaterial.albedoColor = Color3.FromHexString("#39415a")
  standMaterial.metallic = 0
  standMaterial.roughness = 0.9
  const seatMaterial = new PBRMaterial("seat_material", scene)
  seatMaterial.albedoColor = Color3.FromHexString("#8a1e2f")
  seatMaterial.metallic = 0
  seatMaterial.roughness = 0.85
  for (const xSign of [1, -1]) {
    for (let tier = 0; tier < 4; tier++) {
      const step = CreateBox(
        `stand_${xSign}_${tier}`,
        { width: 2.2, height: 1.5, depth: PITCH_LENGTH + 8 },
        scene
      )
      step.position.set(xSign * (PITCH_WIDTH / 2 + 4.4 + tier * 2.2), 0.75 + tier * 1.5, 0)
      step.material = tier % 2 === 0 ? seatMaterial : standMaterial
    }
  }
  for (const zSign of [1, -1]) {
    for (let tier = 0; tier < 3; tier++) {
      const step = CreateBox(
        `stand_end_${zSign}_${tier}`,
        { width: PITCH_WIDTH + 6, height: 1.5, depth: 2.2 },
        scene
      )
      step.position.set(0, 0.75 + tier * 1.5, zSign * (PITCH_LENGTH / 2 + 5.2 + tier * 2.2))
      step.material = tier % 2 === 0 ? seatMaterial : standMaterial
    }
  }
}

async function applyKitTexture(scene: Scene) {
  const material = scene.materials.find(
    (candidate) => candidate.name === "KIT_ATLAS" || candidate.name.startsWith("KIT_ATLAS.")
  )
  if (!(material instanceof PBRMaterial)) return
  try {
    const response = await fetch("/metaverse/avatar3d/kits/v1/manifest.json", {
      cache: "no-cache",
    })
    if (!response.ok) return
    const manifest = (await response.json()) as {
      entries: Array<{ kitKey: string; url: string }>
    }
    const entry = manifest.entries.find((candidate) => candidate.kitKey === DEFAULT_KIT_KEY)
    if (!entry) return
    const texture = new Texture(entry.url, scene, true, false)
    texture.wrapU = Texture.CLAMP_ADDRESSMODE
    texture.wrapV = Texture.CLAMP_ADDRESSMODE
    texture.gammaSpace = true
    material.albedoColor = Color3.White()
    material.albedoTexture = texture
  } catch {
    material.albedoColor = Color3.FromHexString(getKit(DEFAULT_KIT_KEY).palette.primary)
  }
}

export async function createStadiumWalkDemo(canvas: HTMLCanvasElement): Promise<StadiumWalkDemo> {
  const engine = new Engine(canvas, true, { antialias: true, stencil: true })
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.75))
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.03, 0.045, 0.09, 1)

  const camera = new ArcRotateCamera(
    "demo_camera",
    -Math.PI / 2,
    1.12,
    11,
    new Vector3(0, 2, 0),
    scene
  )
  camera.lowerRadiusLimit = 6
  camera.upperRadiusLimit = 26
  camera.lowerBetaLimit = 0.5
  camera.upperBetaLimit = 1.45
  camera.attachControl(canvas, true)

  const hemi = new HemisphericLight("demo_fill", new Vector3(0, 1, 0), scene)
  hemi.intensity = 1.05
  hemi.groundColor = new Color3(0.2, 0.24, 0.2)
  const sun = new DirectionalLight("demo_sun", new Vector3(-0.4, -1, 0.5), scene)
  sun.position = new Vector3(14, 26, -16)
  sun.intensity = 1.6
  const shadows = new ShadowGenerator(1024, sun)
  shadows.useBlurExponentialShadowMap = true
  shadows.blurKernel = 16

  buildStadium(scene)

  const imported = await SceneLoader.ImportMeshAsync(
    "",
    "/metaverse/avatar3d/",
    "colin-avatar-v1.glb",
    scene
  )
  const avatarRoot = new TransformNode("avatar_walk_root", scene)
  const importedRoot = imported.meshes.find((mesh) => mesh.parent === null)
  if (importedRoot) importedRoot.parent = avatarRoot
  imported.meshes.forEach((mesh) => {
    if (mesh.getTotalVertices() > 0) shadows.addShadowCaster(mesh)
  })
  await applyKitTexture(scene)

  const ballNodes = [...scene.meshes, ...scene.transformNodes].filter(
    (node) => node.name === "ball" || node.name.startsWith("ball_primitive")
  )
  imported.animationGroups.forEach((group) => group.stop())

  let currentMotion = ""
  let activeAction: ActionMotion | null = null
  function playMotion(motion: string, loop: boolean) {
    if (currentMotion === motion) return
    imported.animationGroups.forEach((group) => group.stop())
    ballNodes.forEach((node) => node.setEnabled(motion === "kick"))
    const target = imported.animationGroups.find((group) => group.name === motion)
    if (target) {
      target.play(loop)
      if (!loop) {
        target.onAnimationGroupEndObservable.addOnce(() => {
          activeAction = null
          currentMotion = ""
        })
      }
    }
    currentMotion = motion
    canvas.dataset.motion = motion
  }
  playMotion("idle", true)

  const pressed = new Set<string>()
  const actionKeys: Record<string, ActionMotion> = {
    Space: "jump",
    KeyK: "kick",
    KeyC: "cheer",
  }
  function onKeyDown(event: KeyboardEvent) {
    if (
      event.code in actionKeys ||
      ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        event.code
      )
    ) {
      event.preventDefault()
    }
    pressed.add(event.code)
    const action = actionKeys[event.code]
    if (action && !activeAction) {
      activeAction = action
      playMotion(action, false)
    }
  }
  function onKeyUp(event: KeyboardEvent) {
    pressed.delete(event.code)
  }
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)

  let yaw = Math.PI // face the near goal (toward the default camera)
  avatarRoot.rotation = new Vector3(0, yaw, 0)

  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000
    const forward =
      (pressed.has("KeyW") || pressed.has("ArrowUp") ? 1 : 0) -
      (pressed.has("KeyS") || pressed.has("ArrowDown") ? 1 : 0)
    const strafe =
      (pressed.has("KeyD") || pressed.has("ArrowRight") ? 1 : 0) -
      (pressed.has("KeyA") || pressed.has("ArrowLeft") ? 1 : 0)
    const moving = (forward !== 0 || strafe !== 0) && !activeAction

    if (moving) {
      // camera-relative movement direction on the ground plane
      const camForward = camera.target.subtract(camera.position)
      camForward.y = 0
      camForward.normalize()
      const camRight = new Vector3(camForward.z, 0, -camForward.x)
      const direction = camForward.scale(forward).add(camRight.scale(strafe))
      direction.normalize()
      const running = pressed.has("ShiftLeft") || pressed.has("ShiftRight")
      const speed = running ? RUN_SPEED : WALK_SPEED
      avatarRoot.position.addInPlace(direction.scale(speed * dt))
      avatarRoot.position.x = Math.max(
        -PITCH_WIDTH / 2,
        Math.min(PITCH_WIDTH / 2, avatarRoot.position.x)
      )
      avatarRoot.position.z = Math.max(
        -PITCH_LENGTH / 2,
        Math.min(PITCH_LENGTH / 2, avatarRoot.position.z)
      )
      // after Babylon's glTF handedness flip the model faces +Z at yaw 0
      const targetYaw = Math.atan2(direction.x, direction.z)
      let delta = targetYaw - yaw
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      yaw += delta * TURN_LERP
      avatarRoot.rotation.y = yaw
      playMotion(running ? "run" : "walk", true)
    } else if (!activeAction) {
      playMotion("idle", true)
    }

    // camera follows the avatar
    const desired = avatarRoot.position.add(new Vector3(0, 2, 0))
    camera.target = Vector3.Lerp(camera.target, desired, 0.12)
    canvas.dataset.avatarPos = `${avatarRoot.position.x.toFixed(1)},${avatarRoot.position.z.toFixed(1)}`
  })

  engine.runRenderLoop(() => scene.render())
  const onResize = () => engine.resize()
  window.addEventListener("resize", onResize)
  canvas.dataset.demoState = "ready"

  return {
    dispose() {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("resize", onResize)
      scene.dispose()
      engine.dispose()
    },
  }
}
