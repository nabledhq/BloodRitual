"""Builds the stand-in weapons: a tomahawk, a rock sledgehammer, a bow, a lever-action rifle and
the arrow the bow shoots.

Everything here is generated (lofted sections along paths, one 256 px painted texture atlas) and
is this repository's own work (MIT). Run it after scripts/blender/build_protagonist.py: it opens
the exported Protagonist (Saved/CharacterBuild/Protagonist.blend, centimetres, rest pose) and
builds each held weapon in his right-hand grip, taken from the hand bones recorded in that build's
manifest. So each weapon mesh is in the character's mesh space at his rest pose; in Unreal it is
attached to hand_r offset by the inverse of that bone's reference transform (see
UBloodRitualWeaponComponent), which puts it back in his hand in every animation. The arrow is in
its own space: it points along +X (Unreal's forward) with its tip at the origin.

Writes Saved/WeaponBuild/ (SM_*.fbx, textures/T_Weapons.png, manifest.json, previews) for
scripts/editor/import_weapons.py. Run headless:

    blender -b --python scripts/blender/build_weapons.py -- [--preview]
"""

import json
import math
import os
import shutil
import sys

import bpy
import numpy as np
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
CHARACTER_DIR = os.path.join(REPO, "Saved", "CharacterBuild")
OUT_DIR = os.path.join(REPO, "Saved", "WeaponBuild")
PREVIEW = "--preview" in ARGS

# Texture atlas zones (u0, v0, u1, v1).
ZONES = {
    "wood": (0.0, 0.0, 0.5, 0.25),
    "wood_dark": (0.5, 0.0, 1.0, 0.25),
    "iron": (0.0, 0.25, 0.5, 0.5),
    "brass": (0.5, 0.25, 1.0, 0.5),
    "stone": (0.0, 0.5, 0.5, 0.75),
    "rawhide": (0.5, 0.5, 1.0, 0.75),
    "feather": (0.0, 0.75, 0.5, 1.0),
    "red": (0.5, 0.75, 1.0, 1.0),
}


# --- Geometry ------------------------------------------------------------------------------------

class Builder:
    def __init__(self):
        self.verts, self.faces, self.uvs = [], [], []

    def loft(self, path, sections, zone, sides=10, caps=True, jitter=0.0, seed=0):
        """Rings along path. sections[i] = (u_axis, v_axis, radius_u, radius_v) at path[i]."""
        u0, v0, u1, v1 = ZONES[zone]
        rng = np.random.default_rng(seed)
        rings = []
        for p, (ax, ay, ra, rb) in zip(path, sections):
            ring = []
            for s in range(sides):
                a = 2 * math.pi * s / sides
                q = p + ax * (math.cos(a) * ra) + ay * (math.sin(a) * rb)
                if jitter:
                    q = q + Vector(rng.normal(0.0, jitter, 3))
                ring.append(len(self.verts))
                self.verts.append(q)
            rings.append(ring)
        n = len(rings)
        for i in range(n - 1):
            for s in range(sides):
                s2 = (s + 1) % sides
                self.faces.append((rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s]))
                ua, ub = u0 + (u1 - u0) * s / sides, u0 + (u1 - u0) * (s + 1) / sides
                va, vb = v0 + (v1 - v0) * i / (n - 1), v0 + (v1 - v0) * (i + 1) / (n - 1)
                self.uvs.append([(ua, va), (ub, va), (ub, vb), (ua, vb)])
        if caps:
            for ring, reverse in ((rings[0], True), (rings[-1], False)):
                centre = sum((self.verts[k] for k in ring), Vector()) / len(ring)
                c = len(self.verts)
                self.verts.append(centre)
                mid = ((u0 + u1) / 2, (v0 + v1) / 2)
                for s in range(sides):
                    a, b = ring[s], ring[(s + 1) % sides]
                    self.faces.append((c, b, a) if reverse else (c, a, b))
                    self.uvs.append([mid, mid, mid])

    def tube(self, p0, p1, r0, r1, zone, frame, sides=10, steps=1, caps=True):
        """Straight tube; frame = (u, v) perpendicular axes."""
        path = [p0.lerp(p1, i / steps) for i in range(steps + 1)]
        sections = [(frame[0], frame[1], r0 + (r1 - r0) * i / steps, r0 + (r1 - r0) * i / steps) for i in range(steps + 1)]
        self.loft(path, sections, zone, sides, caps)

    def block(self, centre, ax, ay, az, size, zone):
        """A box: size = half extents along the axes (ax is the length axis)."""
        hx, hy, hz = size
        path = [centre - ax * hx, centre + ax * hx]
        # Four sides at 45 degrees make a square section of half width r*cos(45).
        k = math.sqrt(2.0)
        self.loft(path, [(ay, az, hy * k, hz * k)] * 2, zone, sides=4, caps=True)

    def build(self, name, material):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        uv_layer = mesh.uv_layers.new(name="UVMap")
        loop = 0
        for face_uvs in self.uvs:
            for uv in face_uvs:
                uv_layer.data[loop].uv = uv
                loop += 1
        mesh.validate()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        mesh.materials.append(material)
        for poly in mesh.polygons:
            poly.use_smooth = True
        return obj


