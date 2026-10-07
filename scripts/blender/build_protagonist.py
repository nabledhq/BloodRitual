"""Builds the player stand-in, a Seminole man around 1900, with MPFB (MakeHuman for Blender).

The body, skin, eyes, brows, lashes, hair and the game-engine rig come from MPFB and its CC0 asset
packs (see ASSETS_LICENSES.md). The clothing is generated here, from the body itself, and is this
repository's own work (MIT):

  * a knee-length "big shirt": the torso and arms of the body plus MakeHuman's skirt helper,
    pushed out from the skin, with appliqué-style bands near the hem, across the chest and at
    the cuffs (bands rather than machine patchwork, which only spread in the 1910s);
  * a wrapped cloth turban of stacked rolls, bound to the head bone;
  * a finger-woven sash at the waist with two hanging ends;
  * a neckerchief.

The textures are painted procedurally (numpy). The body faces hidden under the shirt are removed
so they cannot poke through it. The result is exported, with its textures and a manifest, for
scripts/editor/import_cc0_assets.py to import into Unreal.

Requirements: Blender 4.2+ with the MPFB extension and the CC0 "MakeHuman system assets" pack
installed (MPFB > Apply assets > Library settings, or unzip it into MPFB's user data folder).

Run headless:

    blender -b --factory-startup --python scripts/blender/build_protagonist.py -- [OUTPUT_DIR] [--preview]

OUTPUT_DIR defaults to <repo>/Saved/CharacterBuild (ignored by Git). --preview also renders front
and side images of the character there.

This is a game-art interpretation for a stand-in; it should be reviewed by Seminole cultural
advisors (see docs/ARCHITECTURE.md) before anything like it is treated as final art.
"""

import bpy
import bmesh
import importlib
import json
import math
import os
import shutil
import sys
import urllib.request
import zipfile

import numpy as np
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = next((a for a in ARGS if not a.startswith("--")), os.path.join(REPO, "Saved", "CharacterBuild"))
PREVIEW = "--preview" in ARGS

MPFB = "bl_ext.user_default.mpfb"
HumanService = importlib.import_module(MPFB + ".services.humanservice").HumanService

# --- The man ---------------------------------------------------------------------------------

# MakeHuman macros, 0..1. Age 0.54 is about 30 years. MakeHuman only has three ancestry
# blends; the mix leans on the "asian" one for the face and is tuned by eye, not by any person.
PHENOTYPE = {"gender": 1.0, "age": 0.54, "muscle": 0.62, "weight": 0.48, "proportions": 0.65, "height": 0.55,
             "race": {"asian": 0.7, "african": 0.15, "caucasian": 0.15}}
BODY_PARTS = {
    "eyes": "high-poly/high-poly.mhclo",
    "eyebrows": "eyebrow001/eyebrow001.mhclo",
    "eyelashes": "eyelashes01/eyelashes01.mhclo",
    "hair": "short02/short02.mhclo",
}
SKIN = "young_asian_male/young_asian_male.mhmat"
# Multiplies the skin texture towards a warm brown.
SKIN_TONE = (0.80, 0.60, 0.46)

# Animation source: Quaternius' Universal Animation Library (CC0), the author's OpenGameArt upload.
# Unreal retargets these clips onto the man; this script only cleans the file for that.
UAL_ZIP_URL = "https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip"
UAL_FBX_IN_ZIP = "Animation Library[Standard]/Unreal Engine/AL_Standard.fbx"
UAL_CLIPS = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Jump_Loop"]

# --- Clothing colours (linear-ish sRGB 0..1) ---------------------------------------------------

SHIRT_BASE = (0.50, 0.11, 0.09)       # madder red cotton
NAVY = (0.08, 0.10, 0.24)
YELLOW = (0.86, 0.66, 0.18)
CREAM = (0.88, 0.84, 0.72)
GREEN = (0.20, 0.36, 0.24)
PURPLE = (0.30, 0.18, 0.36)
BLACK = (0.06, 0.05, 0.05)

SHIRT_OFFSET = 0.02       # m outward from the skin for the torso and sleeves (big shirts were loose)
SKIRT_OFFSET = 0.006      # extra for the skirt helper, which already stands off the legs
ROUND_REPEATS_BODY = 6    # pattern repeats around the body
ROUND_REPEATS_SLEEVE = 3


# --- Helpers -----------------------------------------------------------------------------------

def deform_names(obj):
    arm = obj.find_armature()
    return {b.name for b in arm.data.bones} if arm else set()


