"""Build an avatar GLB (Colin or Chloe) for the avatar lab.

Imports the purchased chibi set (body / modular hair FBX), re-UVs the football
shirt+shorts onto the existing 512px kit atlas layout (so every generated kit
texture in public/metaverse/avatar3d/kits/v1 works unchanged), builds simple
boots and a ball, rigs a 15-bone armature with keyframed motion clips, and
exports a single GLB.

The purchased set only ships clothes fitted to Colin, so Chloe borrows the same
shirt/shorts and shrink-wraps them onto her body before skinning.

Run:  py -3.11 scripts/avatar3d/build_colin_avatar.py [colin|chloe|all]
Outputs:
  public/metaverse/avatar3d/{colin,chloe}-avatar-v1.glb
  output/colin-build/*.png  (preview renders with the Arsenal home kit)
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
AVATAR = ROOT / "avatar"
PUBLIC = ROOT / "public" / "metaverse" / "avatar3d"
KITS_DIR = PUBLIC / "kits" / "v1"
OUT = ROOT / "output" / "colin-build"
OUT.mkdir(parents=True, exist_ok=True)

PREVIEW_KIT = "red-horizon-home"  # Arsenal home (kits.ts DEFAULT_KIT_KEY)

TARGET_HEIGHT = 3.3  # matches CHIBI_SPEC.totalHeight / v5 scene scale

# Clothes exist only for Colin; both characters wear them.
CLOTHES_FBX = AVATAR / "Colin_clothes_v01_forBlender.fbx"

CHARACTERS = {
    "colin": {
        "glb": "colin-avatar-v1.glb",
        "body_fbx": AVATAR / "Modeling_v02_head_body_Combine" / "Colin_baseModel_v02.fbx",
        "hair_fbx": AVATAR / "Modeling" / "Colin_Hair_v01_forBlender.fbx",
        "body_prefix": "Colin_baseModel",
        "hair_prefix": "Colin_hair",
        "texture": AVATAR / "Texture" / "Collin_baseModel_BaseColor_1001.png",
        "has_hair_base": True,
        # style key -> (bangs index, back index)
        "hair_combos": {
            "short": (1, 1),
            "bob": (5, 3),
            "ponytail": (3, 5),
            "twintail": (7, 6),
        },
        "tuck_body": False,
    },
    "chloe": {
        "glb": "chloe-avatar-v1.glb",
        "body_fbx": AVATAR / "Modeling_v02_head_body_Combine" / "Chloe_baseModel_v02.fbx",
        "hair_fbx": AVATAR / "Modeling" / "Chloe_Hair2_v01.fbx",
        "body_prefix": "Chloe_baseModel",
        "hair_prefix": "Chloe_hair2",
        "texture": AVATAR / "Texture" / "Chloe_baseModel_BaseColor_1001.png",
        # Chloe's hair set has no shared skull cap — bangs+back cover it.
        "has_hair_base": False,
        # bangs 01..10, back 01..05
        "hair_combos": {
            "short": (2, 2),
            "bob": (6, 1),
            "ponytail": (3, 3),
            "twintail": (9, 5),
        },
        "tuck_body": True,
    },
}

# 512-logical kit atlas regions (canvas coords, y down) — must mirror
# scripts/avatar3d/generate-kit-textures.ts `rect`.
ATLAS = 512
REGIONS = {
    "front": (0, 0, 192, 256),
    "back": (192, 0, 192, 256),
    "sleeve_l": (384, 0, 64, 128),
    "sleeve_r": (448, 0, 64, 128),
    "shorts_l": (0, 256, 128, 192),
    "shorts_r": (128, 256, 128, 192),
    "collar": (384, 256, 64, 64),
}

def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


def bake_world_transform(obj):
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)


def delete_objects(objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)


def make_material(name, color, roughness=0.85, alpha=1.0, texture=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.0
    if alpha < 1.0:
        principled.inputs["Alpha"].default_value = alpha
        mat.diffuse_color = (*color, alpha)
        return mat
    if texture is not None:
        img = bpy.data.images.load(str(texture), check_existing=True)
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = img
        mat.node_tree.links.new(tex.outputs["Color"], principled.inputs["Base Color"])
    mat.diffuse_color = (*color, 1.0)
    return mat


def assign_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def region_uv(region, u_frac, v_frac):
    x, y, w, h = region
    u_frac = min(1.0, max(0.0, u_frac))
    v_frac = min(1.0, max(0.0, v_frac))
    u = (x + u_frac * w) / ATLAS
    v = 1.0 - (y + (1.0 - v_frac) * h) / ATLAS
    return u, v


def norm(value, lo, hi):
    if hi - lo < 1e-9:
        return 0.5
    return (value - lo) / (hi - lo)


def mesh_bounds(obj):
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def remap_shirt(obj):
    """Classify shirt faces into collar / sleeves / front / back atlas regions."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active.data
    (xmin, xmax), (ymin, ymax), (zmin, zmax) = mesh_bounds(obj)
    sleeve_x = 0.62 * max(abs(xmin), xmax)
    torso_x = sleeve_x
    collar_z = zmax - 0.018 * (zmax - zmin) / 0.29 if zmax > zmin else zmax

    for poly in mesh.polygons:
        center = poly.center
        is_collar = center.z > zmax - 0.022 and abs(center.x) < 0.085
        # Width alone misfires: the shirt flares at the hip, so the lower side
        # panel is wider than the sleeve cutoff and used to sample the ivory
        # sleeve strip — a white slab across the hip. Sleeves only exist in the
        # upper torso.
        is_sleeve = abs(center.x) > sleeve_x and center.z > zmin + 0.42 * (zmax - zmin)
        # Hem/armhole undersides face up or down. Projecting them front-on
        # smears a huge stretched crop of the sponsor across the hip, so park
        # them on a solid primary-color spot low in the front panel instead.
        if not is_collar and abs(poly.normal.z) > 0.7:
            flat_uv = region_uv(REGIONS["front"], 0.5, 0.06)
            for li in poly.loop_indices:
                uv[li].uv = flat_uv
            continue
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            if is_collar:
                u = norm(co.x, -0.085, 0.085)
                v = norm(co.y, ymin, ymax)
                uv[li].uv = region_uv(REGIONS["collar"], u, v)
            elif is_sleeve:
                side = "sleeve_l" if center.x > 0 else "sleeve_r"
                length = norm(abs(co.x), sleeve_x, max(abs(xmin), xmax))
                around = norm(co.y, ymin, ymax)
                uv[li].uv = region_uv(REGIONS[side], around, 1.0 - length)
            else:
                side = "front" if poly.normal.y < 0 else "back"
                u = norm(co.x, -torso_x, torso_x)
                v = norm(co.z, zmin, zmax)
                uv[li].uv = region_uv(REGIONS[side], u, v)