def grip_frame(hand):
    """Origin and axes of the right-hand grip: H runs along a held handle (pinky to index side),
    F points where the knuckles point, N out of the palm (into the curled fingers)."""
    wrist, middle = Vector(hand["wrist"]), Vector(hand["middle"])
    index, pinky = Vector(hand["index"]), Vector(hand["pinky"])
    F = (middle - wrist).normalized()
    H = index - pinky
    H = (H - F * H.dot(F)).normalized()
    N = H.cross(F).normalized()
    length = (middle - wrist).length
    origin = wrist + (middle - wrist) * 0.85 + N * (0.35 * length)
    return origin, H, F, N


def build_tomahawk(b, o, H, F, N):
    cm = 1.0
    # Haft: 45 cm, the hand near its butt end.
    b.tube(o - H * 7 * cm, o + H * 38 * cm, 1.5 * cm, 1.3 * cm, "wood", (F, N), steps=4)
    b.tube(o - H * 7.5 * cm, o - H * 2 * cm, 1.75 * cm, 1.75 * cm, "red", (F, N))            # cloth grip wrap
    b.tube(o + H * 29 * cm, o + H * 34 * cm, 1.6 * cm, 1.6 * cm, "rawhide", (F, N))          # lashing
    # Iron head: an eye round the haft top, a blade flaring forward to its edge, a short poll.
    top = o + H * 35 * cm
    path = [top + F * (t * cm) for t in (-3.0, -1.5, 0.0, 3.0, 7.0, 11.0)]
    heights = [1.8, 2.2, 2.4, 2.6, 3.6, 4.6]
    thick = [1.4, 1.6, 1.6, 0.9, 0.45, 0.12]
    b.loft(path, [(H, N, h * cm, t * cm) for h, t in zip(heights, thick)], "iron", sides=8)


def build_sledge(b, o, H, F, N):
    cm = 1.0
    # Haft: 80 cm, held about 10 cm from the butt; a stone head lashed at the top.
    b.tube(o - H * 10 * cm, o + H * 70 * cm, 2.2 * cm, 1.9 * cm, "wood_dark", (F, N), steps=6)
    b.tube(o - H * 10.5 * cm, o + H * 4 * cm, 2.45 * cm, 2.45 * cm, "rawhide", (F, N))
    top = o + H * 66 * cm
    ts = np.linspace(-1.0, 1.0, 9)
    path = [top + F * (t * 12 * cm) for t in ts]
    sections = [(H, N, (4.0 + 4.5 * math.sqrt(max(0.0, 1 - t * t))) * cm, (3.5 + 3.5 * math.sqrt(max(0.0, 1 - t * t))) * cm)
                for t in ts]
    b.loft(path, sections, "stone", sides=10, jitter=0.5 * cm, seed=3)
    # Rawhide lashing crossing over the head.
    for side in (-1, 1):
        b.tube(top - H * 9 * cm + F * (side * 3 * cm), top + H * 9 * cm + F * (side * 3 * cm), 1.0 * cm, 1.0 * cm,
               "rawhide", (F, N), sides=6)
        b.tube(top - H * 6 * cm - N * 6 * cm, top + H * 3 * cm + N * 7.5 * cm, 0.7 * cm, 0.7 * cm, "rawhide",
               (F, H), sides=6)


def build_bow(b, o, H, F, N):
    cm = 1.0
    # A self bow 130 cm long: the grip bulges towards the target, the tips sit 12 cm back
    # towards the string, which runs straight between them.
    ts = np.linspace(-1.0, 1.0, 17)
    path = [o + H * (t * 65 * cm) + F * ((-12.0 * t * t + 1.0) * cm) for t in ts]
    sections = [(F, N, (1.6 - 0.9 * abs(t)) * cm, (2.0 - 1.1 * abs(t)) * cm) for t in ts]
    b.loft(path, sections, "wood", sides=8)
    b.tube(o - H * 6 * cm + F * 1 * cm, o + H * 6 * cm + F * 1 * cm, 2.0 * cm, 2.0 * cm, "rawhide", (F, N))
    b.tube(path[0], path[-1], 0.18 * cm, 0.18 * cm, "rawhide", (F, N), sides=4, caps=False)