def group_index(obj, name):
    group = obj.vertex_groups.get(name)
    return group.index if group else -1


def dominant_bone(weights, index_to_bone):
    best, best_w = None, 0.0
    for gi, w in weights.items():
        bone = index_to_bone.get(gi)
        if bone and w > best_w:
            best, best_w = bone, w
    return best


def bake_shape_keys(obj):
    """Applies the MPFB targets (shape keys) to the mesh itself."""
    if not obj.data.shape_keys:
        return
    mix = obj.shape_key_add(name="__mix", from_mix=True)
    coords = [0.0] * (len(obj.data.vertices) * 3)
    mix.data.foreach_get("co", coords)
    obj.shape_key_clear()
    obj.data.vertices.foreach_set("co", coords)
    obj.data.update()


def make_image(name, pixels):
    """pixels: float array (H, W, 3|4) in 0..1, row 0 at the bottom (Blender convention)."""
    h, w = pixels.shape[:2]
    if pixels.shape[2] == 3:
        pixels = np.concatenate([pixels, np.ones((h, w, 1), dtype=np.float32)], axis=2)
    image = bpy.data.images.new(name, width=w, height=h, alpha=True)
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    return image


def save_image(image, path):
    """PNG, or JPEG (quality 90) for a .jpg path: the repository's asset budget is 50 MB."""
    image.filepath_raw = path
    if path.lower().endswith(".jpg"):
        image.file_format = "JPEG"
        image.save(quality=90)
    else:
        image.file_format = "PNG"
        image.save()