def remap_shorts(obj):
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active.data
    (xmin, xmax), (ymin, ymax), (zmin, zmax) = mesh_bounds(obj)
    for poly in mesh.polygons:
        side = "shorts_l" if poly.center.x > 0 else "shorts_r"
        leg_lo, leg_hi = (0.0, xmax) if poly.center.x > 0 else (xmin, 0.0)
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            u = norm(co.x, leg_lo, leg_hi)
            v = norm(co.z, zmin, zmax)
            uv[li].uv = region_uv(REGIONS[side], u, v)


def build_boot(name, center_x, foot_y, mat_boot):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=24, ring_count=16, radius=1.0, location=(center_x, foot_y - 0.012, 0.052)
    )
    boot = bpy.context.active_object
    boot.name = name
    boot.scale = (0.075, 0.1, 0.058)
    bpy.ops.object.transform_apply(scale=True)
    # flatten the underside
    for v in boot.data.vertices:
        if v.co.z < 0.008:
            v.co.z = 0.008
    for poly in boot.data.polygons:
        poly.use_smooth = True
    if not boot.data.uv_layers:
        boot.data.uv_layers.new(name="UVMap")
    assign_material(boot, mat_boot)
    return boot


def build_sole(name, center_x, foot_y, mat_sole):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24, radius=1.0, depth=0.018, location=(center_x, foot_y - 0.012, 0.009)
    )
    sole = bpy.context.active_object
    sole.name = name
    sole.scale = (0.078, 0.103, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    if not sole.data.uv_layers:
        sole.data.uv_layers.new(name="UVMap")
    assign_material(sole, mat_sole)
    return sole


BALL_RADIUS = 0.30  # final scene units


def ball_rest_position(rx, fy, factor):
    return (rx * factor, fy * factor - 0.5, BALL_RADIUS)


def build_ball(mat_white, mat_dark, rx, fy, factor):
    """Stylized soccer ball: icosphere with the 12 pole clusters painted dark."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0, 0, 0))
    ball = bpy.context.active_object
    ball.name = "ball"
    mesh = ball.data
    valence = {i: 0 for i in range(len(mesh.vertices))}
    for edge in mesh.edges:
        valence[edge.vertices[0]] += 1
        valence[edge.vertices[1]] += 1
    poles = {i for i, count in valence.items() if count == 5}
    mesh.materials.append(mat_white)
    mesh.materials.append(mat_dark)
    for poly in mesh.polygons:
        poly.use_smooth = True
        if any(vi in poles for vi in poly.vertices):
            poly.material_index = 1
    ball.scale = (BALL_RADIUS, BALL_RADIUS, BALL_RADIUS)
    bpy.ops.object.transform_apply(scale=True)
    ball.location = ball_rest_position(rx, fy, factor)
    bpy.ops.object.transform_apply(location=True)
    return ball


def build_rig(keep, lx, rx, fy, factor):
    """15-bone humanoid armature sized from measured chibi landmarks."""
    arm_data = bpy.data.armatures.new("colin_rig")
    arm_obj = bpy.data.objects.new("colin_rig", arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    F = factor
    hips_z = 0.385 * F
    bone("hips", (0, 0, hips_z), (0, 0, 0.50 * F))
    bone("spine", (0, 0, 0.50 * F), (0, 0, 0.545 * F), "hips", True)
    bone("neck", (0, 0, 0.545 * F), (0, 0, 0.575 * F), "spine", True)
    bone("head", (0, 0, 0.575 * F), (0, 0, 0.80 * F), "neck", True)
    for side, sx in (("l", 1), ("r", -1)):
        bone(
            f"upper_arm_{side}",
            (sx * 0.10 * F, 0, 0.535 * F),
            (sx * 0.21 * F, 0, 0.425 * F),
            "spine",
        )
        bone(
            f"forearm_{side}",
            (sx * 0.21 * F, 0, 0.425 * F),
            (sx * 0.315 * F, 0, 0.32 * F),
            f"upper_arm_{side}",
            True,
        )
        leg_x = (lx if side == "l" else rx) * F
        bone(f"thigh_{side}", (leg_x, 0, hips_z), (leg_x, 0, 0.20 * F), "hips")
        bone(f"shin_{side}", (leg_x, 0, 0.20 * F), (leg_x, 0, 0.055 * F), f"thigh_{side}", True)
        bone(
            f"foot_{side}",
            (leg_x, 0, 0.055 * F),
            (leg_x, (fy - 0.09) * F, 0.02 * F),
            f"shin_{side}",
            True,
        )
    ball_x, ball_y, ball_z = ball_rest_position(rx, fy, F)
    bone("ball_anchor", (ball_x, ball_y, ball_z), (ball_x, ball_y, ball_z + 0.25))
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def skin_meshes(keep, arm_obj, factor):
    # heat weights on the body only
    body = keep["body"]
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    # clothes copy the body's weights (nearest surface) so they can never
    # tear away from the skin underneath, then deform with the same armature
    for cloth in (keep["kit_shirt"], keep["kit_shorts"]):
        transfer = cloth.modifiers.new("CopyBodyWeights", "DATA_TRANSFER")
        transfer.object = body
        transfer.use_vert_data = True
        transfer.data_types_verts = {"VGROUP_WEIGHTS"}
        transfer.vert_mapping = "POLYINTERP_NEAREST"
        transfer.layers_vgroup_select_src = "ALL"
        transfer.layers_vgroup_select_dst = "NAME"
        bpy.context.view_layer.objects.active = cloth
        bpy.ops.object.modifier_apply(modifier=transfer.name)
        armature_mod = cloth.modifiers.new("Armature", "ARMATURE")
        armature_mod.object = arm_obj
        cloth.parent = arm_obj

    # the shirt torso must not follow the arms — damp arm influence inside the
    # shoulder seam (sleeves keep it), reassigning the removed weight to spine
    shirt = keep["kit_shirt"]
    x0 = 0.070 * factor
    x1 = 0.150 * factor
    arm_group_ids = {
        g.index for g in shirt.vertex_groups if g.name.startswith(("upper_arm", "forearm"))
    }
    spine_group = shirt.vertex_groups.get("spine") or shirt.vertex_groups.new(name="spine")
    for v in shirt.data.vertices:
        t = (abs(v.co.x) - x0) / (x1 - x0)
        t = max(0.0, min(1.0, t))
        if t >= 1.0:
            continue
        removed = 0.0
        for ge in v.groups:
            if ge.group in arm_group_ids:
                removed += ge.weight * (1.0 - t)
                ge.weight *= t
        if removed > 0:
            spine_group.add([v.index], removed, "ADD")

    # the shirt must not follow the legs either — transferred thigh weights on
    # the hem dragged red streaks over the shorts during kicks
    leg_group_ids = {
        g.index for g in shirt.vertex_groups if g.name.startswith(("thigh", "shin", "foot"))
    }
    hips_on_shirt = shirt.vertex_groups.get("hips") or shirt.vertex_groups.new(name="hips")
    for v in shirt.data.vertices:
        removed = 0.0
        for ge in v.groups:
            if ge.group in leg_group_ids:
                removed += ge.weight
                ge.weight = 0.0
        if removed > 0:
            hips_on_shirt.add([v.index], removed, "ADD")

    # the hem leans toward the pelvis (60%) so it stays near the shorts
    # waistband on a spine lean without going fully rigid — a hard pin made
    # the leaning belly punch through the taut shirt front instead
    hem_top = 0.395 * factor
    hem_bottom = 0.355 * factor
    for v in shirt.data.vertices:
        if v.co.z >= hem_top:
            continue
        t = 0.6 * min(1.0, (hem_top - v.co.z) / (hem_top - hem_bottom))
        for ge in v.groups:
            ge.weight *= 1.0 - t
        hips_on_shirt.add([v.index], t, "ADD")

    # shorts: positional weights — pelvis above the crotch, thighs below, so
    # tucked legs (jump) and kicks carry the shorts legs along
    shorts = keep["kit_shorts"]
    for group in list(shorts.vertex_groups):
        shorts.vertex_groups.remove(group)
    hips_on_shorts = shorts.vertex_groups.new(name="hips")
    spine_on_shorts = shorts.vertex_groups.new(name="spine")
    thigh_l_group = shorts.vertex_groups.new(name="thigh_l")
    thigh_r_group = shorts.vertex_groups.new(name="thigh_r")
    crotch_z = 0.335 * factor
    blend_band = 0.05 * factor
    waist_z = 0.375 * factor
    for v in shorts.data.vertices:
        t = (crotch_z - v.co.z) / blend_band
        t = max(0.0, min(1.0, t))
        if t <= 0.0:
            # waistband picks up some spine so it leans with the shirt hem
            spine_share = 0.3 if v.co.z >= waist_z else 0.0
            hips_on_shorts.add([v.index], 1.0 - spine_share, "REPLACE")
            if spine_share > 0.0:
                spine_on_shorts.add([v.index], spine_share, "REPLACE")
            continue
        side = thigh_l_group if v.co.x >= 0 else thigh_r_group
        hips_on_shorts.add([v.index], 1.0 - t, "REPLACE")
        side.add([v.index], t, "REPLACE")

    # verts the transfer missed (collar rim etc.) have no weights at all and
    # stay behind on translation keys — pin them to the torso
    orphan_group = shirt.vertex_groups.get("spine") or shirt.vertex_groups.new(name="spine")
    orphans = [v.index for v in shirt.data.vertices if sum(ge.weight for ge in v.groups) < 0.05]
    if orphans:
        orphan_group.add(orphans, 1.0, "REPLACE")
        print(f"kit_shirt: pinned {len(orphans)} orphan verts to spine")

    # heat/transferred weights don't always sum to 1 per vertex, which makes
    # translation keys (the cheer hop) tear cloth away from the skin
    for obj in (body, keep["kit_shirt"], keep["kit_shorts"]):
        for v in obj.data.vertices:
            total = sum(ge.weight for ge in v.groups)
            if total > 1e-6 and abs(total - 1.0) > 1e-4:
                for ge in v.groups:
                    ge.weight /= total

    # rigid attachments: full weight to one bone
    rigid = {"head": [], "foot_l": [], "foot_r": []}
    for name, obj in keep.items():
        if name.startswith(("hair", "eye_")):
            rigid["head"].append(obj)
    rigid["foot_l"] = [keep["boot_l"], keep["sole_l"]]
    rigid["foot_r"] = [keep["boot_r"], keep["sole_r"]]
    rigid["ball_anchor"] = [keep["ball"]]
    for bone_name, objs in rigid.items():
        for obj in objs:
            group = obj.vertex_groups.new(name=bone_name)
            group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
            modifier = obj.modifiers.new("Armature", "ARMATURE")
            modifier.object = arm_obj
            obj.parent = arm_obj


def author_clips(arm_obj):
    """Keyframe idle / walk / cheer loops directly on the pose bones."""
    scene = bpy.context.scene
    scene.render.fps = 30
    pose = arm_obj.pose.bones
    for b in pose:
        b.rotation_mode = "XYZ"
    arm_obj.animation_data_create()

    def key(name, frame, rot=None, loc=None):
        b = pose[name]
        if rot is not None:
            b.rotation_euler = rot
            b.keyframe_insert("rotation_euler", frame=frame)
        if loc is not None:
            b.location = loc
            b.keyframe_insert("location", frame=frame)

    def reset_pose():
        for b in pose:
            b.rotation_euler = (0, 0, 0)
            b.location = (0, 0, 0)

    actions = []

    # ---- idle: soft breathing, 2s loop ----
    act = bpy.data.actions.new("idle")
    arm_obj.animation_data.action = act
    reset_pose()
    for frame, amp in ((1, 0.0), (30, 1.0), (60, 0.0)):
        key("spine", frame, rot=(0.05 * amp, 0, 0))
        key("head", frame, rot=(-0.06 * amp, 0, 0))
        key("upper_arm_l", frame, rot=(0.06 * amp, 0, 0))
        key("upper_arm_r", frame, rot=(0.06 * amp, 0, 0))
        key("hips", frame, loc=(0, -0.012 * amp, 0))
    actions.append(act)

    # ---- walk: 1s toddle loop (forward = -X rotation on down bones) ----
    act = bpy.data.actions.new("walk")
    arm_obj.animation_data.action = act
    reset_pose()
    swing, shin_bend, arm_swing = 0.55, 0.7, 0.42
    for frame, s in ((1, 1.0), (8, 0.0), (15, -1.0), (22, 0.0), (30, 1.0)):
        key("thigh_l", frame, rot=(-swing * s, 0, 0))
        key("thigh_r", frame, rot=(swing * s, 0, 0))
        key("shin_l", frame, rot=(shin_bend * max(0.0, s), 0, 0))
        key("shin_r", frame, rot=(shin_bend * max(0.0, -s), 0, 0))
        key("upper_arm_l", frame, rot=(arm_swing * s, 0, 0))
        key("upper_arm_r", frame, rot=(-arm_swing * s, 0, 0))
        bob = 0.05 if s == 0.0 else 0.0
        key("hips", frame, loc=(0, bob, 0))
        key("spine", frame, rot=(0.06, 0, 0))
    actions.append(act)

    # ---- cheer: arms up + hops, 1.6s loop ----
    # A-pose arms point diagonally down; local Z rotation swings them within
    # the body plane (jumping-jack raise) instead of pushing them forward.
    act = bpy.data.actions.new("cheer")
    arm_obj.animation_data.action = act
    reset_pose()
    up = 1.45
    for frame, hop, wave in ((1, 0.0, 0.1), (12, 1.0, -0.1), (24, 0.0, 0.1), (36, 1.0, -0.1), (48, 0.0, 0.1)):
        key("upper_arm_l", frame, rot=(0, 0, -(up + wave)))
        key("upper_arm_r", frame, rot=(0, 0, up + wave))
        key("forearm_l", frame, rot=(0, 0, -0.15))
        key("forearm_r", frame, rot=(0, 0, 0.15))
        key("head", frame, rot=(0.12 * hop, 0, 0))
        key("hips", frame, loc=(0, 0.14 * hop, 0))
    actions.append(act)

    # ---- run: fast stride with airborne phases and pumping bent arms ----
    act = bpy.data.actions.new("run")
    arm_obj.animation_data.action = act
    reset_pose()
    run_poses = (
        # frame, stride(-1..1), hips_up
        (1, 1.0, -0.03),
        (5, 0.0, 0.14),
        (10, -1.0, -0.03),
        (15, 0.0, 0.14),
        (20, 1.0, -0.03),
    )
    for frame, s, hips_up in run_poses:
        key("thigh_l", frame, rot=(-0.95 * s if s >= 0 else 0.7 * -s, 0, 0))
        key("thigh_r", frame, rot=(0.7 * s if s >= 0 else -0.95 * -s, 0, 0))
        key("shin_l", frame, rot=((0.15 if s > 0 else 1.25 if s < 0 else 0.65), 0, 0))
        key("shin_r", frame, rot=((1.25 if s > 0 else 0.15 if s < 0 else 0.65), 0, 0))
        key("upper_arm_l", frame, rot=(0.6 * s, 0, 0))
        key("upper_arm_r", frame, rot=(-0.6 * s, 0, 0))
        key("forearm_l", frame, rot=(-0.75, 0, 0))
        key("forearm_r", frame, rot=(-0.75, 0, 0))
        key("spine", frame, rot=(0.1, 0, 0))
        key("head", frame, rot=(-0.06, 0, 0))
        key("hips", frame, loc=(0, hips_up, 0))
    actions.append(act)

    # ---- kick: wind-up, strike, ball flies off; loop resets the ball ----
    act = bpy.data.actions.new("kick")
    arm_obj.animation_data.action = act
    reset_pose()
    kick_poses = (
        # frame, thigh_r, shin_r, spine, arm_l, arm_r, head
        (1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
        (6, 0.85, 0.95, 0.14, -0.55, 0.5, 0.06),
        (10, -1.15, 0.12, -0.1, 0.45, -0.5, -0.04),
        (16, -1.3, 0.05, -0.12, 0.55, -0.6, -0.1),
        (26, -0.35, 0.15, -0.04, 0.2, -0.2, -0.06),
        (40, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
    )
    for frame, thigh_r, shin_r, spine, arm_l, arm_r, head in kick_poses:
        key("thigh_r", frame, rot=(thigh_r, 0, 0))
        key("shin_r", frame, rot=(shin_r, 0, 0))
        key("spine", frame, rot=(spine, 0, 0))
        key("upper_arm_l", frame, rot=(arm_l, 0, 0))
        key("upper_arm_r", frame, rot=(arm_r, 0, 0))
        key("head", frame, rot=(head, 0, 0))
        key("thigh_l", frame, rot=(-0.05 if frame in (6, 10, 16) else 0.0, 0, 0))
        key("shin_l", frame, rot=(0.1 if frame in (6, 10, 16) else 0.0, 0, 0))
    # ball: sits at the foot until impact (f10), then a forward arc
    # (bone local axes: y = up, z = forward)
    ball_path = (
        (1, (0.0, 0.0, 0.0), 0.0),
        (9, (0.0, 0.0, 0.0), 0.0),
        (13, (0.0, 0.4, 0.9), -2.0),
        (18, (0.0, 1.0, 2.4), -5.5),
        (24, (0.0, 0.75, 4.2), -9.0),
        (30, (0.0, 0.1, 6.2), -12.5),
        (40, (0.0, 0.1, 6.2), -12.5),
    )
    for frame, loc, spin in ball_path:
        key("ball_anchor", frame, rot=(spin, 0, 0), loc=loc)
    actions.append(act)

    # ---- jump: crouch, leap with tucked legs, land, recover ----
    act = bpy.data.actions.new("jump")
    arm_obj.animation_data.action = act
    reset_pose()
    jump_poses = (
        # frame, hips_up, thigh, shin, spine, arms
        (1, 0.0, 0.0, 0.0, 0.0, 0.0),
        (6, -0.25, -0.55, 0.85, 0.16, 0.65),
        (12, 0.55, -0.35, 0.55, -0.04, -0.9),
        (16, 0.72, -0.75, 1.0, -0.08, -1.1),
        (22, 0.28, -0.15, 0.25, 0.0, -0.35),
        (26, -0.2, -0.5, 0.8, 0.14, 0.3),
        (33, -0.04, -0.1, 0.15, 0.04, 0.05),
        (40, 0.0, 0.0, 0.0, 0.0, 0.0),
    )
    for frame, hips_up, thigh, shin, spine, arms in jump_poses:
        key("hips", frame, loc=(0, hips_up, 0))
        key("thigh_l", frame, rot=(thigh, 0, 0))
        key("thigh_r", frame, rot=(thigh, 0, 0))
        key("shin_l", frame, rot=(shin, 0, 0))
        key("shin_r", frame, rot=(shin, 0, 0))
        key("spine", frame, rot=(spine, 0, 0))
        key("upper_arm_l", frame, rot=(arms, 0, 0))
        key("upper_arm_r", frame, rot=(arms, 0, 0))
    actions.append(act)

    # stash every clip on the NLA so the glTF exporter emits one animation each
    arm_obj.animation_data.action = None
    for act in actions:
        act.use_fake_user = True
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, 1, act)
    return actions


def tuck_body_under_clothes(body, garments, inset, max_pierce):
    """Push body vertices that poke through a garment back inside it.

    The kit is cut for Colin, so on another build (Chloe's bust and hips) the
    skin pierces the shirt and shows up as pale blotches over the sponsor. We
    keep the loose jersey silhouette and move only the offending skin vertices
    just inside the cloth surface.
    """
    from mathutils.bvhtree import BVHTree

    moved = 0
    for garment in garments:
        mesh = garment.data
        verts = [v.co.copy() for v in mesh.vertices]
        polys = [tuple(p.vertices) for p in mesh.polygons]
        bvh = BVHTree.FromPolygons(verts, polys, all_triangles=False)
        (_, _), (_, _), (gzmin, gzmax) = mesh_bounds(garment)
        for v in body.data.vertices:
            if not (gzmin - 0.01 <= v.co.z <= gzmax + 0.01):
                continue
            location, normal, _, distance = bvh.find_nearest(v.co)
            if location is None or distance is None:
                continue
            # Limbs stick far out of their openings on purpose — only skin that
            # barely pierces the shell is a fit artifact worth pushing back.
            if distance > max_pierce:
                continue
            # positive dot => the skin sits outside the cloth shell
            if (v.co - location).dot(normal) <= 0:
                continue
            v.co = location - normal * inset
            moved += 1
    if moved:
        print(f"tucked {moved} body verts under the kit")


def main(character_key):
    character = CHARACTERS[character_key]
    glb_path = PUBLIC / character["glb"]
    body_prefix = character["body_prefix"]
    hair_prefix = character["hair_prefix"]
    hair_combos = character["hair_combos"]

    bpy.ops.wm.read_factory_settings(use_empty=True)

    import_fbx(character["body_fbx"])
    import_fbx(character["hair_fbx"])
    import_fbx(CLOTHES_FBX)

    meshes = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
    for obj in meshes.values():
        bake_world_transform(obj)
    empties = [o for o in bpy.data.objects if o.type != "MESH"]
    for obj in meshes.values():
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
    delete_objects(empties)

    keep = {}

    keep["body"] = meshes[f"{body_prefix}_body"]
    keep["eye_ball_l"] = meshes[f"{body_prefix}_eyes_L_ball"]
    keep["eye_ball_r"] = meshes[f"{body_prefix}_eyes_R_ball"]
    keep["eye_cover_l"] = meshes[f"{body_prefix}_eyes_L_cover"]
    keep["eye_cover_r"] = meshes[f"{body_prefix}_eyes_R_cover"]

    if character["has_hair_base"]:
        keep["hair_base"] = meshes[f"{hair_prefix}_base_01"]
    keep["hair_side"] = meshes[f"{hair_prefix}_side_01"]
    keep["hair_eyebrows"] = meshes[f"{hair_prefix}_eyebrows"]
    for style, (bangs_i, back_i) in hair_combos.items():
        keep[f"hair_style_{style}_bangs"] = meshes[f"{hair_prefix}_bangs_{bangs_i:02d}"]
        keep[f"hair_style_{style}_back"] = meshes[f"{hair_prefix}_back_{back_i:02d}"]

    keep["kit_shirt"] = meshes["Colin_Tshirt_slim"]
    keep["kit_shorts"] = meshes["Colin_shorts_slim_clothes"]

    for new_name, obj in keep.items():
        obj.name = new_name
    delete_objects([o for o in meshes.values() if o not in keep.values()])


    # ---- materials -------------------------------------------------------
    mat_skin = make_material("CHAR_SKIN", (1, 1, 1), roughness=0.72, texture=character["texture"])
    mat_iris = make_material("CHAR_IRIS", (1, 1, 1), roughness=0.35, texture=character["texture"])
    mat_cover = make_material("CHAR_EYE_HIGHLIGHT", (1, 1, 1), roughness=0.06, alpha=0.14)
    mat_hair = make_material("CHAR_HAIR", (0.16, 0.10, 0.09), roughness=0.62)
    mat_kit = make_material("KIT_ATLAS", (1, 1, 1), roughness=0.78)
    mat_boot = make_material("KIT_BOOTS", (0.06, 0.075, 0.11), roughness=0.55)
    mat_sole = make_material("KIT_SOLE", (0.95, 0.94, 0.9), roughness=0.7)
    mat_ball_white = make_material("BALL_WHITE", (0.93, 0.93, 0.9), roughness=0.5)
    mat_ball_dark = make_material("BALL_DARK", (0.05, 0.05, 0.06), roughness=0.5)

    assign_material(keep["body"], mat_skin)
    assign_material(keep["eye_ball_l"], mat_iris)
    assign_material(keep["eye_ball_r"], mat_iris)
    assign_material(keep["eye_cover_l"], mat_cover)
    assign_material(keep["eye_cover_r"], mat_cover)
    for name, obj in keep.items():
        if name.startswith("hair"):
            assign_material(obj, mat_hair)
    assign_material(keep["kit_shirt"], mat_kit)
    assign_material(keep["kit_shorts"], mat_kit)

    # ---- kit atlas UVs ---------------------------------------------------
    # Bake UVs on the original Colin cut: the region classifier reads mesh
    # proportions, and a shrink-wrapped shirt has different ones (thinner
    # sleeves pushed torso faces into the sleeve strip). UVs ride along with
    # the vertices, so refitting afterwards keeps the exact same layout.
    remap_shirt(keep["kit_shirt"])
    remap_shorts(keep["kit_shorts"])

    if character["tuck_body"]:
        tuck_body_under_clothes(
            keep["body"],
            [keep["kit_shirt"], keep["kit_shorts"]],
            inset=0.004,
            max_pierce=0.018,
        )
    # The shorts waistband is cut wider than the shirt hem, so a slab of shorts
    # pokes through the jersey at the hip on every build. Same treatment.
    tuck_body_under_clothes(
        keep["kit_shorts"], [keep["kit_shirt"]], inset=0.003, max_pierce=0.02
    )

    # ---- boots -----------------------------------------------------------
    body = keep["body"]
    foot_verts = [v.co for v in body.data.vertices if v.co.z < 0.05]
    left = [c for c in foot_verts if c.x > 0]
    right = [c for c in foot_verts if c.x < 0]
    lx = sum(c.x for c in left) / len(left)
    rx = sum(c.x for c in right) / len(right)
    fy = sum(c.y for c in foot_verts) / len(foot_verts)
    keep["boot_l"] = build_boot("boot_l", lx, fy, mat_boot)
    keep["boot_r"] = build_boot("boot_r", rx, fy, mat_boot)
    keep["sole_l"] = build_sole("sole_l", lx, fy, mat_sole)
    keep["sole_r"] = build_sole("sole_r", rx, fy, mat_sole)

    # ---- normalize scale to lab units -----------------------------------
    (_, _), (_, _), (zmin, zmax) = mesh_bounds(body)
    factor = TARGET_HEIGHT / (zmax - zmin)
    scale_mtx = Matrix.Scale(factor, 4)
    for obj in keep.values():
        obj.data.transform(scale_mtx)

    print(f"scale factor={factor:.4f} height={(zmax - zmin) * factor:.3f}")
    total_polys = sum(len(o.data.polygons) for o in keep.values())
    print(f"export meshes={len(keep)} polys={total_polys}")

    # ---- ball + rig + animation clips -----------------------------------
    keep["ball"] = build_ball(mat_ball_white, mat_ball_dark, rx, fy, factor)
    keep["ball"].hide_render = True  # visible only in the kick pose stills
    arm_obj = build_rig(keep, lx, rx, fy, factor)
    skin_meshes(keep, arm_obj, factor)
    author_clips(arm_obj)
    # keep stashed tracks from posing the rest state
    for track in arm_obj.animation_data.nla_tracks:
        track.mute = True

    # ---- preview renders (Arsenal home) ---------------------------------
    preview = sorted(KITS_DIR.glob(f"{PREVIEW_KIT}.r*.png"))
    if preview:
        img = bpy.data.images.load(str(preview[0]))
        tex = mat_kit.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = img
        principled = mat_kit.node_tree.nodes.get("Principled BSDF")
        mat_kit.node_tree.links.new(tex.outputs["Color"], principled.inputs["Base Color"])

        scene = bpy.context.scene
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "TEXTURE"
        scene.render.resolution_x = 640
        scene.render.resolution_y = 860

        cam_data = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", cam_data)
        scene.collection.objects.link(cam)
        scene.camera = cam
        center = Vector((0, 0, TARGET_HEIGHT * 0.48))
        dist = TARGET_HEIGHT * 1.75

        default_style = "bob"
        for name, obj in keep.items():
            if name.startswith("hair_style_"):
                obj.hide_render = not name.startswith(f"hair_style_{default_style}_")

        views = {
            "front": Vector((0, -1, 0.18)),
            "back": Vector((0, 1, 0.18)),
            "three-quarter": Vector((-0.75, -1, 0.22)),
        }
        for label, direction in views.items():
            cam.location = center + direction.normalized() * dist
            fwd = (center - cam.location).normalized()
            cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str(OUT / f"{character_key}-arsenal-{label}.png")
            bpy.ops.render.render(write_still=True)

        # per-style sheet for the record
        for style in hair_combos:
            for name, obj in keep.items():
                if name.startswith("hair_style_"):
                    obj.hide_render = not name.startswith(f"hair_style_{style}_")
            cam.location = center + views["front"].normalized() * dist
            fwd = (center - cam.location).normalized()
            cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str(OUT / f"{character_key}-style-{style}.png")
            bpy.ops.render.render(write_still=True)

        # animation pose stills (deform + sign check)
        for name, obj in keep.items():
            if name.startswith("hair_style_"):
                obj.hide_render = not name.startswith(f"hair_style_{default_style}_")
        cam.location = center + Vector((-0.4, -1, 0.16)).normalized() * dist
        fwd = (center - cam.location).normalized()
        cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
        anim_checks = (
            ("walk", (1, 8, 15)),
            ("run", (1, 5, 10)),
            ("cheer", (1, 12)),
            ("kick", (6, 10, 18)),
            ("jump", (6, 16, 26)),
        )
        for clip_name, frames in anim_checks:
            keep["ball"].hide_render = clip_name != "kick"
            arm_obj.animation_data.action = bpy.data.actions[clip_name]
            for frame in frames:
                scene.frame_set(frame)
                scene.render.filepath = str(OUT / f"{character_key}-anim-{clip_name}-f{frame}.png")
                bpy.ops.render.render(write_still=True)
        arm_obj.animation_data.action = None
        scene.frame_set(1)

        # strip preview texture so the GLB ships with a clean white atlas slot
        mat_kit.node_tree.links.remove(tex.outputs["Color"].links[0])
        mat_kit.node_tree.nodes.remove(tex)
        principled.inputs["Base Color"].default_value = (1, 1, 1, 1)

    # ---- export ----------------------------------------------------------
    bpy.ops.object.select_all(action="DESELECT")
    for obj in keep.values():
        obj.hide_render = False
        obj.hide_set(False)
        obj.select_set(True)
    arm_obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
    )
    size_kb = glb_path.stat().st_size / 1024
    print(f"EXPORTED {glb_path.name} {size_kb:.0f}KB")


if __name__ == "__main__":
    requested = sys.argv[-1] if sys.argv[-1] in {*CHARACTERS, "all"} else "colin"
    for key in (CHARACTERS if requested == "all" else [requested]):
        print(f"--- building {key} ---")
        main(key)