def build_rifle(b, o, H, F, N):
    cm = 1.0
    bore = o + H * 6.5 * cm
    # Barrel and the magazine tube under it.
    b.tube(bore + F * 8 * cm, bore + F * 74 * cm, 1.0 * cm, 0.85 * cm, "iron", (H, N), steps=2)
    b.tube(bore - H * 2.0 * cm + F * 8 * cm, bore - H * 2.0 * cm + F * 62 * cm, 0.75 * cm, 0.75 * cm, "iron", (H, N))
    b.block(bore + F * 72 * cm + H * 1.2 * cm, F, H, N, (0.4 * cm, 0.5 * cm, 0.15 * cm), "brass")      # front sight
    # Receiver (brass), forestock and buttstock (walnut).
    b.block(bore - H * 1.5 * cm + F * 3 * cm, F, H, N, (6.0 * cm, 2.8 * cm, 1.5 * cm), "brass")
    b.block(bore - H * 2.6 * cm + F * 22 * cm, F, H, N, (12.0 * cm, 1.8 * cm, 1.7 * cm), "wood_dark")
    stock_path = [bore - H * 2.5 * cm - F * 3 * cm, o - F * 2 * cm, o - H * 2.5 * cm - F * 14 * cm,
                  o - H * 5.5 * cm - F * 26 * cm, o - H * 7.5 * cm - F * 36 * cm]
    stock_sections = [(H, N, 2.6 * cm, 1.5 * cm), (H, N, 1.9 * cm, 1.5 * cm), (H, N, 3.2 * cm, 1.8 * cm),
                      (H, N, 4.6 * cm, 2.0 * cm), (H, N, 5.6 * cm, 2.1 * cm)]
    b.loft(stock_path, stock_sections, "wood_dark", sides=8)
    # Lever loop under the grip.
    centre = o - H * 3.5 * cm + F * 3.5 * cm
    ring = [centre + F * (math.cos(a) * 3.0 * cm) - H * (math.sin(a) * 2.0 * cm) for a in np.linspace(0.3, 2 * math.pi - 0.3, 12)]
    tangents = [(ring[min(i + 1, 11)] - ring[max(i - 1, 0)]).normalized() for i in range(12)]
    b.loft(ring, [(N, t.cross(N).normalized(), 0.35 * cm, 0.35 * cm) for t in tangents], "iron", sides=6)


def build_arrow(b):
    """Along +X (Unreal forward), tip at the origin, 75 cm long."""
    cm = 1.0
    X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    b.tube(Vector((-75 * cm, 0, 0)), Vector((-4 * cm, 0, 0)), 0.45 * cm, 0.45 * cm, "wood", (Y, Z), sides=6, steps=2)
    # Knapped stone point.
    path = [Vector((t * cm, 0, 0)) for t in (-5.0, -3.5, -1.5, 0.0)]
    b.loft(path, [(Y, Z, w * cm, 0.25 * cm) for w in (0.5, 1.2, 0.8, 0.05)], "stone", sides=6)
    # Three fletches (thin flattened lofts) at the nock end.
    for k in range(3):
        a = 2 * math.pi * k / 3
        d = Y * math.cos(a) + Z * math.sin(a)
        side = d.cross(X).normalized()
        path = [Vector((t * cm, 0, 0)) + d * (h * cm) for t, h in ((-73, 0.9), (-68, 1.6), (-61, 1.1), (-58, 0.5))]
        b.loft(path, [(d, side, 0.7 * cm, 0.06 * cm)] * 4, "feather", sides=4)


# --- Texture -------------------------------------------------------------------------------------