def textured_material(name, image, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return mat


def new_mesh_object(name, verts, faces, uvs, weights, armature):
    """uvs: per-face list of per-corner (u, v); weights: per-vertex dict bone -> weight."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    loop = 0
    for face_uvs in uvs:
        for uv in face_uvs:
            uv_layer.data[loop].uv = uv
            loop += 1
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for vi, bone_weights in enumerate(weights):
        for bone, w in bone_weights.items():
            group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
            group.add([vi], w, "REPLACE")
    obj.parent = armature
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    mesh.shade_smooth() if hasattr(mesh, "shade_smooth") else None
    return obj


# --- Build -------------------------------------------------------------------------------------

def build_human():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    info = HumanService._create_default_human_info_dict()
    info["name"] = "Protagonist"
    info["phenotype"].update({k: v for k, v in PHENOTYPE.items() if k != "race"})
    info["phenotype"]["race"] = dict(PHENOTYPE["race"])
    info["rig"] = "game_engine"
    info.update(BODY_PARTS)
    info["skin_mhmat"] = SKIN
    info["skin_material_type"] = "GAMEENGINE"
    info["eyes_material_type"] = "GAMEENGINE"
    info["clothes_material_type"] = "GAMEENGINE"
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    basemesh = HumanService.deserialize_from_dict(info, settings)
    armature = basemesh.find_armature()
    return armature, basemesh


def build_shirt(basemesh, armature):
    """Duplicates the body, keeps torso + arms + the skirt helper and pushes them out."""
    shirt = basemesh.copy()
    shirt.data = basemesh.data.copy()
    shirt.name = "BigShirt"
    bpy.context.scene.collection.objects.link(shirt)
    for modifier in list(shirt.modifiers):
        if modifier.type != "ARMATURE":
            shirt.modifiers.remove(modifier)

    bones = deform_names(basemesh)
    index_to_bone = {g.index: g.name for g in shirt.vertex_groups if g.name in bones}
    body_gi = group_index(shirt, "body")
    skirt_gi = group_index(shirt, "helper-skirt")

    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    dl = bm.verts.layers.deform.verify()
    bm.verts.ensure_lookup_table()

    skirt_z = [v.co.z for v in bm.verts if v[dl].get(skirt_gi, 0) > 0.5]
    skirt_top = max(skirt_z)
    # Big shirts reached the knee; the skirt helper goes on to the ankles.
    knee = armature.data.bones["calf_l"].head_local.z
    hem_limit = knee - 0.04
    neck = armature.data.bones["neck_01"].head_local.z
    hip_z = skirt_top - 0.05

    torso_bones = {"spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r",
                   "lowerarm_l", "lowerarm_r", "pelvis"}
    keep = set()
    torso = set()
    for v in bm.verts:
        w = v[dl]
        if w.get(skirt_gi, 0) > 0.5:
            if v.co.z >= hem_limit:
                keep.add(v.index)
        elif w.get(body_gi, 0) > 0.5:
            bone = dominant_bone(w, index_to_bone)
            # The lower neck is included and the neckline cut at one height, so its edge is a
            # clean ring (the kerchief sits on it) rather than following bone weights.
            if (bone in torso_bones or bone == "neck_01") and hip_z <= v.co.z <= neck + 0.005:
                keep.add(v.index)
                torso.add(v.index)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in keep for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    skirt_bottom = min(v.co.z for v in bm.verts)

    # Push out along the normals: torso and sleeves from the skin, the skirt a little more.
    skirt_now = {v for v in bm.verts if v[dl].get(skirt_gi, 0) > 0.5}
    for v in bm.verts:
        v.co += v.normal * (SKIRT_OFFSET if v in skirt_now else SHIRT_OFFSET)
    # Smooth away the anatomy (chest, abdomen) so the cotton hangs instead of clinging.
    for _ in range(4):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if v not in skirt_now and not v.is_boundary], factor=0.5,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # UVs: u runs around the body (or the arm), v is a "band coordinate": height for the body,
    # wrist-to-shoulder for the sleeves, in separate zones of the texture.
    arm_axes = {}
    for side in ("l", "r"):
        shoulder = armature.data.bones["upperarm_" + side].head_local
        wrist = armature.data.bones["hand_" + side].head_local
        arm_axes[side] = (shoulder, wrist)
    uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        centre = face.calc_center_median()
        bones_in_face = [dominant_bone(v[dl], index_to_bone) for v in face.verts]
        side = None
        if sum(1 for b in bones_in_face if b and b.startswith(("upperarm", "lowerarm"))) * 2 > len(bones_in_face):
            side = "l" if centre.x > 0 else "r"
            if abs(centre.x) < armature.data.bones["upperarm_" + side].head_local.x * 1.05:
                side = None
        previous = None
        for loop in face.loops:
            p = loop.vert.co
            if side is None:
                angle = math.atan2(p.x, -p.y)
                repeats = ROUND_REPEATS_BODY
                v_coord = min(p.z / 2.0, 0.79)
            else:
                shoulder, wrist = arm_axes[side]
                axis = (shoulder - wrist)
                t = max(0.0, min(1.0, (p - wrist).dot(axis) / axis.length_squared))
                radial = (p - (wrist + axis * t))
                ref = Vector((0.0, 0.0, 1.0)) - axis.normalized() * axis.normalized().z
                angle = math.atan2(radial.cross(ref).dot(axis.normalized()), radial.dot(ref))
                repeats = ROUND_REPEATS_SLEEVE
                v_coord = 0.82 + 0.16 * t
            if previous is not None:
                while angle - previous > math.pi:
                    angle -= 2 * math.pi
                while previous - angle > math.pi:
                    angle += 2 * math.pi
            previous = angle
            loop[uv].uv = (angle / (2 * math.pi) * repeats, v_coord)

    bm.to_mesh(shirt.data)
    bm.free()
    for group in list(shirt.vertex_groups):
        if group.name not in bones:
            shirt.vertex_groups.remove(group)
    return shirt, {"hem_z": skirt_bottom, "hip_z": hip_z, "neck_z": neck, "torso_body_verts": torso}


def hide_covered_body(basemesh, covered):
    """Deletes body faces deep under the shirt, keeping a two-ring border at its openings."""
    bm = bmesh.new()
    bm.from_mesh(basemesh.data)
    bm.verts.ensure_lookup_table()
    covered_verts = {bm.verts[i] for i in covered}
    border = {v for v in covered_verts if any(e.other_vert(v) not in covered_verts for e in v.link_edges)}
    for _ in range(2):
        border |= {e.other_vert(v) for v in border for e in v.link_edges}
    inner = covered_verts - border
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v in inner for v in f.verts)], context="FACES")
    bm.to_mesh(basemesh.data)
    bm.free()


def remove_helpers(basemesh):
    bm = bmesh.new()
    bm.from_mesh(basemesh.data)
    dl = bm.verts.layers.deform.verify()
    body_gi = group_index(basemesh, "body")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[dl].get(body_gi, 0) < 0.5], context="VERTS")
    bm.to_mesh(basemesh.data)
    bm.free()
    bones = deform_names(basemesh)
    for group in list(basemesh.vertex_groups):
        if group.name not in bones:
            basemesh.vertex_groups.remove(group)
    for modifier in list(basemesh.modifiers):
        if modifier.type != "ARMATURE":
            basemesh.modifiers.remove(modifier)


def surface_radius(points, centre, angle, default):
    """Largest horizontal distance from centre of the points within 12 degrees of angle."""
    best = 0.0
    for p in points:
        d = Vector((p.x - centre.x, p.y - centre.y))
        if d.length < 1e-6:
            continue
        a = math.atan2(d.y, d.x)
        diff = abs((a - angle + math.pi) % (2 * math.pi) - math.pi)
        if diff < math.radians(12):
            best = max(best, d.length)
    return best or default


def ring_band(points, centre, z_bottom, z_top, offset, rows, segments=40, bulge=0.0, flare=0.0):
    """A closed band hugging the given surface points between two heights."""
    verts, faces, uvs = [], [], []
    radii = [surface_radius(points, centre, 2 * math.pi * s / segments, 0.1) + offset for s in range(segments)]
    for r in range(rows + 1):
        t = r / rows
        z = z_bottom + (z_top - z_bottom) * t
        grow = 1.0 + flare * t + bulge * math.sin(math.pi * t)
        for s in range(segments):
            a = 2 * math.pi * s / segments
            verts.append((centre.x + math.cos(a) * radii[s] * grow, centre.y + math.sin(a) * radii[s] * grow, z))
    for r in range(rows):
        for s in range(segments):
            a, b = r * segments + s, r * segments + (s + 1) % segments
            c, d = b + segments, a + segments
            faces.append((a, b, c, d))
            u0, u1 = s / segments, (s + 1) / segments
            uvs.append([(u0, r / rows), (u1, r / rows), (u1, (r + 1) / rows), (u0, (r + 1) / rows)])
    return verts, faces, uvs


def build_turban(basemesh, hair, eyebrows, armature):
    """Five stacked rolls from the forehead up, flaring a little, with a cap."""
    brow_top = max((eyebrows.matrix_world @ v.co).z for v in eyebrows.data.vertices)
    z0 = brow_top + 0.012
    head = armature.data.bones["head"]
    centre = Vector((0.0, head.head_local.y, 0.0))
    points = [basemesh.matrix_world @ v.co for v in basemesh.data.vertices
              if (basemesh.matrix_world @ v.co).z > z0 - 0.02]
    points += [hair.matrix_world @ v.co for v in hair.data.vertices if (hair.matrix_world @ v.co).z > z0 - 0.02]
    points = [p for p in points if p.z < z0 + 0.03]
    rolls, roll_h = 5, 0.028
    verts, faces, uvs = [], [], []
    for i in range(rolls):
        # Each wrap overlaps the one below and sits a few millimetres further out.
        v, f, u = ring_band(points, centre, z0 + i * roll_h - 0.006, z0 + (i + 1) * roll_h, 0.010 + 0.004 * i,
                            rows=4, bulge=0.015)
        base = len(verts)
        verts += v
        faces += [tuple(base + k for k in face) for face in f]
        # One shawl wound round: u runs along the cloth, shifted per wrap so the folds don't line up.
        uvs += [[(uu * 3 + 0.37 * i, (i + vv) / (rolls + 1)) for uu, vv in face_uv] for face_uv in u]
    # Cap: a shallow dome closing the top roll.
    top_ring = len(verts) - 40
    apex = len(verts)
    top_z = z0 + rolls * roll_h
    verts.append((centre.x, centre.y, top_z + 0.012))
    for s in range(40):
        faces.append((top_ring + s, top_ring + (s + 1) % 40, apex))
        uvs.append([(s / 40 * 4, rolls / (rolls + 1)), ((s + 1) / 40 * 4, rolls / (rolls + 1)), (s / 40 * 4, 1.0)])
    weights = [{"head": 1.0} for _ in verts]
    return new_mesh_object("Turban", verts, faces, uvs, weights, armature)


def build_sash(shirt, armature, waist_z):
    hip_half_width = armature.data.bones["thigh_l"].head_local.x + 0.12
    points = [shirt.matrix_world @ v.co for v in shirt.data.vertices
              if abs((shirt.matrix_world @ v.co).z - waist_z) < 0.03 and abs((shirt.matrix_world @ v.co).x) < hip_half_width]
    centre = Vector((sum(p.x for p in points) / len(points), sum(p.y for p in points) / len(points), 0.0))
    verts, faces, uvs = ring_band(points, centre, waist_z - 0.04, waist_z + 0.04, 0.008, rows=2)
    uvs = [[(uu * 8, vv) for uu, vv in face_uv] for face_uv in uvs]
    weights = [{"spine_01": 0.5, "pelvis": 0.5} for _ in verts]
    # Two ends hanging from the left hip.
    hip = Vector((max(p.x for p in points) + 0.01, centre.y - 0.02, waist_z - 0.04))
    for k, (dx, length) in enumerate(((-0.02, 0.30), (0.03, 0.24))):
        base = len(verts)
        steps = 4
        for i in range(steps + 1):
            t = i / steps
            z = hip.z - length * t
            x = hip.x + 0.01 + 0.015 * t
            for side in (-1, 1):
                verts.append((x, hip.y + dx + side * 0.028, z))
                weights.append({"pelvis": 1.0 - 0.6 * t, "thigh_l": 0.6 * t})
        for i in range(steps):
            a = base + 2 * i
            faces.append((a, a + 1, a + 3, a + 2))
            uvs.append([(0.0, 0.5 * i / steps), (1.0, 0.5 * i / steps), (1.0, 0.5 * (i + 1) / steps), (0.0, 0.5 * (i + 1) / steps)])
    return new_mesh_object("Sash", verts, faces, uvs, weights, armature)


def build_neckerchief(shirt, basemesh, armature):
    """A folded kerchief: it sits on the shirt's neckline (hiding its cut edge) and narrows to hug
    the neck, with the knotted point hanging at the front."""
    neck_z = armature.data.bones["neck_01"].head_local.z
    bottom_z, top_z = neck_z - 0.015, neck_z + 0.025
    shirt_points = [shirt.matrix_world @ v.co for v in shirt.data.vertices
                    if abs((shirt.matrix_world @ v.co).z - bottom_z) < 0.012]
    neck_points = [basemesh.matrix_world @ v.co for v in basemesh.data.vertices
                   if abs((basemesh.matrix_world @ v.co).z - top_z) < 0.01]
    centre = Vector((0.0, sum(p.y for p in neck_points) / len(neck_points), 0.0))
    segments = 40
    verts, faces, uvs = [], [], []
    neck_radii = [surface_radius(neck_points, centre, 2 * math.pi * s / segments, 0.07) for s in range(segments)]
    for row, (z, points, offset) in enumerate(((bottom_z, shirt_points, 0.003), (top_z, neck_points, 0.008))):
        for s in range(segments):
            a = 2 * math.pi * s / segments
            r = surface_radius(points, centre, a, 0.07) + offset
            # On the shoulders the shirt slopes away; keep the kerchief close to the neck there.
            r = min(r, neck_radii[s] + 0.035)
            verts.append((centre.x + math.cos(a) * r, centre.y + math.sin(a) * r, z))
    for s in range(segments):
        a, b = s, (s + 1) % segments
        faces.append((a, b, b + segments, a + segments))
        uvs.append([(s / segments * 6, 0.0), ((s + 1) / segments * 6, 0.0), ((s + 1) / segments * 6, 1.0), (s / segments * 6, 1.0)])
    weights = [{"neck_01": 0.5, "spine_03": 0.5} for _ in verts]
    # The knotted point hanging at the front (-Y is the front).
    front = min(verts, key=lambda v: v[1])
    base = len(verts)
    verts += [(front[0] - 0.045, front[1] - 0.004, neck_z - 0.015), (front[0] + 0.045, front[1] - 0.004, neck_z - 0.015),
              (front[0], front[1] - 0.02, neck_z - 0.10)]
    weights += [{"spine_03": 1.0}] * 3
    faces.append((base, base + 1, base + 2))
    uvs.append([(0.0, 0.0), (1.0, 0.0), (0.5, 1.0)])
    return new_mesh_object("Neckerchief", verts, faces, uvs, weights, armature)


# --- Textures ----------------------------------------------------------------------------------

def weave(h, w, seed, strength=0.06):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w]
    threads = 0.5 + 0.5 * np.sin(x * 2.1) * np.sin(y * 2.1)
    noise = rng.normal(0.0, 1.0, (h, w))
    return (1.0 + strength * (threads - 0.5) + strength * 0.5 * noise)[..., None]


def paint_shirt(hem_z, chest_z, size=1024):
    """Body zone v in [0, 0.8): v = z / 2. Sleeve zone v in [0.82, 0.98]: wrist -> shoulder."""
    h = w = size
    img = np.ones((h, w, 3), dtype=np.float32) * np.array(SHIRT_BASE)
    v = (np.arange(h) + 0.5) / h
    u = (np.arange(w) + 0.5) / w

    def band(z_from, z_to, colour, zone="body"):
        lo, hi = (z_from / 2.0, z_to / 2.0) if zone == "body" else (0.82 + 0.16 * z_from, 0.82 + 0.16 * z_to)
        rows = (v >= lo) & (v < hi)
        img[rows] = colour
        return rows, lo, hi

    def sawtooth(z_from, z_to, fg, bg, teeth=8, zone="body"):
        rows, lo, hi = band(z_from, z_to, bg, zone)
        frac = (u * teeth) % 1.0
        tooth = np.abs(frac - 0.5) * 2.0  # 1 at edges, 0 in the middle
        for r in np.nonzero(rows)[0]:
            local = (v[r] - lo) / (hi - lo)
            img[r, tooth < local] = fg

    def diamonds(z_from, z_to, fg, bg, count=4, zone="body"):
        rows, lo, hi = band(z_from, z_to, bg, zone)
        frac = (u * count) % 1.0
        for r in np.nonzero(rows)[0]:
            local = abs((v[r] - lo) / (hi - lo) - 0.5) * 2.0
            img[r, np.abs(frac - 0.5) * 2.0 + local < 0.85] = fg

    # Hem: from the bottom edge up.
    z = hem_z
    for height, colour in ((0.015, NAVY), (0.008, CREAM)):
        band(z, z + height, colour)
        z += height
    sawtooth(z, z + 0.035, YELLOW, NAVY)
    z += 0.035
    band(z, z + 0.006, CREAM)
    z += 0.006
    diamonds(z, z + 0.05, NAVY, YELLOW)
    z += 0.05
    band(z, z + 0.006, CREAM)
    z += 0.006 + 0.04
    band(z, z + 0.012, NAVY)
    # Chest (yoke) band.
    band(chest_z - 0.006, chest_z, CREAM)
    sawtooth(chest_z, chest_z + 0.03, YELLOW, NAVY)
    band(chest_z + 0.03, chest_z + 0.036, CREAM)
    # Cuffs and a band above the elbow (sleeve zone, 0 = wrist, 1 = shoulder).
    band(0.0, 0.03, NAVY, "sleeve")
    sawtooth(0.03, 0.10, YELLOW, NAVY, teeth=6, zone="sleeve")
    band(0.10, 0.115, CREAM, "sleeve")
    band(0.55, 0.57, CREAM, "sleeve")
    band(0.57, 0.62, NAVY, "sleeve")
    band(0.62, 0.64, CREAM, "sleeve")
    return np.clip(img * weave(h, w, 1), 0, 1)


def paint_turban(size=512, rolls=6):
    """A wool plaid shawl, wound in rolls: the plaid, darker folds at each roll's edges, and
    diagonal creases where the cloth was twisted as it was wrapped."""
    h = w = size
    y, x = np.mgrid[0:h, 0:w] / size
    base = np.ones((h, w, 3)) * np.array((0.42, 0.10, 0.10))   # dull red ground
    check = 12
    bands_x = ((x * check) % 1.0) < 0.35
    bands_y = ((y * check * rolls / 2) % 1.0) < 0.35
    base[bands_x] = base[bands_x] * 0.4 + np.array(NAVY) * 0.6
    base[bands_y] = base[bands_y] * 0.5 + np.array(NAVY) * 0.5
    thin = (((x * check) % 1.0 > 0.6) & ((x * check) % 1.0 < 0.65)) | (((y * check * rolls / 2) % 1.0 > 0.6) & ((y * check * rolls / 2) % 1.0 < 0.65))
    base[thin] = YELLOW
    local = (y * rolls) % 1.0
    fold = 0.6 + 0.4 * np.sin(np.pi * local)
    crease = 0.88 + 0.12 * np.cos(2 * np.pi * (x * 6 + local * 0.8))
    img = base * (fold * crease)[..., None]
    return np.clip(img * weave(h, w, 2, 0.08), 0, 1)


def paint_sash(size=256):
    """Finger-woven chevrons (arrow pattern) in red, black and cream."""
    h = w = size
    y, x = np.mgrid[0:h, 0:w] / size
    chevron = (np.abs(((x * 2) % 1.0) - 0.5) + y * 6) % 1.0
    img = np.where((chevron < 0.33)[..., None], np.array((0.62, 0.08, 0.06)),
                   np.where((chevron < 0.66)[..., None], np.array(BLACK), np.array(CREAM)))
    return np.clip(img * weave(h, w, 3, 0.1), 0, 1)


def paint_neckerchief(size=256):
    h = w = size
    y, x = np.mgrid[0:h, 0:w]
    img = np.ones((h, w, 3)) * np.array(NAVY)
    dots = ((x % 24 - 12) ** 2 + (y % 24 - 12) ** 2) < 12
    img[dots] = CREAM
    return np.clip(img * weave(h, w, 4, 0.06), 0, 1)


def adjust_skin(material, out_path):
    tex = next(n for n in material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
    src = tex.image
    w, h = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(h, w, 4)
    px[..., :3] *= np.array(SKIN_TONE, dtype=np.float32)
    image = make_image("T_Protagonist_Skin", px)
    save_image(image, out_path)
    return image


# --- Export ------------------------------------------------------------------------------------

def render_previews(armature):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.light = "STUDIO"
    scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, location, rotation in (("front", (0.0, -4.2, 1.0), (math.radians(88), 0, 0)),
                                     ("side", (4.2, 0.0, 1.0), (math.radians(88), 0, math.radians(90))),
                                     ("head", (0.6, -1.3, 1.62), (math.radians(90), 0, math.radians(25)))):
        cam.location = location
        cam.rotation_euler = rotation
        cam_data.lens = 70 if name != "head" else 85
        scene.render.filepath = os.path.join(OUT_DIR, "preview_" + name + ".png")
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def action_fcurves(action):
    """F-curves of an action, for both the classic and the layered (Blender 4.4+) action model."""
    if getattr(action, "fcurves", None):
        return list(action.fcurves)
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def export_for_unreal(armature, objects, path, animations=False):
    """Unreal reads the exported numbers as centimetres: scale everything up 100x and apply it, so
    bone translations are in centimetres and the root keeps a scale of 1 (a scaled root would be
    carried into every retargeted clip). Location keys are scaled to match."""
    armature.name = "Armature"  # Unreal drops a root node with this name
    for obj in bpy.data.objects:
        obj.select_set(obj in objects)
    bpy.context.view_layer.objects.active = armature
    armature.scale = (100.0, 100.0, 100.0)
    with bpy.context.temp_override(selected_editable_objects=objects, selected_objects=objects, active_object=armature):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if animations:
        for action in bpy.data.actions:
            for fcurve in action_fcurves(action):
                if fcurve.data_path.endswith(".location"):
                    for key in fcurve.keyframe_points:
                        key.co.y *= 100.0
                        key.handle_left.y *= 100.0
                        key.handle_right.y *= 100.0
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"ARMATURE", "MESH"},
                             add_leaf_bones=False, apply_scale_options="FBX_SCALE_ALL", mesh_smooth_type="FACE",
                             use_armature_deform_only=True, path_mode="STRIP",
                             bake_anim=animations, bake_anim_use_all_actions=animations,
                             bake_anim_use_nla_strips=False, bake_anim_force_startend_keying=animations)


def export_animation_source():
    """Re-exports Quaternius' mannequin and the locomotion clips in the same clean form as the man.
    Returns the clip names."""
    cache = os.path.join(REPO, "Saved", "CC0Downloads", "quaternius_ual")
    os.makedirs(cache, exist_ok=True)
    zip_path = os.path.join(cache, "universal_animation_librarystandard.zip")
    if not os.path.exists(zip_path):
        request = urllib.request.Request(UAL_ZIP_URL, headers={"User-Agent": "seminole-asset-build"})
        with urllib.request.urlopen(request, timeout=300) as response, open(zip_path, "wb") as out:
            out.write(response.read())
    fbx_path = os.path.join(cache, "AL_Standard.fbx")
    if not os.path.exists(fbx_path):
        with zipfile.ZipFile(zip_path) as archive, open(fbx_path, "wb") as out:
            out.write(archive.read(UAL_FBX_IN_ZIP))

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.ops.import_scene.fbx(filepath=fbx_path, use_anim=True)
    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    # Takes are named after the rig and the clip, e.g. "Rig|Idle_Loop"; keep the clips the game uses.
    for action in list(bpy.data.actions):
        take = action.name.split("|")[-1]
        if take in UAL_CLIPS:
            action.name = take
        else:
            bpy.data.actions.remove(action)
    if armature.animation_data:
        armature.animation_data.action = None
    objects = [armature] + [o for o in bpy.data.objects if o.parent is armature]
    # Bake the importer's root rotation and scale into the data before scaling to centimetres.
    for obj in bpy.data.objects:
        obj.select_set(obj in objects)
    with bpy.context.temp_override(selected_editable_objects=objects, selected_objects=objects, active_object=armature):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    export_for_unreal(armature, objects, os.path.join(OUT_DIR, "AnimationSource.fbx"), animations=True)
    return sorted(action.name for action in bpy.data.actions)


def main():
    # Start from an empty texture folder so no texture from an earlier build survives.
    shutil.rmtree(os.path.join(OUT_DIR, "textures"), ignore_errors=True)
    os.makedirs(os.path.join(OUT_DIR, "textures"), exist_ok=True)
    armature, basemesh = build_human()
    parts = {o.name.split(".", 1)[1]: o for o in armature.children if o is not basemesh and "." in o.name}

    bake_shape_keys(basemesh)
    for modifier in list(basemesh.modifiers):
        if modifier.type == "MASK":
            basemesh.modifiers.remove(modifier)

    chest_z = armature.data.bones["spine_03"].tail_local.z - 0.02
    shirt, dims = build_shirt(basemesh, armature)
    hide_covered_body(basemesh, dims["torso_body_verts"])
    remove_helpers(basemesh)
    waist_z = armature.data.bones["spine_01"].head_local.z - 0.01
    turban = build_turban(basemesh, parts["short02"], parts["eyebrow001"], armature)
    sash = build_sash(shirt, armature, waist_z)
    neckerchief = build_neckerchief(shirt, basemesh, armature)

    textures = os.path.join(OUT_DIR, "textures")
    manifest = {"materials": {}}

    def register(obj, material_name, image, path, masked=False, two_sided=False):
        if image is not None and path is not None and not os.path.exists(path):
            save_image(image, path)  # copied textures are already in place
        obj.data.materials.clear()
        obj.data.materials.append(textured_material(material_name, image, alpha=masked))
        manifest["materials"][material_name] = {"texture": os.path.basename(path), "masked": masked, "two_sided": two_sided}

    skin_path = os.path.join(textures, "T_Protagonist_Skin.jpg")
    skin = adjust_skin(basemesh.data.materials[0], skin_path)
    register(basemesh, "M_Protagonist_Skin", skin, skin_path)
    register(shirt, "M_Protagonist_BigShirt", make_image("T_Protagonist_BigShirt", paint_shirt(dims["hem_z"], chest_z)),
             os.path.join(textures, "T_Protagonist_BigShirt.png"), two_sided=True)
    register(turban, "M_Protagonist_Turban", make_image("T_Protagonist_Turban", paint_turban()),
             os.path.join(textures, "T_Protagonist_Turban.png"), two_sided=True)
    register(sash, "M_Protagonist_Sash", make_image("T_Protagonist_Sash", paint_sash()),
             os.path.join(textures, "T_Protagonist_Sash.png"), two_sided=True)
    register(neckerchief, "M_Protagonist_Neckerchief", make_image("T_Protagonist_Neckerchief", paint_neckerchief()),
             os.path.join(textures, "T_Protagonist_Neckerchief.png"), two_sided=True)
    for key, name, masked in (("high-poly", "Eyes", False), ("eyebrow001", "Eyebrows", True),
                              ("eyelashes01", "Eyelashes", True), ("short02", "Hair", True)):
        obj = parts[key]
        tex = next(n for n in obj.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image).image
        path = os.path.join(textures, "T_Protagonist_" + name + ".png")
        if name == "Hair":
            # Small on screen under the turban; 1024 px instead of 2048 saves budget.
            tex.scale(1024, 1024)
            save_image(tex, path)
        else:
            shutil.copyfile(bpy.path.abspath(tex.filepath), path)
        register(obj, "M_Protagonist_" + name, tex, path, masked=masked, two_sided=masked)
    for key in list(parts):
        if key not in ("high-poly", "eyebrow001", "eyelashes01", "short02"):
            bpy.data.objects.remove(parts[key], do_unlink=True)

    if PREVIEW:
        render_previews(armature)

    height = max((basemesh.matrix_world @ v.co).z for v in basemesh.data.vertices)
    exported = [armature] + [o for o in bpy.data.objects if o.parent is armature]
    export_for_unreal(armature, exported, os.path.join(OUT_DIR, "Protagonist.fbx"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "Protagonist.blend"))
    manifest["fbx"] = "Protagonist.fbx"
    manifest["animation_source"] = "AnimationSource.fbx"
    manifest["clips"] = export_animation_source()
    manifest["height_m"] = height
    manifest["hem_z"] = dims["hem_z"]
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as out:
        json.dump(manifest, out, indent=2)
    print("build_protagonist: wrote", OUT_DIR)


main()
