"""Build the athletic football avatar GLB from the Quaternius Universal Base
Characters pack (CC0) and project it into the existing 11-region kit atlas.

Run headless (no Blender app needed):
    py -V:3.11 -m pip install bpy
    py -V:3.11 scripts/avatar3d/generate_athletic_avatar.py

Inputs  (gitignored, see design-references/avatar3d/ubc/SOURCE.txt):
    design-references/avatar3d/ubc/body/Superhero_Male_FullBody.gltf
    design-references/avatar3d/ubc/hair/Hair_*.gltf   (rigged to Head bone)
    design-references/avatar3d/ubc/textures/T_Superhero_Male_Ligh.png

Output (committed):
    public/metaverse/avatar3d/athletic-v1.glb

Contract kept with the chibi pipeline:
    - garment meshes named torso_mesh / jersey_sleeve_l|r / waist_mesh /
      thigh_mesh_l|r / shin_mesh_l|r carrying the KIT_ATLAS material with
      box-projected UVs into ATLAS_REGIONS
    - collar variants collar_left|right / kit_collar_crew / kit_collar_polo_l|r
    - KIT_BOOTS / KIT_SOLE materials, kick_contact_* / finesse_contact_* sockets
    - appearance materials CHAR_SKIN / CHAR_HAIR / CHAR_IRIS (runtime tints)
    - hairstyle meshes hair_style_<key>_main toggled by the runtime
"""

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "design-references" / "avatar3d" / "ubc"
PUBLIC_DIR = ROOT / "public" / "metaverse" / "avatar3d"
GLB_PATH = PUBLIC_DIR / "athletic-v1.glb"

BODY_GLTF = SOURCE_DIR / "body" / "Superhero_Male_FullBody.gltf"
LIGHT_SKIN_TEXTURE = SOURCE_DIR / "textures" / "T_Superhero_Male_Ligh.png"
HAIR_DIR = SOURCE_DIR / "hair"
HAIR_STYLES = {
    "buzzed": "Hair_Buzzed.gltf",
    "parted": "Hair_SimpleParted.gltf",
    "long": "Hair_Long.gltf",
    "buns": "Hair_Buns.gltf",
}

ATLAS_SIZE = 512
ATLAS_REGIONS = {
    "front": (0, 0, 192, 256),
    "back": (192, 0, 192, 256),
    "sleeve_l": (384, 0, 64, 128),
    "sleeve_r": (448, 0, 64, 128),
    "waist": (384, 128, 128, 128),
    "shorts_l": (0, 256, 128, 192),
    "shorts_r": (128, 256, 128, 192),
    "socks_l": (256, 256, 64, 192),
    "socks_r": (320, 256, 64, 192),
    "collar": (384, 256, 64, 64),
    "cuffs": (448, 256, 64, 64),
}

TORSO_GROUPS = {"spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r"}
SLEEVE_GROUPS = {"l": {"upperarm_l"}, "r": {"upperarm_r"}}
WAIST_GROUPS = {"pelvis"}
THIGH_GROUPS = {"l": {"thigh_l"}, "r": {"thigh_r"}}
SHIN_GROUPS = {"l": {"calf_l"}, "r": {"calf_r"}}
FOOT_GROUPS = {"foot_l", "foot_r", "ball_l", "ball_r", "ball_leaf_l", "ball_leaf_r"}

SHIRT_NECK_LIMIT = 1.56
SLEEVE_BOTTOM = 1.27
SHORTS_BOTTOM = 0.68
SOCKS_TOP = 0.50
SOCKS_BOTTOM = 0.04
ARM_DROP_DEGREES = 72.0
FOREARM_DROP_DEGREES = 8.0
GARMENT_THICKNESS = 0.011


def deselect_all():
    bpy.ops.object.select_all(action="DESELECT")


def activate(obj):
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def scene_meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def find_armature():
    for o in bpy.context.scene.objects:
        if o.type == "ARMATURE":
            return o
    raise RuntimeError("No armature in scene")


def import_gltf(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.context.scene.objects if o not in before]


