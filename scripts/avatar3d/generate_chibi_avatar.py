import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "public" / "metaverse" / "avatar3d"
SOURCE_DIR = ROOT / "design-references" / "avatar3d"
GLB_PATH = PUBLIC_DIR / "chibi-stylized-v5.glb"
BLEND_PATH = SOURCE_DIR / "chibi-stylized-v5.blend"
PREVIEW_PATH = SOURCE_DIR / "chibi-stylized-v5-preview.png"

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


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name, color, roughness=0.88):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.0
    return mat


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def apply_modifier(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def rounded_box(name, location, dimensions, mat, bevel=0.08, rotation=(0, 0, 0), shade_smooth=True):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("soft_bevel", "BEVEL")
    modifier.width = min(bevel, min(dimensions) * 0.32)
    modifier.segments = 2 if shade_smooth else 1
    apply_modifier(obj, modifier)
    if shade_smooth:
        smooth(obj)
    obj.data.materials.append(mat)
    return obj


def tapered_box(
    name,
    z_bottom,
    z_top,
    width_bottom,
    width_top,
    depth_bottom,
    depth_top,
    mat,
    bevel=0.07,
    center_x=0,
    center_y=0,
    shade_smooth=True,
):
    zb, zt = z_bottom, z_top
    wb, wt = width_bottom / 2, width_top / 2
    db, dt = depth_bottom / 2, depth_top / 2
    vertices = [
        (center_x - wb, center_y - db, zb), (center_x + wb, center_y - db, zb),
        (center_x + wb, center_y + db, zb), (center_x - wb, center_y + db, zb),
        (center_x - wt, center_y - dt, zt), (center_x + wt, center_y - dt, zt),
        (center_x + wt, center_y + dt, zt), (center_x - wt, center_y + dt, zt),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    modifier = obj.modifiers.new("soft_bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 2 if shade_smooth else 1
    apply_modifier(obj, modifier)
    if shade_smooth:
        smooth(obj)
    obj.data.materials.append(mat)
    return obj


def ring_loft(name, rings, mat, segments=16, center_x=0, center_y=0):
    """Build a smooth rigid shell from explicit oval cross-sections."""
    vertices = []
    for z, radius_x, radius_y in rings:
        for segment in range(segments):
            angle = segment / segments * math.tau
            vertices.append(
                (
                    center_x + math.cos(angle) * radius_x,
                    center_y + math.sin(angle) * radius_y,
                    z,
                )
            )
    faces = [tuple(reversed(range(segments)))]
    for ring_index in range(len(rings) - 1):
        start = ring_index * segments
        next_start = start + segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append(
                (start + segment, start + next_segment, next_start + next_segment, next_start + segment)
            )
    top_start = (len(rings) - 1) * segments
    faces.append(tuple(top_start + segment for segment in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def chibi_head(name, rings, mat, segments=32):
    """Anime head: broad cheeks, short chin, flatter face and rounder cranium."""
    vertices = []
    for z, radius_x, front_depth, back_depth in rings:
        for segment in range(segments):
            angle = segment / segments * math.tau
            sine = math.sin(angle)
            depth = front_depth if sine < 0 else back_depth
            vertices.append((math.cos(angle) * radius_x, sine * depth, z))
    faces = [tuple(reversed(range(segments)))]
    for ring_index in range(len(rings) - 1):
        start = ring_index * segments
        next_start = start + segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append(
                (start + segment, start + next_segment, next_start + next_segment, next_start + segment)
            )
    top_start = (len(rings) - 1) * segments
    faces.append(tuple(top_start + segment for segment in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def faceted_ico(name, location, scale, mat, subdivisions=2, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions,
        radius=1,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def prism_from_outline(name, outline_xz, front_y, thickness, mat):
    count = len(outline_xz)
    vertices = [(x, front_y, z) for x, z in outline_xz]
    vertices += [(x, front_y + thickness, z) for x, z in outline_xz]
    faces = []
    faces.append(tuple(range(count)))
    faces.append(tuple(range(count, count * 2))[::-1])
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    mesh = bpy.data.meshes.new(f"{name}_geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("clump_bevel", "BEVEL")
    bevel.width = min(0.014, thickness * 0.28)
    bevel.segments = 2
    apply_modifier(obj, bevel)
    smooth(obj)
    return obj


def hair_shell(name, center, scale, mat, segments=16, rings=6):
    cx, cy, cz = center
    sx, sy, sz = scale
    vertices = [(cx, cy, cz + sz)]
    for ring in range(1, rings + 1):
        progress = ring / rings
        for segment in range(segments):
            phi = (segment / segments) * math.tau
            frontness = max(0.0, -math.sin(phi))
            side_back_drop = 2.08
            front_drop = 1.46
            theta_end = side_back_drop * (1 - frontness) + front_drop * frontness
            theta = theta_end * progress
            vertices.append(
                (
                    cx + sx * math.sin(theta) * math.cos(phi),
                    cy + sy * math.sin(theta) * math.sin(phi),
                    cz + sz * math.cos(theta),
                )
            )
    faces = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(rings - 1):
        start = 1 + ring * segments
        next_start = start + segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append(
                (start + segment, next_start + segment, next_start + next_segment, start + next_segment)
            )
    mesh = bpy.data.meshes.new(f"{name}_geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def wedge_shoe(name, center_x, mat, sole_mat):
    outline = [
        (-0.17, -0.31, 0.04), (0.17, -0.31, 0.04),
        (0.16, 0.24, 0.04), (-0.16, 0.24, 0.04),
        (-0.145, -0.25, 0.25), (0.145, -0.25, 0.25),
        (0.125, 0.18, 0.2), (-0.125, 0.18, 0.2),
    ]
    vertices = [(x + center_x, y - 0.13, z) for x, y, z in outline]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(f"{name}_geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("shoe_bevel", "BEVEL")
    bevel.width = 0.065
    bevel.segments = 3
    apply_modifier(obj, bevel)
    smooth(obj)
    sole = rounded_box(
        f"{name}_sole",
        (center_x, -0.15, 0.025),
        (0.34, 0.55, 0.045),
        sole_mat,
        bevel=0.04,
        shade_smooth=True,
    )
    return obj, sole


def ellipsoid(name, location, scale, mat, segments=20, rings=12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    obj.data.materials.append(mat)
    return obj


def teardrop(name, location, scale, mat, rotation=(0, 0, 0)):
    obj = ellipsoid(name, location, scale, mat, segments=16, rings=10, rotation=rotation)
    mesh = obj.data
    for vertex in mesh.vertices:
        local_z = vertex.co.z / max(scale[2], 0.0001)
        if local_z < -0.15:
            factor = max(0.38, 1.0 + local_z * 0.42)
            vertex.co.x *= factor
            vertex.co.y *= factor
    return obj


def soft_tapered_part(
    name,
    location,
    height,
    radius_bottom,
    radius_top,
    depth_scale,
    mat,
    rotation=(0, 0, 0),
    segments=16,
    rings=12,
):
    """Rounded rigid limb/clothing part with a soft taper and hidden end caps."""
    max_radius = max(radius_bottom, radius_top)
    obj = ellipsoid(
        name,
        location,
        (max_radius, max_radius * depth_scale, height * 0.5),
        mat,
        segments=segments,
        rings=rings,
        rotation=rotation,
    )
    half_height = max(height * 0.5, 0.0001)
    for vertex in obj.data.vertices:
        progress = max(0.0, min(1.0, vertex.co.z / half_height * 0.5 + 0.5))
        target_radius = radius_bottom + (radius_top - radius_bottom) * progress
        factor = target_radius / max_radius
        vertex.co.x *= factor
        vertex.co.y *= factor
    return obj


def create_empty(name, location):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.08
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def parent_keep_world(child, parent):
    matrix = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = matrix


def joint_pair(name, location, parent):
    proc = create_empty(f"proc_{name}", location)
    parent_keep_world(proc, parent)
    act = create_empty(f"act_{name}", location)
    parent_keep_world(act, proc)
    return proc, act


def add_curve(name, points, bevel_depth, mat):
    curve_data = bpy.data.curves.new(name=f"{name}_curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = bevel_depth
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def atlas_uv_rect(region_name):
    x, y, width, height = ATLAS_REGIONS[region_name]
    return (
        x / ATLAS_SIZE,
        1.0 - (y + height) / ATLAS_SIZE,
        (x + width) / ATLAS_SIZE,
        1.0 - y / ATLAS_SIZE,
    )


def convert_to_mesh(obj):
    if obj.type == "MESH":
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def assign_atlas_uv(obj, front_region, back_region=None):
    obj = convert_to_mesh(obj)
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


def apply_uniform_atlas(root, atlas_material):
    region_by_name = {
        "torso_mesh": ("front", "back"),
        "jersey_sleeve_l": ("sleeve_l", None),
        "jersey_sleeve_r": ("sleeve_r", None),
        "jersey_armhole_fill_l": ("sleeve_l", None),
        "jersey_armhole_fill_r": ("sleeve_r", None),
        "jersey_sleeve_cuff_l": ("cuffs", None),
        "jersey_sleeve_cuff_r": ("cuffs", None),
        "collar_left": ("collar", None),
        "collar_right": ("collar", None),
        "kit_collar_crew": ("collar", None),
        "kit_collar_polo_l": ("collar", None),
        "kit_collar_polo_r": ("collar", None),
        "waist_mesh": ("waist", None),
        "thigh_mesh_l": ("shorts_l", None),
        "thigh_mesh_r": ("shorts_r", None),
        "shin_mesh_l": ("socks_l", None),
        "shin_mesh_r": ("socks_r", None),
    }
    objects = {obj.name: obj for obj in descendants(root)}
    for object_name, (front_region, back_region) in region_by_name.items():
        obj = objects.get(object_name)
        if obj is None:
            raise RuntimeError(f"Missing uniform mesh for atlas: {object_name}")
        obj = convert_to_mesh(obj)
        obj.data.materials.clear()
        obj.data.materials.append(atlas_material)
        assign_atlas_uv(obj, front_region, back_region)


def build_avatar():
    skin = material("CHAR_SKIN", (0.96, 0.65, 0.53))
    skin_shadow = material("CHAR_SKIN_SHADOW", (0.84, 0.48, 0.42))
    # Semantic material names are the runtime kit API. Their names must not
    # describe the default color because every purchasable kit reuses them.
    jersey = material("KIT_PRIMARY", (0.56, 0.035, 0.12))
    jersey_dark = material("KIT_DARK", (0.27, 0.012, 0.05))
    jersey_light = material("KIT_SECONDARY", (0.93, 0.90, 0.82))
    kit_accent = material("KIT_ACCENT", (0.92, 0.48, 0.08))
    shorts = material("KIT_SHORTS", (0.055, 0.085, 0.15))
    socks = material("KIT_SOCKS", (0.92, 0.90, 0.84))
    shoe = material("KIT_BOOTS", (0.035, 0.045, 0.07), 0.74)
    sole = material("KIT_SOLE", (0.62, 0.66, 0.73), 0.78)
    uniform_atlas = material("KIT_ATLAS", (1.0, 1.0, 1.0), 0.9)
    hair = material("CHAR_HAIR", (0.235, 0.145, 0.225))
    hair_light = material("CHAR_HAIR_ACCENT", (0.405, 0.265, 0.375))
    eye_dark = material("CHAR_EYE_LINE", (0.025, 0.012, 0.045), 0.65)
    sclera = material("CHAR_EYE_WHITE", (0.97, 0.95, 0.93), 0.58)
    iris = material("CHAR_IRIS", (0.46, 0.08, 0.19), 0.62)
    eye_white = material("CHAR_EYE_HIGHLIGHT", (1.0, 0.98, 0.95), 0.55)
    blush = material("CHAR_BLUSH", (0.92, 0.28, 0.34), 0.9)
    mouth = material("CHAR_MOUTH", (0.45, 0.035, 0.08), 0.82)

    root = create_empty("avatar_root", (0, 0, 0))
    visual_root = create_empty("visual_root", (0, 0, 0))
    parent_keep_world(visual_root, root)

    _, act_pelvis = joint_pair("pelvis", (0, 0, 1.27), visual_root)
    proc_torso, act_torso = joint_pair("torso", (0, 0, 1.31), act_pelvis)
    proc_head, act_head = joint_pair("head", (0, 0, 1.97), act_torso)
    proc_torso.rotation_euler.z = math.radians(-2)
    proc_head.rotation_euler.z = math.radians(4)
    proc_head.rotation_euler.y = math.radians(-3)

    for name, location in (
        ("kit_pattern_anchor_front", (0, -0.232, 1.65)),
        ("kit_sponsor_anchor", (0, -0.242, 1.58)),
        ("kit_badge_anchor", (-0.19, -0.242, 1.82)),
        ("kit_name_anchor_back", (0, 0.232, 1.66)),
    ):
        anchor = create_empty(name, location)
        parent_keep_world(anchor, act_torso)

    torso = ring_loft(
        "torso_mesh",
        [
            (1.29, 0.285, 0.17),
            (1.34, 0.305, 0.18),
            (1.58, 0.315, 0.195),
            (1.88, 0.39, 0.215),
            (1.97, 0.31, 0.18),
        ],
        jersey,
        segments=20,
    )
    parent_keep_world(torso, act_torso)

    waist = rounded_box(
        "waist_mesh", (0, 0, 1.265), (0.535, 0.325, 0.075), shorts, bevel=0.025,
        shade_smooth=True,
    )
    parent_keep_world(waist, act_pelvis)

    neck_fill = ellipsoid(
        "neck_mesh",
        (0, 0.015, 1.99),
        (0.13, 0.11, 0.12),
        skin_shadow,
        segments=16,
        rings=10,
    )
    parent_keep_world(neck_fill, act_torso)

    collar_left = rounded_box(
        "collar_left", (-0.078, -0.224, 1.93), (0.18, 0.025, 0.045), jersey_dark, bevel=0.018,
        rotation=(0, math.radians(-16), math.radians(-24)),
    )
    collar_right = rounded_box(
        "collar_right", (0.078, -0.224, 1.93), (0.18, 0.025, 0.045), jersey_dark, bevel=0.018,
        rotation=(0, math.radians(16), math.radians(24)),
    )
    parent_keep_world(collar_left, act_torso)
    parent_keep_world(collar_right, act_torso)

    crew_collar = add_curve(
        "kit_collar_crew",
        [(-0.15, -0.236, 1.93), (0, -0.245, 1.86), (0.15, -0.236, 1.93)],
        0.018,
        jersey_dark,
    )
    parent_keep_world(crew_collar, act_torso)

    polo_left = prism_from_outline(
        "kit_collar_polo_l",
        [(-0.16, 1.95), (-0.015, 1.9), (-0.07, 1.79), (-0.22, 1.9)],
        -0.238,
        0.018,
        jersey_dark,
    )
    polo_right = prism_from_outline(
        "kit_collar_polo_r",
        [(0.16, 1.95), (0.22, 1.9), (0.07, 1.79), (0.015, 1.9)],
        -0.238,
        0.018,
        jersey_dark,
    )
    parent_keep_world(polo_left, act_torso)
    parent_keep_world(polo_right, act_torso)

    head = chibi_head(
        "head_mesh",
        [
            (1.94, 0.24, 0.24, 0.29),
            (2.06, 0.43, 0.31, 0.39),
            (2.3, 0.62, 0.365, 0.51),
            (2.58, 0.68, 0.385, 0.56),
            (2.86, 0.63, 0.39, 0.53),
            (3.12, 0.43, 0.33, 0.41),
            (3.22, 0.17, 0.14, 0.18),
        ],
        skin,
        segments=32,
    )
    parent_keep_world(head, act_head)

    for side in (-1, 1):
        ear = ellipsoid(
            f"ear_{'l' if side < 0 else 'r'}",
            (0.61 * side, 0.005, 2.56),
            (0.11, 0.075, 0.17),
            skin_shadow,
            segments=16,
            rings=10,
        )
        parent_keep_world(ear, act_head)

    hair_cap = hair_shell(
        "hair_cap", (0, 0.03, 2.59), (0.7, 0.59, 0.71), hair, segments=24, rings=9
    )
    parent_keep_world(hair_cap, act_head)

    # Every hairstyle owns its fringe. Changing only the back silhouette made
    # pony/twintail read like accessories glued onto the same wig.
    bob_bang_shapes = [
        [(-0.64, 3.07), (-0.34, 3.2), (-0.18, 2.91), (-0.34, 2.56), (-0.54, 2.72)],
        [(-0.43, 3.2), (-0.08, 3.29), (0.04, 2.96), (-0.13, 2.6), (-0.29, 2.77)],
        [(-0.15, 3.28), (0.18, 3.23), (0.22, 2.94), (0.07, 2.66), (-0.03, 2.84)],
        [(0.12, 3.23), (0.48, 3.13), (0.54, 2.86), (0.36, 2.64), (0.24, 2.82)],
        [(0.42, 3.1), (0.66, 2.96), (0.61, 2.51), (0.49, 2.66), (0.45, 2.84)],
    ]
    for index, outline in enumerate(bob_bang_shapes):
        bang = prism_from_outline(
            f"hair_style_bob_bang_{index + 1}", outline, -0.41, 0.045,
            hair_light if index in (1, 2) else hair,
        )
        parent_keep_world(bang, act_head)

    style_fringe_sets = {
        "short": [
            [(-0.63, 3.06), (-0.25, 3.22), (-0.12, 2.73), (-0.37, 2.55)],
            [(-0.28, 3.22), (0.1, 3.27), (0.03, 2.62), (-0.12, 2.79)],
            [(0.02, 3.27), (0.42, 3.17), (0.28, 2.59), (0.13, 2.82)],
            [(0.33, 3.16), (0.66, 3.0), (0.52, 2.63), (0.35, 2.82)],
        ],
        "ponytail": [
            [(-0.66, 3.04), (-0.15, 3.27), (0.14, 2.7), (-0.12, 2.55), (-0.42, 2.75)],
            [(-0.12, 3.27), (0.37, 3.18), (0.5, 2.75), (0.18, 2.57), (0.06, 2.83)],
            [(0.32, 3.17), (0.67, 2.99), (0.58, 2.55), (0.43, 2.72)],
        ],
        "twintail": [
            [(-0.65, 3.03), (-0.31, 3.2), (-0.16, 2.55), (-0.43, 2.68)],
            [(-0.34, 3.2), (0.02, 3.29), (-0.02, 2.63), (-0.18, 2.82)],
            [(-0.02, 3.29), (0.34, 3.2), (0.18, 2.62), (0.04, 2.83)],
            [(0.31, 3.2), (0.65, 3.03), (0.43, 2.67), (0.17, 2.55)],
        ],
    }
    for style, outlines in style_fringe_sets.items():
        for index, outline in enumerate(outlines):
            fringe = prism_from_outline(
                f"hair_style_{style}_bang_{index + 1}",
                outline,
                -0.414,
                0.04,
                hair_light if index == 1 else hair,
            )
            parent_keep_world(fringe, act_head)

    for side in (-1, 1):
        suffix = "l" if side < 0 else "r"
        short_outline = [
            (0.5 * side, 3.05),
            (0.67 * side, 2.92),
            (0.62 * side, 2.43),
            (0.49 * side, 2.51),
            (0.43 * side, 2.75),
        ]
        tuft_outline = [
            (0.08 * side, 3.25),
            (0.31 * side, 3.39),
            (0.27 * side, 3.16),
            (0.02 * side, 3.08),
        ]
        if side < 0:
            short_outline.reverse()
            tuft_outline.reverse()
        short_side = prism_from_outline(
            f"hair_style_short_side_{suffix}", short_outline, -0.33, 0.16, hair
        )
        short_tuft = prism_from_outline(
            f"hair_style_short_tuft_{suffix}", tuft_outline, -0.18, 0.16, hair_light
        )
        parent_keep_world(short_side, act_head)
        parent_keep_world(short_tuft, act_head)

    for side in (-1, 1):
        lock = teardrop(
            f"hair_style_bob_side_{'l' if side < 0 else 'r'}",
            (0.56 * side, 0.015, 2.48),
            (0.19, 0.2, 0.43),
            hair,
            rotation=(math.radians(-3), side * math.radians(12), side * math.radians(4)),
        )
        parent_keep_world(lock, act_head)

    pony_tie = ellipsoid(
        "hair_style_ponytail_tie",
        (0, 0.49, 2.68),
        (0.16, 0.12, 0.15),
        hair_light,
        segments=16,
        rings=10,
    )
    pony_tail = teardrop(
        "hair_style_ponytail_tail",
        (0, 0.57, 2.27),
        (0.3, 0.2, 0.48),
        hair,
        rotation=(math.radians(-7), 0, 0),
    )
    pony_highlight = teardrop(
        "hair_style_ponytail_highlight",
        (-0.07, 0.375, 2.3),
        (0.105, 0.045, 0.31),
        hair_light,
        rotation=(math.radians(-8), 0, math.radians(-5)),
    )
    parent_keep_world(pony_tie, act_head)
    parent_keep_world(pony_tail, act_head)
    parent_keep_world(pony_highlight, act_head)

    for side in (-1, 1):
        suffix = "l" if side < 0 else "r"
        pony_outline = [
            (0.51 * side, 3.05),
            (0.67 * side, 2.92),
            (0.59 * side, 2.37),
            (0.47 * side, 2.49),
            (0.43 * side, 2.74),
        ]
        if side < 0:
            pony_outline.reverse()
        pony_side = prism_from_outline(
            f"hair_style_ponytail_side_{suffix}", pony_outline, -0.34, 0.15, hair
        )
        parent_keep_world(pony_side, act_head)

    for side in (-1, 1):
        suffix = "l" if side < 0 else "r"
        twin_tie = ellipsoid(
            f"hair_style_twintail_tie_{suffix}",
            (0.57 * side, 0.11, 2.65),
            (0.12, 0.1, 0.12),
            hair_light,
            segments=14,
            rings=8,
        )
        twin_tail = teardrop(
            f"hair_style_twintail_tail_{suffix}",
            (0.7 * side, 0.18, 2.3),
            (0.23, 0.17, 0.43),
            hair,
            rotation=(0, side * math.radians(18), side * math.radians(9)),
        )
        twin_highlight = teardrop(
            f"hair_style_twintail_highlight_{suffix}",
            (0.7 * side, 0.035, 2.32),
            (0.075, 0.035, 0.27),
            hair_light,
            rotation=(0, side * math.radians(18), side * math.radians(9)),
        )
        parent_keep_world(twin_tie, act_head)
        parent_keep_world(twin_tail, act_head)
        parent_keep_world(twin_highlight, act_head)

        twin_outline = [
            (0.5 * side, 3.04),
            (0.67 * side, 2.92),
            (0.61 * side, 2.31),
            (0.46 * side, 2.46),
            (0.42 * side, 2.75),
        ]
        if side < 0:
            twin_outline.reverse()
        twin_side = prism_from_outline(
            f"hair_style_twintail_side_{suffix}", twin_outline, -0.34, 0.17, hair
        )
        parent_keep_world(twin_side, act_head)

    for side in (-1, 1):
        suffix = "l" if side < 0 else "r"
        eye_outline = ellipsoid(
            f"eye_{suffix}",
            (0.23 * side, -0.384, 2.52),
            (0.126, 0.011, 0.171),
            eye_dark,
            segments=20,
            rings=12,
            rotation=(0, side * math.radians(-5), 0),
        )
        eye_white_mesh = ellipsoid(
            f"eye_white_{suffix}",
            (0.23 * side, -0.396, 2.525),
            (0.105, 0.007, 0.147),
            sclera,
            segments=20,
            rings=12,
            rotation=(0, side * math.radians(-5), 0),
        )
        pupil = ellipsoid(
            f"iris_{suffix}",
            (0.23 * side, -0.405, 2.5),
            (0.082, 0.006, 0.128),
            iris,
            segments=18,
            rings=10,
            rotation=(0, side * math.radians(-5), 0),
        )
        pupil_core = ellipsoid(
            f"pupil_{suffix}",
            (0.23 * side, -0.412, 2.495),
            (0.035, 0.004, 0.074),
            eye_dark,
            segments=16,
            rings=10,
            rotation=(0, side * math.radians(-5), 0),
        )
        highlight = ellipsoid(
            f"eye_highlight_{suffix}",
            (0.2 * side, -0.414, 2.585),
            (0.028, 0.005, 0.04),
            eye_white,
            segments=12,
            rings=8,
        )
        cheek = ellipsoid(
            f"cheek_{suffix}",
            (0.4 * side, -0.376, 2.31),
            (0.075, 0.006, 0.027),
            blush,
            12,
            6,
        )
        eyebrow = add_curve(
            f"eyebrow_{suffix}",
            [
                (0.155 * side, -0.386, 2.74),
                (0.235 * side, -0.39, 2.78),
                (0.315 * side, -0.386, 2.74),
            ],
            0.012,
            hair,
        )
        eyelash = add_curve(
            f"eyelash_{suffix}",
            [
                (0.145 * side, -0.401, 2.61),
                (0.23 * side, -0.407, 2.67),
                (0.33 * side, -0.4, 2.63),
            ],
            0.013,
            eye_dark,
        )
        for face_part in (
            eye_outline,
            eye_white_mesh,
            pupil,
            pupil_core,
            highlight,
            cheek,
            eyebrow,
            eyelash,
        ):
            parent_keep_world(face_part, act_head)

    nose_curve = add_curve(
        "nose_mesh",
        [(-0.018, -0.408, 2.39), (0.012, -0.414, 2.36), (0.03, -0.407, 2.38)],
        0.008,
        skin_shadow,
    )
    parent_keep_world(nose_curve, act_head)

    mouth_curve = add_curve(
        "mouth_mesh",
        [(-0.08, -0.39, 2.22), (0, -0.397, 2.19), (0.08, -0.39, 2.22)],
        0.014,
        mouth,
    )
    parent_keep_world(mouth_curve, act_head)

    for side in (-1, 1):
        suffix = "l" if side < 0 else "r"
        proc_arm, act_arm = joint_pair(f"upper_arm_{suffix}", (0.43 * side, 0, 1.88), act_torso)
        proc_arm.rotation_euler.y = side * math.radians(10)
        proc_arm.rotation_euler.x = math.radians(-10)
        armhole_fill = ellipsoid(
            f"jersey_armhole_fill_{suffix}",
            (0.37 * side, 0.01, 1.84),
            (0.095, 0.105, 0.105),
            jersey_light,
            segments=16,
            rings=10,
        )
        parent_keep_world(armhole_fill, act_torso)
        sleeve = ring_loft(
            f"jersey_sleeve_{suffix}",
            [
                (1.59, 0.145, 0.125),
                (1.63, 0.15, 0.13),
                (1.82, 0.16, 0.14),
                (1.96, 0.12, 0.11),
            ],
            jersey_light,
            segments=16,
            center_x=0.455 * side,
        )
        parent_keep_world(sleeve, act_arm)

        sleeve_cuff = rounded_box(
            f"jersey_sleeve_cuff_{suffix}",
            (0.47 * side, -0.005, 1.605),
            (0.245, 0.205, 0.018),
            jersey_dark,
            bevel=0.016,
            shade_smooth=True,
        )
        parent_keep_world(sleeve_cuff, act_arm)

        upper_arm = soft_tapered_part(
            f"upper_arm_mesh_{suffix}",
            (0.505 * side, -0.005, 1.46),
            0.38,
            0.085,
            0.105,
            0.88,
            skin,
        )
        parent_keep_world(upper_arm, act_arm)

        proc_forearm, act_forearm = joint_pair(f"forearm_{suffix}", (0.515 * side, 0, 1.36), act_arm)
        proc_forearm.rotation_euler.x = math.radians(-13)
        proc_forearm.rotation_euler.y = side * math.radians(10)
        forearm = soft_tapered_part(
            f"forearm_mesh_{suffix}",
            (0.525 * side, -0.02, 1.14),
            0.5,
            0.075,
            0.095,
            0.9,
            skin,
        )
        parent_keep_world(forearm, act_forearm)

        _, act_hand = joint_pair(f"hand_{suffix}", (0.54 * side, -0.04, 0.94), act_forearm)
        hand = teardrop(
            f"hand_mesh_{suffix}",
            (0.54 * side, -0.055, 0.86),
            (0.13, 0.11, 0.18),
            skin,
        )
        parent_keep_world(hand, act_hand)
        thumb = ellipsoid(
            f"thumb_mesh_{suffix}",
            (0.65 * side, -0.12, 0.9),
            (0.06, 0.048, 0.09),
            skin_shadow,
            segments=12,
            rings=8,
            rotation=(math.radians(-18), side * math.radians(12), 0),
        )
        parent_keep_world(thumb, act_hand)

        _, act_thigh = joint_pair(f"thigh_{suffix}", (0.19 * side, 0, 1.2), act_pelvis)
        thigh = ring_loft(
            f"thigh_mesh_{suffix}",
            [
                (0.62, 0.18, 0.145),
                (0.67, 0.19, 0.155),
                (1.08, 0.17, 0.15),
                (1.26, 0.145, 0.14),
            ],
            shorts,
            segments=16,
            center_x=0.19 * side,
            center_y=0.005,
        )
        parent_keep_world(thigh, act_thigh)

        _, act_shin = joint_pair(f"shin_{suffix}", (0.2 * side, 0, 0.66), act_thigh)
        shin = soft_tapered_part(
            f"shin_mesh_{suffix}",
            (0.2 * side, -0.01, 0.43),
            0.54,
            0.085,
            0.12,
            0.9,
            socks,
            segments=16,
            rings=12,
        )
        parent_keep_world(shin, act_shin)

        _, act_foot = joint_pair(f"foot_{suffix}", (0.205 * side, -0.04, 0.25), act_shin)
        kick_contact = create_empty(f"kick_contact_{suffix}", (0.21 * side, -0.43, 0.16))
        finesse_contact = create_empty(f"finesse_contact_{suffix}", (0.08 * side, -0.31, 0.15))
        parent_keep_world(kick_contact, act_foot)
        parent_keep_world(finesse_contact, act_foot)
        foot, shoe_sole = wedge_shoe(f"foot_mesh_{suffix}", 0.21 * side, shoe, sole)
        parent_keep_world(foot, act_foot)
        parent_keep_world(shoe_sole, act_foot)

        boot_mark = rounded_box(
            f"boot_mark_{suffix}",
            (0.21 * side, -0.405, 0.155),
            (0.2, 0.026, 0.045),
            kit_accent,
            bevel=0.012,
            rotation=(0, side * math.radians(12), 0),
            shade_smooth=False,
        )
        parent_keep_world(boot_mark, act_foot)

    apply_uniform_atlas(root, uniform_atlas)
    return root


def point_camera(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_preview(root):
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.018, 0.026, 0.055, 1)
    background.inputs["Strength"].default_value = 0.45

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.35, depth=0.08, location=(0, 0, -0.04))
    ground = bpy.context.object
    ground.name = "preview_ground"
    ground.data.materials.append(material("preview_ground_material", (0.055, 0.09, 0.16), 0.95))
    modifier = ground.modifiers.new("ground_bevel", "BEVEL")
    modifier.width = 0.06
    modifier.segments = 3
    apply_modifier(ground, modifier)

    bpy.ops.object.light_add(type="AREA", location=(-3.5, -4.2, 5.5))
    key = bpy.context.object
    key.name = "preview_key"
    key.data.energy = 950
    key.data.shape = "DISK"
    key.data.size = 4.0
    key.data.color = (1.0, 0.72, 0.62)
    point_camera(key, (0, 0, 1.55))

    bpy.ops.object.light_add(type="AREA", location=(3.8, -1.5, 3.6))
    fill = bpy.context.object
    fill.name = "preview_fill"
    fill.data.energy = 700
    fill.data.size = 3.0
    fill.data.color = (0.45, 0.62, 1.0)
    point_camera(fill, (0, 0, 1.7))

    bpy.ops.object.light_add(type="AREA", location=(0, 3.2, 4.5))
    rim = bpy.context.object
    rim.name = "preview_rim"
    rim.data.energy = 900
    rim.data.size = 2.5
    rim.data.color = (0.58, 0.35, 1.0)
    point_camera(rim, (0, 0, 2.0))

    bpy.ops.object.camera_add(location=(4.4, -6.7, 3.2))
    camera = bpy.context.object
    camera.name = "preview_camera"
    camera.data.lens = 68
    point_camera(camera, (0, 0, 1.65))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 820
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"

    return ground, key, fill, rim, camera


def descendants(root):
    result = []
    stack = [root]
    while stack:
        current = stack.pop()
        result.append(current)
        stack.extend(list(current.children))
    return result


def export_glb(root, preview_objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in descendants(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.object.select_all(action="DESELECT")
    for obj in preview_objects:
        obj.select_set(True)


def main():
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    root = build_avatar()
    preview_objects = setup_preview(root)
    preview_hidden = [
        obj for obj in descendants(root)
        if (
            obj.name.startswith("hair_style_")
            and not obj.name.startswith("hair_style_bob_")
        )
        or obj.name.startswith("kit_collar_crew")
        or obj.name.startswith("kit_collar_polo_")
        or obj.name.startswith("jersey_chest_chevron_")
    ]
    for obj in preview_hidden:
        obj.hide_render = True
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.render.render(write_still=True)
    for obj in preview_hidden:
        obj.hide_render = False
    export_glb(root, preview_objects)
    print(f"GLB: {GLB_PATH}")
    print(f"Blend: {BLEND_PATH}")
    print(f"Preview: {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