def paint_atlas(size=256):
    h = w = size
    img = np.zeros((h, w, 3))
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:h, 0:w]

    def zone(name, colour, pattern=None):
        u0, v0, u1, v1 = ZONES[name]
        rows = slice(int(v0 * h), int(v1 * h))
        cols = slice(int(u0 * w), int(u1 * w))
        block = np.ones((rows.stop - rows.start, cols.stop - cols.start, 3)) * np.array(colour)
        if pattern is not None:
            block = block * pattern(block.shape[0], block.shape[1])[..., None]
        img[rows, cols] = block

    grain = lambda hh, ww: 0.8 + 0.2 * np.sin(np.mgrid[0:hh, 0:ww][1] * 0.6 + rng.normal(0, 1.5, (hh, ww)).cumsum(axis=0) * 0.05)
    zone("wood", (0.55, 0.36, 0.20), grain)
    zone("wood_dark", (0.30, 0.17, 0.09), grain)
    zone("iron", (0.22, 0.22, 0.24), lambda hh, ww: 0.85 + 0.15 * rng.random((hh, ww)))
    zone("brass", (0.72, 0.55, 0.25), lambda hh, ww: 0.9 + 0.1 * rng.random((hh, ww)))
    zone("stone", (0.42, 0.40, 0.36), lambda hh, ww: 0.7 + 0.3 * rng.random((hh, ww)) ** 2)
    zone("rawhide", (0.80, 0.72, 0.55), lambda hh, ww: np.where((np.mgrid[0:hh, 0:ww][0] % 8) < 2, 0.6, 1.0))
    zone("red", (0.60, 0.08, 0.07), lambda hh, ww: 0.85 + 0.15 * rng.random((hh, ww)))
    # Feather: cream with a red tip along v.
    u0, v0, u1, v1 = ZONES["feather"]
    rows = slice(int(v0 * h), int(v1 * h))
    cols = slice(int(u0 * w), int(u1 * w))
    vv = np.linspace(0, 1, rows.stop - rows.start)[:, None, None]
    feather = np.where(vv > 0.6, np.array((0.62, 0.08, 0.07)), np.array((0.90, 0.86, 0.76)))
    img[rows, cols] = feather * np.ones((1, cols.stop - cols.start, 1))
    return np.clip(img, 0, 1)


def make_material(path):
    image = bpy.data.images.new("T_Weapons", width=256, height=256, alpha=False)
    pixels = paint_atlas()
    rgba = np.concatenate([pixels, np.ones((256, 256, 1))], axis=2).astype(np.float32)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    material = bpy.data.materials.new("M_Weapons")
    material.use_nodes = True
    tex = material.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    material.node_tree.links.new(tex.outputs["Color"], material.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    return material


# --- Export ----------------------------------------------------------------------------------------

def export_static(obj, path):
    for other in bpy.data.objects:
        other.select_set(other is obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"MESH"}, apply_scale_options="FBX_SCALE_ALL",
                             mesh_smooth_type="FACE", path_mode="STRIP", bake_anim=False)


def render_previews(objects):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x, scene.render.resolution_y = 900, 900
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.lens = 50
    held = [o for o in objects if o.name != "SM_Arrow"]
    for weapon in held:
        for o in held:
            o.hide_render = o is not weapon
        # From his front right, at hand height (centimetres).
        cam.location = (-260.0, -260.0, 150.0)
        cam.rotation_euler = (math.radians(85), 0.0, math.radians(-45))
        scene.render.filepath = os.path.join(OUT_DIR, "preview_" + weapon.name + ".png")
        bpy.ops.render.render(write_still=True)


def main():
    with open(os.path.join(CHARACTER_DIR, "manifest.json"), encoding="utf-8") as manifest_file:
        hand = json.load(manifest_file)["hand_r"]
    bpy.ops.wm.open_mainfile(filepath=os.path.join(CHARACTER_DIR, "Protagonist.blend"))
    shutil.rmtree(OUT_DIR, ignore_errors=True)
    os.makedirs(os.path.join(OUT_DIR, "textures"))
    material = make_material(os.path.join(OUT_DIR, "textures", "T_Weapons.png"))

    o, H, F, N = grip_frame(hand)
    objects = []
    for name, builder in (("SM_Tomahawk", build_tomahawk), ("SM_RockSledge", build_sledge), ("SM_Bow", build_bow),
                          ("SM_Rifle", build_rifle)):
        b = Builder()
        builder(b, o, H, F, N)
        objects.append(b.build(name, material))
    b = Builder()
    build_arrow(b)
    objects.append(b.build("SM_Arrow", material))

    if PREVIEW:
        render_previews(objects)
    for obj in objects:
        export_static(obj, os.path.join(OUT_DIR, obj.name + ".fbx"))
    manifest = {"meshes": [obj.name for obj in objects], "texture": "T_Weapons.png", "attach_bone": "hand_r"}
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as out:
        json.dump(manifest, out, indent=2)
    print("build_weapons: wrote", OUT_DIR)


main()
