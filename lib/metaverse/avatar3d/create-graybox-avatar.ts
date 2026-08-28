import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Scene,
  ShadowGenerator,
  TransformNode,
  Vector3,
} from "@babylonjs/core"
import { CHIBI_SCALE_METERS_PER_UNIT, type ChibiCameraView } from "./chibi-spec"

type JointPair = {
  proc: TransformNode
  act: TransformNode
}

export type GrayboxAvatarLab = {
  engine: Engine
  scene: Scene
  camera: ArcRotateCamera
  avatarRoot: TransformNode
  setAutoRotate(enabled: boolean): void
  setView(view: ChibiCameraView): void
  dispose(): void
}

const unit = (value: number) => value * CHIBI_SCALE_METERS_PER_UNIT

function makeMaterial(scene: Scene, name: string, color: string, roughness = 0.9) {
  const material = new PBRMaterial(name, scene)
  material.albedoColor = Color3.FromHexString(color)
  material.emissiveColor = material.albedoColor.scale(0.045)
  material.metallic = 0
  material.roughness = roughness
  return material
}

function makeJoint(
  scene: Scene,
  name: string,
  parent: TransformNode,
  position: Vector3
): JointPair {
  const proc = new TransformNode(`proc_${name}`, scene)
  proc.parent = parent
  proc.position.copyFrom(position)

  const act = new TransformNode(`act_${name}`, scene)
  act.parent = proc
  act.rotationQuaternion = Quaternion.Identity()

  return { proc, act }
}

function attachMesh(mesh: Mesh, parent: TransformNode, receiveShadows = true) {
  mesh.parent = parent
  mesh.receiveShadows = receiveShadows
  return mesh
}

