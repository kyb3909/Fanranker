"""Build the Colin avatar GLB for the avatar lab.

Imports the purchased Colin chibi set (body / modular hair / clothes FBX),
re-UVs the football shirt+shorts onto the existing 512px kit atlas layout
(so every generated kit texture in public/metaverse/avatar3d/kits/v1 works
unchanged), builds simple boots, assigns the material slots the lab expects
(KIT_ATLAS / KIT_BOOTS / KIT_SOLE / CHAR_*), and exports a single GLB.

Run:  py -3.11 scripts/avatar3d/build_colin_avatar.py
Outputs:
  public/metaverse/avatar3d/colin-avatar-v1.glb
  output/colin-build/*.png  (preview renders with the Arsenal home kit)
"""

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
AVATAR = ROOT / "avatar"
PUBLIC = ROOT / "public" / "metaverse" / "avatar3d"
KITS_DIR = PUBLIC / "kits" / "v1"
OUT = ROOT / "output" / "colin-build"
OUT.mkdir(parents=True, exist_ok=True)

GLB_PATH = PUBLIC / "colin-avatar-v1.glb"
BODY_TEXTURE = AVATAR / "Texture" / "Collin_baseModel_BaseColor_1001.png"
PREVIEW_KIT = "red-horizon-home"  # Arsenal home (kits.ts DEFAULT_KIT_KEY)

TARGET_HEIGHT = 3.3  # matches CHIBI_SPEC.totalHeight / v5 scene scale

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

# hair style key -> (bangs index, back index); shared base/side/brows always on
HAIR_COMBOS = {
    "short": (1, 1),
    "bob": (5, 3),
    "ponytail": (3, 5),
    "twintail": (7, 6),
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
        is_sleeve = abs(center.x) > sleeve_x
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


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body_objs = import_fbx(AVATAR / "Modeling_v02_head_body_Combine" / "Colin_baseModel_v02.fbx")
    hair_objs = import_fbx(AVATAR / "Modeling" / "Colin_Hair_v01_forBlender.fbx")
    clothes_objs = import_fbx(AVATAR / "Colin_clothes_v01_forBlender.fbx")

    meshes = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
    for obj in meshes.values():
        bake_world_transform(obj)
    empties = [o for o in bpy.data.objects if o.type != "MESH"]
    for obj in meshes.values():
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
    delete_objects(empties)

    keep = {}

    keep["body"] = meshes["Colin_baseModel_body"]
    keep["eye_ball_l"] = meshes["Colin_baseModel_eyes_L_ball"]
    keep["eye_ball_r"] = meshes["Colin_baseModel_eyes_R_ball"]
    keep["eye_cover_l"] = meshes["Colin_baseModel_eyes_L_cover"]
    keep["eye_cover_r"] = meshes["Colin_baseModel_eyes_R_cover"]

    keep["hair_base"] = meshes["Colin_hair_base_01"]
    keep["hair_side"] = meshes["Colin_hair_side_01"]
    keep["hair_eyebrows"] = meshes["Colin_hair_eyebrows"]
    for style, (bangs_i, back_i) in HAIR_COMBOS.items():
        keep[f"hair_style_{style}_bangs"] = meshes[f"Colin_hair_bangs_{bangs_i:02d}"]
        keep[f"hair_style_{style}_back"] = meshes[f"Colin_hair_back_{back_i:02d}"]

    keep["kit_shirt"] = meshes["Colin_Tshirt_slim"]
    keep["kit_shorts"] = meshes["Colin_shorts_slim_clothes"]

    for new_name, obj in keep.items():
        obj.name = new_name
    delete_objects([o for o in meshes.values() if o not in keep.values()])

    # ---- materials -------------------------------------------------------
    mat_skin = make_material("CHAR_SKIN", (1, 1, 1), roughness=0.72, texture=BODY_TEXTURE)
    mat_iris = make_material("CHAR_IRIS", (1, 1, 1), roughness=0.35, texture=BODY_TEXTURE)
    mat_cover = make_material("CHAR_EYE_HIGHLIGHT", (1, 1, 1), roughness=0.06, alpha=0.14)
    mat_hair = make_material("CHAR_HAIR", (0.16, 0.10, 0.09), roughness=0.62)
    mat_kit = make_material("KIT_ATLAS", (1, 1, 1), roughness=0.78)
    mat_boot = make_material("KIT_BOOTS", (0.06, 0.075, 0.11), roughness=0.55)
    mat_sole = make_material("KIT_SOLE", (0.95, 0.94, 0.9), roughness=0.7)

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
    remap_shirt(keep["kit_shirt"])
    remap_shorts(keep["kit_shorts"])

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
            scene.render.filepath = str(OUT / f"colin-arsenal-{label}.png")
            bpy.ops.render.render(write_still=True)

        # per-style sheet for the record
        for style in HAIR_COMBOS:
            for name, obj in keep.items():
                if name.startswith("hair_style_"):
                    obj.hide_render = not name.startswith(f"hair_style_{style}_")
            cam.location = center + views["front"].normalized() * dist
            fwd = (center - cam.location).normalized()
            cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str(OUT / f"colin-style-{style}.png")
            bpy.ops.render.render(write_still=True)

        # strip preview texture so the GLB ships with a clean white atlas slot
        mat_kit.node_tree.links.remove(tex.outputs["Color"].links[0])
        mat_kit.node_tree.nodes.remove(tex)
        principled.inputs["Base Color"].default_value = (1, 1, 1, 1)

    # ---- export ----------------------------------------------------------
    for obj in keep.values():
        obj.hide_render = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
    )
    size_kb = GLB_PATH.stat().st_size / 1024
    print(f"EXPORTED {GLB_PATH.name} {size_kb:.0f}KB")


if __name__ == "__main__":
    main()