def atlas_uv_rect(region_name):
    x, y, width, height = ATLAS_REGIONS[region_name]
    return (
        x / ATLAS_SIZE,
        1.0 - (y + height) / ATLAS_SIZE,
        (x + width) / ATLAS_SIZE,
        1.0 - y / ATLAS_SIZE,
    )


def assign_atlas_uv(obj, front_region, back_region=None):
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="KIT_UV_V1")
    uv_layer = mesh.uv_layers.active.data
    xs = [vertex.co.x for vertex in mesh.vertices]
    zs = [vertex.co.z for vertex in mesh.vertices]
    min_x, max_x = min(xs), max(xs)
    min_z, max_z = min(zs), max(zs)
    span_x = max(max_x - min_x, 0.0001)
    span_z = max(max_z - min_z, 0.0001)

    for polygon in mesh.polygons:
        region = back_region if back_region and polygon.normal.y > 0.35 else front_region
        u0, v0, u1, v1 = atlas_uv_rect(region)
        for loop_index in polygon.loop_indices:
            coordinate = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            normalized_x = (coordinate.x - min_x) / span_x
            normalized_z = (coordinate.z - min_z) / span_z
            uv_layer[loop_index].uv = (
                u0 + normalized_x * (u1 - u0),
                v0 + normalized_z * (v1 - v0),
            )


def make_material(name, color, roughness=0.82):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def dominant_group_names(obj):
    """Per-face name of the strongest vertex group, averaged over the face."""
    index_to_name = {g.index: g.name for g in obj.vertex_groups}
    vertex_weights = []
    for vertex in obj.data.vertices:
        weights = {}
        for element in vertex.groups:
            name = index_to_name.get(element.group)
            if name:
                weights[name] = weights.get(name, 0.0) + element.weight
        vertex_weights.append(weights)
    face_names = []
    for polygon in obj.data.polygons:
        totals = {}
        for vertex_index in polygon.vertices:
            for name, weight in vertex_weights[vertex_index].items():
                totals[name] = totals.get(name, 0.0) + weight
    # noqa: prefer clarity over micro-optimizing this offline script
        face_names.append(max(totals, key=totals.get) if totals else "")
    return face_names


def duplicate_faces(body, keep_face_indices, name):
    activate(body)
    bpy.ops.object.duplicate()
    garment = bpy.context.view_layer.objects.active
    garment.name = name
    garment.data = garment.data.copy()
    garment.data.name = name
    keep = set(keep_face_indices)
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(garment.data)
    bm.faces.ensure_lookup_table()
    doomed = [face for face in bm.faces if face.index not in keep]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(garment.data)
    bm.free()
    return garment