function createAvatar(scene: Scene, shadowGenerator: ShadowGenerator) {
  const skin = makeMaterial(scene, "skin", "#f3b99c")
  const shirt = makeMaterial(scene, "shirt", "#b42342")
  const shirtLight = makeMaterial(scene, "shirt_light", "#f3eee7")
  const shorts = makeMaterial(scene, "shorts", "#293448")
  const socks = makeMaterial(scene, "socks", "#f1eee8")
  const shoes = makeMaterial(scene, "shoes", "#242938", 0.75)
  const sole = makeMaterial(scene, "sole", "#d8dbe3", 0.8)
  const hair = makeMaterial(scene, "hair", "#4b3340", 0.95)
  const hairLight = makeMaterial(scene, "hair_light", "#684657", 0.92)
  const eyes = makeMaterial(scene, "eyes", "#2a2038", 0.7)
  const eyeIris = makeMaterial(scene, "eye_iris", "#8a5576", 0.68)
  const mouth = makeMaterial(scene, "mouth", "#b96375", 0.85)
  const blush = makeMaterial(scene, "blush", "#e88791", 0.92)

  const avatarRoot = new TransformNode("avatar_root", scene)
  const visualRoot = new TransformNode("visual_root", scene)
  visualRoot.parent = avatarRoot

  const pelvis = makeJoint(scene, "pelvis", visualRoot, new Vector3(0, unit(21.5), 0))
  const torso = makeJoint(scene, "torso", pelvis.act, new Vector3(0, unit(2.5), 0))
  const head = makeJoint(scene, "head", torso.act, new Vector3(0, unit(12), 0))

  const torsoMesh = attachMesh(
    MeshBuilder.CreateCylinder(
      "torso_mesh",
      {
        height: unit(12),
        diameterTop: unit(12.5),
        diameterBottom: unit(10.6),
        tessellation: 12,
      },
      scene
    ),
    torso.act
  )
  torsoMesh.position.y = unit(6)
  torsoMesh.scaling.z = 0.62
  torsoMesh.material = shirt

  const collar = attachMesh(
    MeshBuilder.CreateTorus(
      "collar_mesh",
      { diameter: unit(4.2), thickness: unit(0.55), tessellation: 16 },
      scene
    ),
    torso.act,
    false
  )
  collar.position.set(0, unit(11.85), unit(-2.7))
  collar.rotation.x = Math.PI / 2
  collar.scaling.y = 0.6
  collar.material = shirtLight

  const pelvisMesh = attachMesh(
    MeshBuilder.CreateCylinder(
      "pelvis_mesh",
      {
        height: unit(5),
        diameterTop: unit(10),
        diameterBottom: unit(10.5),
        tessellation: 12,
      },
      scene
    ),
    pelvis.act
  )
  pelvisMesh.position.y = unit(0)
  pelvisMesh.scaling.z = 0.62
  pelvisMesh.material = shorts

  const headMesh = attachMesh(
    MeshBuilder.CreateSphere("head_mesh", { diameter: 2, segments: 16 }, scene),
    head.act
  )
  headMesh.position.y = unit(8.1)
  headMesh.scaling.set(unit(8.15), unit(8.15), unit(7.45))
  headMesh.material = skin

  const hairCap = attachMesh(
    MeshBuilder.CreateSphere("hair_cap", { diameter: 2, segments: 12 }, scene),
    head.act
  )
  hairCap.position.set(0, unit(11.7), unit(1.15))
  hairCap.scaling.set(unit(8.5), unit(4.9), unit(7.8))
  hairCap.material = hair

  const hairClumps = [
    [-4.5, 9.4, -6.6, 2.6, 4.2, 1.45, -0.34],
    [-1.6, 9.8, -7.05, 2.7, 4.8, 1.25, -0.13],
    [1.5, 10, -7.05, 2.6, 4.5, 1.25, 0.12],
    [4.45, 9.25, -6.55, 2.55, 4.05, 1.45, 0.33],
    [-7.25, 8.2, -2.25, 1.75, 5.25, 2.25, -0.18],
    [7.25, 8.2, -2.25, 1.75, 5.25, 2.25, 0.18],
    [0, 9, 6.8, 6.7, 6.3, 1.8, 0],
  ] as const

  hairClumps.forEach(([x, y, z, sx, sy, sz, rz], index) => {
    const clump = attachMesh(
      MeshBuilder.CreateIcoSphere(
        `hair_clump_${index + 1}`,
        { radius: 1, subdivisions: 2, flat: false },
        scene
      ),
      head.act
    )
    clump.position.set(unit(x), unit(y), unit(z))
    clump.scaling.set(unit(sx), unit(sy), unit(sz))
    clump.rotation.z = rz
    clump.material = index === 1 || index === 2 ? hairLight : hair
  })

  const topTufts = [
    [-3.3, 15.2, 0.1, -0.32],
    [0, 16.1, 0.2, 0],
    [3.2, 15.15, 0.35, 0.32],
  ] as const
  topTufts.forEach(([x, y, z, rz], index) => {
    const tuft = attachMesh(
      MeshBuilder.CreateCylinder(
        `hair_tuft_${index + 1}`,
        {
          height: unit(5),
          diameterTop: 0,
          diameterBottom: unit(3.6),
          tessellation: 8,
        },
        scene
      ),
      head.act
    )
    tuft.position.set(unit(x), unit(y), unit(z))
    tuft.rotation.z = rz
    tuft.material = index === 1 ? hairLight : hair
  })

  for (const side of [-1, 1] as const) {
    const eye = attachMesh(
      MeshBuilder.CreateSphere(
        `eye_${side < 0 ? "l" : "r"}`,
        { diameter: unit(2.5), segments: 8 },
        scene
      ),
      head.act,
      false
    )
    eye.position.set(unit(2.85 * side), unit(7.25), unit(-7.48))
    eye.scaling.set(0.78, 1.48, 0.2)
    eye.material = eyes

    const iris = attachMesh(
      MeshBuilder.CreateSphere(
        `eye_iris_${side < 0 ? "l" : "r"}`,
        { diameter: unit(1.25), segments: 8 },
        scene
      ),
      head.act,
      false
    )
    iris.position.set(unit(2.85 * side), unit(7.05), unit(-7.75))
    iris.scaling.set(0.72, 1.18, 0.16)
    iris.material = eyeIris

    const eyeLight = attachMesh(
      MeshBuilder.CreateSphere(
        `eye_light_${side < 0 ? "l" : "r"}`,
        { diameter: unit(0.7), segments: 6 },
        scene
      ),
      head.act,
      false
    )
    eyeLight.position.set(unit(2.55 * side), unit(8.15), unit(-7.96))
    eyeLight.material = socks

    const cheek = attachMesh(
      MeshBuilder.CreateSphere(
        `cheek_${side < 0 ? "l" : "r"}`,
        { diameter: unit(1.45), segments: 8 },
        scene
      ),
      head.act,
      false
    )
    cheek.position.set(unit(5.3 * side), unit(4.6), unit(-6.85))
    cheek.scaling.set(1.25, 0.48, 0.14)
    cheek.material = blush
  }

  const mouthMesh = attachMesh(
    MeshBuilder.CreateCapsule(
      "mouth_mesh",
      { height: unit(2.2), radius: unit(0.35), tessellation: 6 },
      scene
    ),
    head.act,
    false
  )
  mouthMesh.position.set(0, unit(3.75), unit(-7.58))
  mouthMesh.rotation.z = Math.PI / 2
  mouthMesh.scaling.y = 0.8
  mouthMesh.material = mouth

  for (const side of [-1, 1] as const) {
    const suffix = side < 0 ? "l" : "r"
    const shoulder = makeJoint(
      scene,
      `upper_arm_${suffix}`,
      torso.act,
      new Vector3(unit(7.15 * side), unit(9.8), 0)
    )
    shoulder.proc.rotation.z = side * 0.1
    const upperArm = attachMesh(
      MeshBuilder.CreateCapsule(
        `upper_arm_mesh_${suffix}`,
        { height: unit(7.8), radius: unit(1.95), tessellation: 12 },
        scene
      ),
      shoulder.act
    )
    upperArm.position.y = unit(-3.5)
    upperArm.material = shirtLight

    const elbow = makeJoint(scene, `forearm_${suffix}`, shoulder.act, new Vector3(0, unit(-6.8), 0))
    elbow.proc.rotation.x = -0.08
    const forearm = attachMesh(
      MeshBuilder.CreateCapsule(
        `forearm_mesh_${suffix}`,
        { height: unit(7), radius: unit(1.68), tessellation: 12 },
        scene
      ),
      elbow.act
    )
    forearm.position.y = unit(-3.2)
    forearm.material = skin

    const hand = attachMesh(
      MeshBuilder.CreateIcoSphere(
        `hand_mesh_${suffix}`,
        { radius: 1, subdivisions: 1, flat: false },
        scene
      ),
      elbow.act
    )
    hand.position.y = unit(-6.85)
    hand.scaling.set(unit(2.1), unit(2.35), unit(1.95))
    hand.material = skin

    const hip = makeJoint(
      scene,
      `thigh_${suffix}`,
      pelvis.act,
      new Vector3(unit(2.7 * side), unit(-2.5), 0)
    )
    const thigh = attachMesh(
      MeshBuilder.CreateCapsule(
        `thigh_mesh_${suffix}`,
        { height: unit(8.8), radius: unit(2.45), tessellation: 12 },
        scene
      ),
      hip.act
    )
    thigh.position.y = unit(-4)
    thigh.scaling.z = 1.12
    thigh.material = shorts

    const knee = makeJoint(scene, `shin_${suffix}`, hip.act, new Vector3(0, unit(-8), 0))
    const shin = attachMesh(
      MeshBuilder.CreateCapsule(
        `shin_mesh_${suffix}`,
        { height: unit(7.8), radius: unit(2.12), tessellation: 12 },
        scene
      ),
      knee.act
    )
    shin.position.y = unit(-3.5)
    shin.material = socks

    const ankle = makeJoint(scene, `foot_${suffix}`, knee.act, new Vector3(0, unit(-7), 0))
    const foot = attachMesh(
      MeshBuilder.CreateCapsule(
        `foot_mesh_${suffix}`,
        { height: unit(8.3), radius: unit(2.15), tessellation: 12 },
        scene
      ),
      ankle.act
    )
    foot.rotation.x = Math.PI / 2
    foot.position.set(0, unit(1.85), unit(-2.25))
    foot.scaling.x = 1.38
    foot.scaling.z = 1.08
    foot.rotation.y = side * 0.07
    foot.material = shoes

    const soleMesh = attachMesh(
      MeshBuilder.CreateCapsule(
        `sole_mesh_${suffix}`,
        { height: unit(7.6), radius: unit(1.55), tessellation: 10 },
        scene
      ),
      ankle.act
    )
    soleMesh.rotation.x = Math.PI / 2
    soleMesh.rotation.y = side * 0.07
    soleMesh.position.set(0, unit(0.35), unit(-2.45))
    soleMesh.scaling.x = 1.4
    soleMesh.scaling.z = 0.35
    soleMesh.material = sole
  }

  scene.meshes.forEach((mesh) => {
    if (mesh.name !== "ground") shadowGenerator.addShadowCaster(mesh)
  })

  return avatarRoot
}

export function createGrayboxAvatarLab(canvas: HTMLCanvasElement): GrayboxAvatarLab {
  const engine = new Engine(canvas, true, {
    antialias: true,
    preserveDrawingBuffer: false,
    stencil: true,
  })
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.75))

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.055, 0.07, 0.11, 1)

  const target = new Vector3(0, unit(25), 0)
  const camera = new ArcRotateCamera("avatar_lab_camera", -Math.PI / 2, 1.35, 1.88, target, scene)
  camera.lowerRadiusLimit = 1.55
  camera.upperRadiusLimit = 3.6
  camera.lowerBetaLimit = 0.75
  camera.upperBetaLimit = 1.58
  camera.wheelPrecision = 35
  camera.pinchPrecision = 90
  camera.attachControl(canvas, true)

  const hemi = new HemisphericLight("avatar_lab_fill", new Vector3(0, 1, 0), scene)
  hemi.intensity = 1.35
  hemi.diffuse = new Color3(0.82, 0.88, 1)
  hemi.groundColor = new Color3(0.18, 0.2, 0.28)

  const key = new DirectionalLight("avatar_lab_key", new Vector3(-0.5, -1, 0.65), scene)
  key.position = new Vector3(2.5, 4, -3)
  key.intensity = 1.7

  const shadowGenerator = new ShadowGenerator(1024, key)
  shadowGenerator.useBlurExponentialShadowMap = true
  shadowGenerator.blurKernel = 20
  shadowGenerator.bias = 0.0008

  const ground = MeshBuilder.CreateDisc("ground", { radius: 1.05, tessellation: 48 }, scene)
  ground.rotation.x = Math.PI / 2
  ground.position.y = -0.004
  ground.receiveShadows = true
  const groundMaterial = makeMaterial(scene, "ground_material", "#1f2937", 1)
  ground.material = groundMaterial

  const avatarRoot = createAvatar(scene, shadowGenerator)
  avatarRoot.rotationQuaternion = Quaternion.Identity()

  let autoRotate = false
  let avatarYaw = 0
  scene.onBeforeRenderObservable.add(() => {
    if (!autoRotate || !avatarRoot.rotationQuaternion) return
    avatarYaw += engine.getDeltaTime() * 0.00042
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
    setAutoRotate(enabled) {
      autoRotate = enabled
    },
    setView(view) {
      const alphaByView: Record<ChibiCameraView, number> = {
        front: -Math.PI / 2,
        "three-quarter": -Math.PI / 2 - Math.PI / 4,
        side: -Math.PI,
      }
      camera.setTarget(target)
      camera.alpha = alphaByView[view]
      camera.beta = 1.35
      camera.radius = 1.88
    },
    dispose() {
      window.removeEventListener("resize", onResize)
      scene.dispose()
      engine.dispose()
    },
  }
}