def solidify(obj, thickness):
    activate(obj)
    modifier = obj.modifiers.new("shell", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = 1.0
    modifier.use_rim = True
    while obj.modifiers[0] != modifier:
        bpy.ops.object.modifier_move_up(modifier=modifier.name)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def set_single_material(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)


def face_center_z(mesh, polygon):
    return sum(mesh.vertices[v].co.z for v in polygon.vertices) / len(polygon.vertices)


def face_center_x(mesh, polygon):
    return sum(mesh.vertices[v].co.x for v in polygon.vertices) / len(polygon.vertices)


def pose_arms_down(armature):
    activate(armature)
    bpy.ops.object.mode_set(mode="POSE")
    for side, sign in (("l", 1.0), ("r", -1.0)):
        for bone_name, degrees in (
            (f"upperarm_{side}", ARM_DROP_DEGREES),
            (f"lowerarm_{side}", FOREARM_DROP_DEGREES),
        ):
            pose_bone = armature.pose.bones[bone_name]
            head = armature.matrix_world @ pose_bone.head
            rotation = (
                Matrix.Translation(head)
                @ Matrix.Rotation(math.radians(sign * degrees), 4, "Y")
                @ Matrix.Translation(-head)
            )
            pose_bone.matrix = rotation @ pose_bone.matrix
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")


def apply_pose_as_rest(armature):
    for obj in scene_meshes():
        armature_modifiers = [m for m in obj.modifiers if m.type == "ARMATURE"]
        if not armature_modifiers:
            continue
        activate(obj)
        for modifier in armature_modifiers:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = armature
    activate(armature)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def bind_to_armature(obj, armature, weight_group=None):
    if weight_group is not None:
        group = obj.vertex_groups.new(name=weight_group)
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature


def add_collar_meshes(armature, kit_atlas_material):
    """Simple collar variants near the neckline; front faces -Y."""
    collars = []

    def register(obj, name):
        obj.name = name
        obj.data.name = name
        set_single_material(obj, kit_atlas_material)
        assign_atlas_uv(obj, "collar")
        bind_to_armature(obj, armature, weight_group="spine_03")
        collars.append(obj)

    bpy.ops.mesh.primitive_torus_add(
        location=(0, 0.005, 1.535),
        rotation=(math.radians(8), 0, 0),
        major_radius=0.078,
        minor_radius=0.014,
        major_segments=24,
        minor_segments=8,
    )
    register(bpy.context.view_layer.objects.active, "kit_collar_crew")

    for suffix, sign in (("left", 1.0), ("right", -1.0)):
        bpy.ops.mesh.primitive_cube_add(location=(sign * 0.045, -0.062, 1.522))
        collar_half = bpy.context.view_layer.objects.active
        collar_half.scale = (0.052, 0.012, 0.016)
        collar_half.rotation_euler = (0, math.radians(-sign * 35), math.radians(sign * 12))
        activate(collar_half)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        register(collar_half, f"collar_{suffix}")

    for suffix, sign in (("l", 1.0), ("r", -1.0)):
        bpy.ops.mesh.primitive_cube_add(location=(sign * 0.052, -0.058, 1.545))
        polo_half = bpy.context.view_layer.objects.active
        polo_half.scale = (0.045, 0.01, 0.026)
        polo_half.rotation_euler = (math.radians(12), 0, math.radians(-sign * 18))
        activate(polo_half)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        register(polo_half, f"kit_collar_polo_{suffix}")

    return collars


def add_soles(armature, sole_material):
    for suffix, sign in (("l", 1.0), ("r", -1.0)):
        bpy.ops.mesh.primitive_cube_add(location=(sign * 0.114, 0.01, 0.012))
        sole = bpy.context.view_layer.objects.active
        sole.scale = (0.075, 0.155, 0.014)
        activate(sole)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        sole.name = f"kit_sole_{suffix}"
        sole.data.name = sole.name
        set_single_material(sole, sole_material)
        assign_atlas_uv(sole, "cuffs")
        bind_to_armature(sole, armature, weight_group=f"foot_{suffix}")


def add_contact_sockets(armature):
    for suffix, sign in (("l", 1.0), ("r", -1.0)):
        for name, offset in (
            (f"kick_contact_{suffix}", Vector((sign * 0.114, -0.11, 0.07))),
            (f"finesse_contact_{suffix}", Vector((sign * 0.06, -0.05, 0.05))),
        ):
            empty = bpy.data.objects.new(name, None)
            empty.empty_display_size = 0.03
            bpy.context.collection.objects.link(empty)
            empty.parent = armature
            empty.parent_type = "BONE"
            empty.parent_bone = f"foot_{suffix}"
            empty.matrix_world = Matrix.Translation(offset)


def swap_base_color_image(material, image_path):
    image = bpy.data.images.load(str(image_path))
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.outputs["Color"].links:
            for link in node.outputs["Color"].links:
                if link.to_socket.name == "Base Color":
                    node.image = image
                    return
    raise RuntimeError(f"No base color image node on {material.name}")


def rename_material(old_prefix, new_name):
    for material in bpy.data.materials:
        if material.name == old_prefix or material.name.startswith(f"{old_prefix}."):
            material.name = new_name
            return material
    raise RuntimeError(f"Material not found: {old_prefix}")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_gltf(BODY_GLTF)

    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)

    armature = find_armature()
    armature.name = "avatar_rig"

    body = bpy.data.objects["SuperHero_Male"]
    body.name = "body_mesh"
    eyes = bpy.data.objects["Eyes"]
    eyebrows = bpy.data.objects["Eyebrows"]

    skin_material = rename_material("MI_Superhero_Male", "CHAR_SKIN")
    swap_base_color_image(skin_material, LIGHT_SKIN_TEXTURE)
    iris_material = rename_material("MI_Eyes", "CHAR_IRIS")
    hair_material = rename_material("MI_Hair_1", "CHAR_HAIR")
    del iris_material

    for style_key, filename in HAIR_STYLES.items():
        imported = import_gltf(HAIR_DIR / filename)
        meshes = [o for o in imported if o.type == "MESH"]
        extra_armatures = [o for o in imported if o.type == "ARMATURE"]
        if len(meshes) != 1:
            raise RuntimeError(f"Expected one hair mesh in {filename}, got {len(meshes)}")
        hair = meshes[0]
        if "Head" not in {g.name for g in hair.vertex_groups}:
            raise RuntimeError(f"Hair {filename} is not rigged to the Head bone")
        hair.name = f"hair_style_{style_key}_main"
        hair.data.name = hair.name
        activate(hair)
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        for modifier in list(hair.modifiers):
            if modifier.type == "ARMATURE":
                hair.modifiers.remove(modifier)
        bind_to_armature(hair, armature)
        set_single_material(hair, hair_material)
        for doomed in extra_armatures:
            bpy.data.objects.remove(doomed, do_unlink=True)
    set_single_material(eyebrows, hair_material)

    pose_arms_down(armature)
    apply_pose_as_rest(armature)

    kit_atlas_material = make_material("KIT_ATLAS", (0.78, 0.11, 0.18))
    boots_material = make_material("KIT_BOOTS", (0.08, 0.09, 0.13))
    sole_material = make_material("KIT_SOLE", (0.84, 0.85, 0.87))

    dominant = dominant_group_names(body)
    mesh = body.data

    def faces(predicate):
        return [p.index for p in mesh.polygons if predicate(p)]

    torso_faces = faces(
        lambda p: dominant[p.index] in TORSO_GROUPS and face_center_z(mesh, p) <= SHIRT_NECK_LIMIT
    )
    garments = [(duplicate_faces(body, torso_faces, "torso_mesh"), "front", "back")]

    for side in ("l", "r"):
        sleeve_faces = faces(
            lambda p: dominant[p.index] in SLEEVE_GROUPS[side]
            and face_center_z(mesh, p) >= SLEEVE_BOTTOM
        )
        garments.append(
            (duplicate_faces(body, sleeve_faces, f"jersey_sleeve_{side}"), f"sleeve_{side}", None)
        )

    waist_faces = faces(lambda p: dominant[p.index] in WAIST_GROUPS)
    garments.append((duplicate_faces(body, waist_faces, "waist_mesh"), "waist", None))

    for side in ("l", "r"):
        thigh_faces = faces(
            lambda p: dominant[p.index] in THIGH_GROUPS[side]
            and face_center_z(mesh, p) >= SHORTS_BOTTOM
        )
        garments.append(
            (duplicate_faces(body, thigh_faces, f"thigh_mesh_{side}"), f"shorts_{side}", None)
        )

    for side in ("l", "r"):
        shin_faces = faces(
            lambda p: dominant[p.index] in SHIN_GROUPS[side]
            and SOCKS_BOTTOM <= face_center_z(mesh, p) <= SOCKS_TOP
        )
        garments.append(
            (duplicate_faces(body, shin_faces, f"shin_mesh_{side}"), f"socks_{side}", None)
        )

    boot_faces = faces(lambda p: dominant[p.index] in FOOT_GROUPS)
    boots = duplicate_faces(body, boot_faces, "boot_shell")
    solidify(boots, GARMENT_THICKNESS)
    set_single_material(boots, boots_material)
    assign_atlas_uv(boots, "cuffs")

    for garment, front_region, back_region in garments:
        solidify(garment, GARMENT_THICKNESS)
        set_single_material(garment, kit_atlas_material)
        assign_atlas_uv(garment, front_region, back_region)

    add_collar_meshes(armature, kit_atlas_material)
    add_soles(armature, sole_material)
    add_contact_sockets(armature)

    del eyes
    deselect_all()
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
    )
    print(f"Exported {GLB_PATH}")


if __name__ == "__main__":
    main()
