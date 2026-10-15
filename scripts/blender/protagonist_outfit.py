"""The Protagonist's outfit, generated from his body: used by build_protagonist.py.

Modelled after the concept renders in renders/ (a fictional warrior): headband with a gold
medallion and side feathers, feather earrings, a beaded choker and layered bead necklaces with
medallions, braids with beads and feathers, upper-arm bands with fur and feathers, beaded
bracers, a wide belt with a disc buckle, a patterned front and back apron with fringe, layered
leather hip flaps, leather leggings, fur-cuffed boots with beaded bands, fringe and a disc, and
a long fur cape layered with red-tipped feathers.

Everything is generated geometry (body shells, bands, tubes, cards and discs) skinned to the
body's rig, with procedurally painted textures. Units are metres; the character faces -Y and
his left is +X.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

# Palette (sRGB 0..1), from the renders.
GOLD = (0.78, 0.56, 0.22)
GOLD_DARK = (0.45, 0.30, 0.10)
RED = (0.62, 0.08, 0.07)
TURQUOISE = (0.18, 0.62, 0.60)
CREAM = (0.90, 0.86, 0.76)
BONE = (0.82, 0.76, 0.62)
LEATHER = (0.36, 0.22, 0.13)
LEATHER_DARK = (0.22, 0.13, 0.08)
FUR = (0.24, 0.17, 0.12)
FUR_TIP = (0.55, 0.45, 0.35)
HAIR = (0.13, 0.10, 0.08)
BLACK = (0.05, 0.04, 0.04)


# --- Body sampling ----------------------------------------------------------------------------

class Body:
    """World-space vertices, deform weights, nearest-vertex lookup and ray casts on the body."""

    def __init__(self, basemesh, armature):
        """Only the skin is sampled: MakeHuman's helper geometry (skirt, tights, ...) is skipped."""
        self.armature = armature
        bones = {b.name for b in armature.data.bones}
        to_bone = {g.index: g.name for g in basemesh.vertex_groups if g.name in bones}
        groups = {g.name: g.index for g in basemesh.vertex_groups}
        mesh = basemesh.data

        def in_group(v, name):
            gi = groups.get(name)
            return gi is not None and any(g.group == gi and g.weight > 0.5 for g in v.groups)

        skin = [v for v in mesh.vertices if in_group(v, "body")]
        index = {v.index: i for i, v in enumerate(skin)}
        self.co = [basemesh.matrix_world @ v.co for v in skin]
        self.weights = [{to_bone[g.group]: g.weight for g in v.groups if g.group in to_bone and g.weight > 0.01}
                        for v in skin]
        self.kd = KDTree(len(self.co))
        for i, c in enumerate(self.co):
            self.kd.insert(c, i)
        self.kd.balance()
        polygons = [[index[i] for i in p.vertices] for p in mesh.polygons if all(i in index for i in p.vertices)]
        self.bvh = BVHTree.FromPolygons(self.co, polygons)
        self.group_verts = {"ears": [index[v.index] for v in skin if in_group(v, "ears")]}

    def bone(self, name):
        b = self.armature.data.bones[name]
        m = self.armature.matrix_world
        return m @ b.head_local, m @ b.tail_local

    def dominant(self, i):
        w = self.weights[i]
        return max(w, key=w.get) if w else None

    def weights_at(self, p, k=6):
        """Inverse-distance blend of the nearest vertices' weights, top 4, normalised."""
        total = {}
        for co, i, d in self.kd.find_n(p, k):
            f = 1.0 / max(d, 1e-4)
            for bone, w in self.weights[i].items():
                total[bone] = total.get(bone, 0.0) + w * f
        top = sorted(total.items(), key=lambda kv: -kv[1])[:4]
        s = sum(w for _, w in top) or 1.0
        return {b: w / s for b, w in top}

    def surface_y(self, x, z, from_front=True, default=None):
        """Y of the body's front (or back) surface at (x, z)."""
        origin = Vector((x, -2.0 if from_front else 2.0, z))
        hit, _, _, _ = self.bvh.ray_cast(origin, Vector((0.0, 1.0 if from_front else -1.0, 0.0)), 4.0)
        return hit.y if hit is not None else default

    def ring_points(self, axis_point, axis_dir, half_width, accept):
        """Body vertices within half_width of the plane through axis_point normal to axis_dir."""
        out = []
        for i, c in enumerate(self.co):
            if abs((c - axis_point).dot(axis_dir)) <= half_width and accept(i, c):
                out.append(c)
        return out


# --- Mesh building ----------------------------------------------------------------------------

class MeshBuilder:
    """Accumulates verts / faces / per-face UVs / per-vertex weights, then makes a skinned object."""

    def __init__(self):
        self.verts, self.faces, self.uvs, self.weights = [], [], [], []

    def add_vert(self, co, weights):
        self.verts.append(tuple(co))
        self.weights.append(weights)
        return len(self.verts) - 1

    def add_face(self, indices, uvs):
        self.faces.append(tuple(indices))
        self.uvs.append(list(uvs))

    def build(self, name, armature):
        if not self.faces:
            return None
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        uv_layer = mesh.uv_layers.new(name="UVMap")
        loop = 0
        for face_uvs in self.uvs:
            for uv in face_uvs:
                uv_layer.data[loop].uv = uv
                loop += 1
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for vi, bone_weights in enumerate(self.weights):
            for bone, w in bone_weights.items():
                group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
                group.add([vi], w, "REPLACE")
        obj.parent = armature
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = armature
        for poly in mesh.polygons:
            poly.use_smooth = True
        return obj


def perpendicular_frame(axis):
    """Two unit vectors perpendicular to axis. For a vertical axis, u is +X and v is +Y, so a
    ring's angle 0 points to his left, 90 degrees behind him and 270 degrees to his front."""
    axis = axis.normalized()
    if abs(axis.z) >= 0.9:
        u = Vector((1.0, 0.0, 0.0))
        u = (u - axis * u.dot(axis)).normalized()
    else:
        u = axis.cross(Vector((0.0, 0.0, 1.0))).normalized()
    v = axis.cross(u).normalized()
    return u, v


def add_band(mb, body, centre, axis, points, rows_t, offset, segments=32, u_repeats=4.0, v_range=(0.0, 1.0),
             bulge=0.0, weights=None, min_radius=0.02):
    """A closed band around an axis: rows_t are heights along the axis relative to centre."""
    axis = axis.normalized()
    pu, pv = perpendicular_frame(axis)
    radii = []
    for s in range(segments):
        a = 2 * math.pi * s / segments
        d = pu * math.cos(a) + pv * math.sin(a)
        best = 0.0
        for p in points:
            r = p - centre
            r = r - axis * r.dot(axis)
            if r.length < 1e-6:
                continue
            if r.normalized().dot(d) > math.cos(math.radians(14)):
                best = max(best, r.length)
        radii.append(max(best, min_radius))
    index = []
    n_rows = len(rows_t)
    for row, t in enumerate(rows_t):
        grow = 1.0 + bulge * math.sin(math.pi * row / max(1, n_rows - 1))
        row_idx = []
        for s in range(segments):
            a = 2 * math.pi * s / segments
            d = pu * math.cos(a) + pv * math.sin(a)
            p = centre + axis * t + d * ((radii[s] + offset) * grow)
            row_idx.append(mb.add_vert(p, weights(p) if weights else body.weights_at(p)))
        index.append(row_idx)
    v0, v1 = v_range
    for row in range(n_rows - 1):
        for s in range(segments):
            s2 = (s + 1) % segments
            a, b = index[row][s], index[row][s2]
            c, d = index[row + 1][s2], index[row + 1][s]
            u0, u1 = s / segments * u_repeats, (s + 1) / segments * u_repeats
            va = v0 + (v1 - v0) * row / (n_rows - 1)
            vb = v0 + (v1 - v0) * (row + 1) / (n_rows - 1)
            mb.add_face((a, b, c, d), [(u0, va), (u1, va), (u1, vb), (u0, vb)])
    return radii


def add_tube(mb, path, radius, weights, sides=8, v_per_metre=10.0, radius_end=None):
    """A tube along a polyline; u runs around, v along the length."""
    radius_end = radius if radius_end is None else radius_end
    rings, length = [], 0.0
    for i, p in enumerate(path):
        if i > 0:
            length += (p - path[i - 1]).length
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        pu, pv = perpendicular_frame(tangent)
        f = i / max(1, len(path) - 1)
        r = radius + (radius_end - radius) * f
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            ring.append(mb.add_vert(p + (pu * math.cos(a) + pv * math.sin(a)) * r, weights(p, f)))
        rings.append((ring, length))
    for i in range(len(rings) - 1):
        (ra, la), (rb, lb) = rings[i], rings[i + 1]
        for s in range(sides):
            s2 = (s + 1) % sides
            mb.add_face((ra[s], ra[s2], rb[s2], rb[s]),
                        [(s / sides, la * v_per_metre), ((s + 1) / sides, la * v_per_metre),
                         ((s + 1) / sides, lb * v_per_metre), (s / sides, lb * v_per_metre)])


def add_card(mb, root, direction, normal, length, width, weights, uv_rect=(0.0, 0.0, 1.0, 1.0), segments=3,
             droop=0.0, width_end=None):
    """A flat strip from root along direction (v = 0 at the root, 1 at the tip)."""
    direction = direction.normalized()
    side = direction.cross(normal).normalized()
    width_end = width if width_end is None else width_end
    u0, v0, u1, v1 = uv_rect
    rows = []
    for i in range(segments + 1):
        f = i / segments
        centre = root + direction * (length * f) + Vector((0.0, 0.0, -droop * f * f))
        w = width + (width_end - width) * f
        a = mb.add_vert(centre - side * (w / 2), weights(centre, f))
        b = mb.add_vert(centre + side * (w / 2), weights(centre, f))
        rows.append((a, b, v0 + (v1 - v0) * f))
    for i in range(segments):
        (a, b, va), (c, d, vb) = rows[i], rows[i + 1]
        mb.add_face((a, b, d, c), [(u0, va), (u1, va), (u1, vb), (u0, vb)])


def add_card_path(mb, path, normals, widths, weights, uv_rect=(0.0, 0.0, 1.0, 1.0)):
    """A strip through a list of points (each with its own normal and width)."""
    u0, v0, u1, v1 = uv_rect
    rows = []
    total = sum((path[i] - path[i - 1]).length for i in range(1, len(path))) or 1.0
    run = 0.0
    for i, p in enumerate(path):
        if i > 0:
            run += (p - path[i - 1]).length
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        side = tangent.cross(normals[i]).normalized()
        f = run / total
        a = mb.add_vert(p - side * (widths[i] / 2), weights(p, f))
        b = mb.add_vert(p + side * (widths[i] / 2), weights(p, f))
        rows.append((a, b, v0 + (v1 - v0) * f))
    for i in range(len(rows) - 1):
        (a, b, va), (c, d, vb) = rows[i], rows[i + 1]
        mb.add_face((a, b, d, c), [(u0, va), (u1, va), (u1, vb), (u0, vb)])


def add_disc(mb, centre, normal, radius, thickness, weights, segments=24, spike=0.0):
    """A coin-like disc facing along normal; uv maps the face onto the whole texture."""
    normal = normal.normalized()
    pu, pv = perpendicular_frame(normal)
    w = weights(centre, 0.0)
    front_c = mb.add_vert(centre + normal * thickness, w)
    front, back = [], []
    for s in range(segments):
        a = 2 * math.pi * s / segments
        d = pu * math.cos(a) + pv * math.sin(a)
        front.append(mb.add_vert(centre + d * radius + normal * thickness, w))
        back.append(mb.add_vert(centre + d * radius, w))
    for s in range(segments):
        s2 = (s + 1) % segments
        a0, a1 = 2 * math.pi * s / segments, 2 * math.pi * s2 / segments
        mb.add_face((front_c, front[s], front[s2]),
                    [(0.5, 0.5), (0.5 + 0.5 * math.cos(a0), 0.5 + 0.5 * math.sin(a0)),
                     (0.5 + 0.5 * math.cos(a1), 0.5 + 0.5 * math.sin(a1))])
        mb.add_face((back[s], back[s2], front[s2], front[s]), [(0.02, 0.5), (0.04, 0.5), (0.04, 0.52), (0.02, 0.52)])
    if spike > 0.0:
        up = pv if pv.z >= 0.0 else -pv
        tip = mb.add_vert(centre + up * (radius + spike) + normal * thickness * 0.5, w)
        left = mb.add_vert(centre + up * radius * 0.85 + pu * radius * 0.18 + normal * thickness * 0.5, w)
        right = mb.add_vert(centre + up * radius * 0.85 - pu * radius * 0.18 + normal * thickness * 0.5, w)
        mb.add_face((left, right, tip), [(0.45, 0.9), (0.55, 0.9), (0.5, 1.0)])


# --- Shells copied from the body --------------------------------------------------------------

def body_shell(basemesh, name, keep, offset, smooth=2, axis_for=None, u_repeats=3.0, v_scale=2.0):
    """Copies the body faces whose vertices all satisfy keep(index, co, dominant_bone, weights),
    pushes them out by offset and gives them UVs around axis_for(co) -> (head, tail)."""
    shell = basemesh.copy()
    shell.data = basemesh.data.copy()
    shell.name = name
    bpy.context.scene.collection.objects.link(shell)
    for modifier in list(shell.modifiers):
        if modifier.type != "ARMATURE":
            shell.modifiers.remove(modifier)
    bones = {b.name for b in basemesh.find_armature().data.bones}
    to_bone = {g.index: g.name for g in shell.vertex_groups if g.name in bones}
    bm = bmesh.new()
    bm.from_mesh(shell.data)
    dl = bm.verts.layers.deform.verify()
    bm.verts.ensure_lookup_table()
    kept = set()
    for v in bm.verts:
        w = {to_bone[g]: x for g, x in v[dl].items() if g in to_bone}
        dom = max(w, key=w.get) if w else None
        if keep(v.index, v.co, dom, v[dl]):
            kept.add(v.index)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in kept for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.4,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        head, tail = axis_for(face.calc_center_median())
        axis = tail - head
        pu, pv = perpendicular_frame(axis)
        previous = None
        for loop in face.loops:
            p = loop.vert.co
            t = (p - head).dot(axis) / axis.length_squared
            r = p - (head + axis * t)
            angle = math.atan2(r.dot(pv), r.dot(pu))
            if previous is not None:
                while angle - previous > math.pi:
                    angle -= 2 * math.pi
                while previous - angle > math.pi:
                    angle += 2 * math.pi
            previous = angle
            loop[uv].uv = (angle / (2 * math.pi) * u_repeats, t * axis.length * v_scale)
    bm.to_mesh(shell.data)
    bm.free()
    for group in list(shell.vertex_groups):
        if group.name not in bones:
            shell.vertex_groups.remove(group)
    return shell, kept


def melt_toes(obj, below_z, iterations=25):
    """Smooths a boot below the ankle until the toes merge into one rounded toe box, then pushes it
    back out to its former extent (smoothing shrinks it)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    foot = [v for v in bm.verts if v.co.z < below_z and not v.is_boundary]
    before = {v: v.co.copy() for v in foot}
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=foot, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    # Push the whole foot out by the average inward movement (per-vertex amounts would restore the
    # toes), but keep the sole on the ground.
    shrink = sum(max(0.0, (before[v] - v.co).dot(v.normal)) for v in foot) / max(1, len(foot))
    for v in foot:
        v.co += v.normal * (shrink + 0.004)
        if before[v].z < 0.02:
            v.co.z = max(v.co.z, before[v].z - 0.002)
    bm.to_mesh(obj.data)
    bm.free()


def build_shells(basemesh, armature):
    """Leggings, boots, bracers and the hip flaps. Returns ([(obj, part)], covered body vertex indices)."""
    a = armature.data.bones
    m = armature.matrix_world
    hip_z = (m @ a["pelvis"].head_local).z - 0.03
    knee_z = (m @ a["calf_l"].head_local).z
    boot_top = knee_z - 0.09
    body_gi = basemesh.vertex_groups["body"].index
    skirt_gi = basemesh.vertex_groups["helper-skirt"].index

    def on_body(w):
        return w.get(body_gi, 0.0) > 0.5

    def leg_axis(p):
        side = "l" if p.x > 0 else "r"
        return m @ a["thigh_" + side].head_local, m @ a["calf_" + side].tail_local

    def arm_axis(p):
        side = "l" if p.x > 0 else "r"
        return m @ a["lowerarm_" + side].head_local, m @ a["lowerarm_" + side].tail_local

    def t_along(p, bone):
        head, tail = m @ a[bone].head_local, m @ a[bone].tail_local
        axis = tail - head
        return (p - head).dot(axis) / axis.length_squared

    leg_bones = {"thigh_l", "thigh_r", "calf_l", "calf_r"}
    foot_bones = {"calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"}
    shells, covered = [], set()

    leggings, kept = body_shell(
        basemesh, "Leggings",
        lambda i, co, dom, w: on_body(w) and dom in leg_bones and boot_top - 0.04 <= co.z <= hip_z,
        offset=0.006, axis_for=leg_axis, u_repeats=2.0)
    shells.append((leggings, "Leather"))
    covered |= kept

    boots, kept = body_shell(
        basemesh, "Boots",
        lambda i, co, dom, w: on_body(w) and dom in foot_bones and co.z <= boot_top,
        offset=0.014, smooth=2, axis_for=leg_axis, u_repeats=2.0)
    ankle_z = (m @ a["foot_l"].head_local).z
    melt_toes(boots, ankle_z)
    shells.append((boots, "BootLeather"))
    covered |= kept

    def bracer(i, co, dom, w):
        if not on_body(w) or dom not in ("lowerarm_l", "lowerarm_r"):
            return False
        return t_along(co, dom) >= 0.42

    bracers, kept = body_shell(basemesh, "Bracers", bracer, offset=0.009, axis_for=arm_axis, u_repeats=3.0, v_scale=3.0)
    shells.append((bracers, "Beadwork"))
    covered |= kept

    mid_thigh = knee_z + 0.10
    flaps, _ = body_shell(
        basemesh, "HipFlaps",
        lambda i, co, dom, w: w.get(skirt_gi, 0.0) > 0.5 and co.z >= mid_thigh,
        offset=0.012, smooth=1,
        axis_for=lambda p: (Vector((0.0, 0.0, hip_z + 0.05)), Vector((0.0, 0.0, mid_thigh))),
        u_repeats=6.0, v_scale=1.0 / max(0.05, hip_z + 0.05 - mid_thigh))
    shells.append((flaps, "HipFlaps"))
    return shells, covered


# --- Accessories --------------------------------------------------------------------------------

def build_accessories(basemesh, armature, parts):
    """Everything that is not a body shell. Returns [(obj, part)]."""
    body = Body(basemesh, armature)
    out = []
    head_h, head_t = body.bone("head")
    neck_h, _ = body.bone("neck_01")
    spine3_h, spine3_t = body.bone("spine_03")
    pelvis_h, _ = body.bone("pelvis")
    spine1_h, _ = body.bone("spine_01")
    knee_z = body.bone("calf_l")[0].z
    hair = parts.get("long01")
    brows = parts.get("eyebrow001")
    brow_top = max((brows.matrix_world @ v.co).z for v in brows.data.vertices) if brows else head_h.z + 0.08
    head_weights = lambda p, f=0.0: {"head": 1.0}

    def torso_only(i, c):
        return body.dominant(i) in ("spine_01", "spine_02", "spine_03", "pelvis", "neck_01", "clavicle_l", "clavicle_r")

    # Headband with a front medallion, a small spike and two side feathers.
    mb = MeshBuilder()
    band_z = brow_top + 0.03
    pts = [c for c in body.co if abs(c.z - band_z) < 0.012]
    if hair:
        pts += [hair.matrix_world @ v.co for v in hair.data.vertices if abs((hair.matrix_world @ v.co).z - band_z) < 0.012]
    centre = Vector((0.0, head_h.y, band_z))
    radii = add_band(mb, body, centre, Vector((0, 0, 1)), pts, [-0.018, 0.0, 0.018], offset=0.006, segments=36,
                     u_repeats=3.0, v_range=(0.0, 0.18), weights=head_weights)
    out.append((mb.build("Headband", armature), "Beadwork"))
    front_r = radii[27]  # segment 27 of 36 points along -Y
    mb = MeshBuilder()
    add_disc(mb, centre + Vector((0, -front_r - 0.012, 0.004)), Vector((0, -1, 0.15)), 0.032, 0.006, head_weights, spike=0.035)
    out.append((mb.build("HeadMedallion", armature), "Gold"))
    mb = MeshBuilder()
    for sign in (1, -1):
        root = centre + Vector((sign * (radii[0 if sign > 0 else 18] + 0.01), 0.0, 0.0))
        add_card(mb, root, Vector((sign * 0.45, 0.05, 1.0)), Vector((0, -1, 0)), 0.11, 0.035, head_weights,
                 uv_rect=(0.5, 0.0, 1.0, 1.0))
    out.append((mb.build("HeadFeathers", armature), "Feather"))

    # Feather earrings with a gold disc below each ear lobe.
    mb, mb_gold = MeshBuilder(), MeshBuilder()
    for sign in (1, -1):
        ear = [body.co[i] for i in body.group_verts["ears"] if body.co[i].x * sign > 0]
        if not ear:
            continue
        # Out through the hair that covers his ears, and a little forward of it.
        lobe = min(ear, key=lambda c: c.z) + Vector((sign * 0.02, -0.015, 0.0))
        add_disc(mb_gold, lobe + Vector((0.0, 0.0, -0.025)), Vector((sign, -0.6, 0)), 0.017, 0.004, head_weights)
        add_card(mb, lobe + Vector((0.0, -0.004, -0.04)), Vector((0, 0, -1)), Vector((0, -1, 0)), 0.10, 0.035,
                 head_weights, uv_rect=(0.0, 0.0, 0.5, 1.0))
    out.append((mb.build("Earrings", armature), "Feather"))
    out.append((mb_gold.build("EarDiscs", armature), "Gold"))

    # Beaded choker.
    mb = MeshBuilder()
    neck_z = neck_h.z
    pts = [c for i, c in enumerate(body.co) if abs(c.z - neck_z) < 0.012 and body.dominant(i) in ("neck_01", "head", "spine_03")]
    add_band(mb, body, Vector((0.0, neck_h.y, neck_z)), Vector((0, 0, 1)), pts, [-0.02, 0.0, 0.02], offset=0.006,
             segments=28, u_repeats=4.0, v_range=(0.3, 0.55))
    out.append((mb.build("Choker", armature), "Beadwork"))

    # Layered bead necklaces draped over the chest, with medallions on the longer ones.
    mb_beads, mb_gold = MeshBuilder(), MeshBuilder()
    top_z = neck_h.z - 0.015
    drops = (0.04, 0.065, 0.09, 0.12, 0.15, 0.185, 0.22, 0.26)
    for k, drop in enumerate(drops):
        half = 0.075 + drop * 0.4
        path = []
        for j in range(25):
            s = -1.0 + 2.0 * j / 24
            x = s * half
            z = top_z - drop * (1.0 - s * s) - 0.006 * k
            y = body.surface_y(x, z, True, neck_h.y - 0.05)
            path.append(Vector((x, y - 0.009, z)))
        add_tube(mb_beads, path, 0.0065 + 0.002 * (k % 3 == 1), lambda p, f: body.weights_at(p), sides=6,
                 v_per_metre=14.0 + 3.0 * (k % 3))
        if k in (3, 7):
            bottom = path[12]
            r = 0.05 if k == 7 else 0.035
            add_disc(mb_gold, bottom + Vector((0, -0.01, -r * 0.8)), Vector((0, -1, 0.1)), r, 0.007,
                     lambda p, f: body.weights_at(p))
    out.append((mb_beads.build("Necklaces", armature), "Beads"))
    out.append((mb_gold.build("ChestMedallions", armature), "Gold"))

    # Upper-arm bands with a fur roll below and three hanging feathers.
    mb_band, mb_fur, mb_feather = MeshBuilder(), MeshBuilder(), MeshBuilder()
    for side in ("l", "r"):
        sh, st = body.bone("upperarm_" + side)
        axis = st - sh
        for t0, t1, builder, offset, bulge in ((0.30, 0.40, mb_band, 0.006, 0.0), (0.40, 0.52, mb_fur, 0.008, 0.3)):
            c = sh + axis * ((t0 + t1) / 2)
            pts = body.ring_points(c, axis.normalized(), 0.02, lambda i, co, s=side: body.dominant(i) in ("upperarm_" + s,))
            half = axis.length * (t1 - t0) / 2
            add_band(builder, body, c, axis, pts, list(np.linspace(-half, half, 5)), offset=offset, segments=24, bulge=bulge,
                     u_repeats=3.0, v_range=(0.6, 0.85) if builder is mb_band else (0.0, 0.6))
        # In the bind (T) pose the top of the arm is what faces outward once the arm hangs, so the
        # feathers lie along the top, pointing to the elbow.
        c = sh + axis * 0.45
        top = max(pts, key=lambda q: q.z).z if pts else c.z + 0.05
        along = axis.normalized()
        for n in range(3):
            root = Vector((c.x, c.y - 0.025 + 0.025 * n, top + 0.012))
            add_card(mb_feather, root, along + Vector((0.0, 0.12 * (n - 1), 0.08)), Vector((0, 0, 1)),
                     0.17 + 0.03 * (n % 2), 0.04, lambda p, f: body.weights_at(p), uv_rect=(0.0, 0.0, 0.5, 1.0))
    out.append((mb_band.build("ArmBands", armature), "Beadwork"))
    out.append((mb_fur.build("ArmFur", armature), "FurLight"))
    out.append((mb_feather.build("ArmFeathers", armature), "Feather"))

    # Wide belt with a disc buckle and a white feather hanging from it.
    waist_z = spine1_h.z - 0.03
    mb = MeshBuilder()
    pts = [c for i, c in enumerate(body.co) if abs(c.z - waist_z) < 0.02 and torso_only(i, c)]
    radii = add_band(mb, body, Vector((0.0, pelvis_h.y, waist_z)), Vector((0, 0, 1)), pts, [-0.06, 0.0, 0.05],
                     offset=0.016, segments=36, u_repeats=6.0, v_range=(0.85, 1.0),
                     weights=lambda p: {"spine_01": 0.5, "pelvis": 0.5})
    out.append((mb.build("Belt", armature), "Beadwork"))
    front_y = pelvis_h.y - radii[27] - 0.016
    mb = MeshBuilder()
    add_disc(mb, Vector((0.0, front_y - 0.004, waist_z - 0.005)), Vector((0, -1, 0)), 0.06, 0.008,
             lambda p, f: {"pelvis": 1.0})
    out.append((mb.build("BeltBuckle", armature), "Gold"))

    # Front and back aprons hanging from the belt, between the thighs.
    belt_bottom = waist_z - 0.06
    apron_len = belt_bottom - (knee_z - 0.04)
    mb_apron, mb_feather = MeshBuilder(), MeshBuilder()
    for front in (True, False):
        path, normals, widths = [], [], []
        for j in range(7):
            f = j / 6
            z = belt_bottom - apron_len * f
            ys = [body.surface_y(x, z, front) for x in (-0.09, 0.09)]
            ys = [y for y in ys if y is not None]
            base = (min(ys) if front else max(ys)) if ys else (pelvis_h.y + (-0.12 if front else 0.12))
            y = base - 0.05 if front else base + 0.05
            path.append(Vector((0.0, y, z)))
            normals.append(Vector((0, -1 if front else 1, 0)))
            widths.append(0.19 + 0.03 * f)
        add_card_path(mb_apron, path, normals, widths,
                      lambda p, f: {"pelvis": 1.0 - 0.6 * f, "thigh_l": 0.3 * f, "thigh_r": 0.3 * f})
        if front:
            add_card(mb_feather, path[0] + Vector((0.0, -0.012, -0.03)), Vector((0, -0.05, -1)), Vector((0, -1, 0)),
                     0.26, 0.06, lambda p, f: {"pelvis": 1.0 - 0.5 * f, "thigh_l": 0.25 * f, "thigh_r": 0.25 * f},
                     uv_rect=(0.0, 0.0, 0.5, 1.0))
    out.append((mb_apron.build("Aprons", armature), "Apron"))
    out.append((mb_feather.build("BeltFeather", armature), "Feather"))

    # Boot tops: a beaded band, a fur cuff above it, fringe hanging from it and a disc at the ankle.
    mb_band, mb_fur, mb_fringe, mb_disc = MeshBuilder(), MeshBuilder(), MeshBuilder(), MeshBuilder()
    boot_top = knee_z - 0.09
    for side in ("l", "r"):
        ch, ct = body.bone("calf_" + side)
        axis = (ct - ch).normalized()
        t = (boot_top - ch.z) / (ct.z - ch.z)
        c = ch + (ct - ch) * t
        pts = body.ring_points(c, axis, 0.02, lambda i, co, s=side: body.dominant(i) in ("calf_" + s,))
        add_band(mb_band, body, c, axis, pts, [-0.03, 0.0, 0.01], offset=0.022, segments=24, u_repeats=3.0,
                 v_range=(0.55, 0.8))
        radii = add_band(mb_fur, body, c + axis * -0.055, axis, pts, list(np.linspace(-0.035, 0.035, 5)), offset=0.018,
                         segments=24, bulge=0.25, u_repeats=3.0, v_range=(0.0, 0.6))
        pu, pv = perpendicular_frame(axis)
        for s in range(14):
            a = 2 * math.pi * s / 14
            d = pu * math.cos(a) + pv * math.sin(a)
            root = c + d * (radii[int(s * 24 / 14)] + 0.028) + axis * 0.012
            add_card(mb_fringe, root, axis + d * 0.15, d, 0.07, 0.05, lambda p, f: body.weights_at(p),
                     uv_rect=(0.0, 0.85, 1.0, 1.0), segments=1)
        sign = 1 if side == "l" else -1
        fh, _ = body.bone("foot_" + side)
        add_disc(mb_disc, fh + Vector((sign * 0.055, 0.0, 0.0)), Vector((sign, 0, 0)), 0.022, 0.005,
                 lambda p, f: body.weights_at(p))
    out.append((mb_band.build("BootBands", armature), "Beadwork"))
    out.append((mb_fur.build("BootFur", armature), "FurLight"))
    out.append((mb_fringe.build("BootFringe", armature), "Apron"))
    out.append((mb_disc.build("BootDiscs", armature), "Gold"))

    # Long fur cape from the shoulders to just above the ground, layered with feathers.
    cape, cape_y = build_cape(body, armature)
    out.extend(cape)

    # Braids: one over his left shoulder down the chest, three down the back over the cape;
    # beads and feathers.
    mb_braid, mb_feather = MeshBuilder(), MeshBuilder()
    ear_z = brow_top - 0.05

    def braid_weights(p, f):
        if f < 0.12:
            return {"head": 1.0}
        if f < 0.25:
            return {"head": 0.5, "neck_01": 0.5}
        return body.weights_at(p)

    path = [Vector((0.075, head_h.y + 0.01, ear_z)), Vector((0.10, head_h.y + 0.0, ear_z - 0.08)),
            Vector((0.13, head_h.y - 0.02, neck_h.z - 0.02))]
    for z in np.linspace(neck_h.z - 0.08, spine1_h.z + 0.02, 6):
        y = body.surface_y(0.12, float(z), True, spine3_h.y - 0.12)
        path.append(Vector((0.12, y - 0.03, float(z))))
    add_tube(mb_braid, path, 0.022, braid_weights, sides=8, v_per_metre=12.0, radius_end=0.013)
    add_card(mb_feather, path[-1] + Vector((0, -0.01, -0.01)), Vector((0, 0, -1)), Vector((0, -1, 0)), 0.14, 0.04,
             lambda p, f: body.weights_at(p), uv_rect=(0.0, 0.0, 0.5, 1.0))
    for x in (-0.07, 0.0, 0.07):
        path = [Vector((x * 0.6, head_h.y + 0.08, ear_z + 0.02)), Vector((x * 0.8, head_h.y + 0.10, neck_h.z))]
        for z in np.linspace(neck_h.z - 0.06, pelvis_h.z - 0.05, 7):
            y = max(body.surface_y(x, float(z), False, spine3_h.y + 0.12) + 0.045, cape_y(float(z)) + 0.025)
            path.append(Vector((x, y, float(z))))
        add_tube(mb_braid, path, 0.018, braid_weights, sides=8, v_per_metre=12.0, radius_end=0.011)
        for n, f in enumerate((0.45, 0.75, 1.0)):
            i = min(len(path) - 1, int(f * (len(path) - 1)))
            add_card(mb_feather, path[i] + Vector((0, 0.015, -0.01)), Vector((0, 0.05, -1)), Vector((0, 1, 0)),
                     0.12 + 0.03 * n, 0.04, lambda p, f: body.weights_at(p),
                     uv_rect=(0.0 if n % 2 == 0 else 0.5, 0.0, 0.5 if n % 2 == 0 else 1.0, 1.0))
    out.append((mb_braid.build("Braids", armature), "Braid"))
    out.append((mb_feather.build("BraidFeathers", armature), "Feather"))
    return out


def build_cape(body, armature):
    shoulder_z = body.bone("clavicle_l")[0].z + 0.02
    back_y = body.surface_y(0.0, shoulder_z - 0.06, False, 0.12)
    rows, cols = 14, 15
    bottom_z = 0.22
    yc = back_y - 0.10

    def cape_weights(s):
        if s < 0.2:
            return {"spine_03": 1.0}
        if s < 0.45:
            return {"spine_03": 0.5, "spine_02": 0.5}
        if s < 0.7:
            return {"spine_01": 0.6, "pelvis": 0.4}
        return {"pelvis": 1.0}

    def point(s, c):
        z = shoulder_z + (bottom_z - shoulder_z) * s
        radius = 0.13 + 0.30 * s ** 0.8
        span = math.radians(70 + 35 * s)
        a = -span + 2 * span * c
        return Vector((math.sin(a) * (0.20 + 0.22 * s), yc + math.cos(a) * radius, z))

    mb = MeshBuilder()
    grid = []
    for r in range(rows + 1):
        s = r / rows
        grid.append([mb.add_vert(point(s, c / cols), cape_weights(s)) for c in range(cols + 1)])
    for r in range(rows):
        for c in range(cols):
            u0, u1 = c / cols * 2.0, (c + 1) / cols * 2.0
            v0, v1 = r / rows, (r + 1) / rows
            mb.add_face((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]),
                        [(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    cape = mb.build("Cape", armature)

    mb = MeshBuilder()
    for k, s in enumerate((0.12, 0.3, 0.48, 0.66)):
        n = 6 + k
        for j in range(n):
            c = (j + 0.5 + 0.25 * (k % 2)) / (n + 0.5)
            p = point(s, c)
            outward = Vector((p.x, p.y - yc, 0.0)).normalized()
            variant = (j + k) % 3
            add_card(mb, p + outward * 0.02, Vector((outward.x * 0.15, outward.y * 0.15, -1.0)), outward,
                     0.26 + 0.04 * (k % 2), 0.07, lambda q, f, s=s: cape_weights(min(1.0, s + 0.15 * f)),
                     uv_rect=(0.0, 0.0, 0.5, 1.0) if variant else (0.5, 0.0, 1.0, 1.0))
    def outer_y(z):
        """Y of the cape's middle at height z (for laying things over it)."""
        s = max(0.0, min(1.0, (z - shoulder_z) / (bottom_z - shoulder_z)))
        return point(s, 0.5).y

    return [(cape, "Fur"), (mb.build("CapeFeathers", armature), "Feather")], outer_y


# --- Textures -------------------------------------------------------------------------------------

def _noise(h, w, seed, scale=0.08):
    rng = np.random.default_rng(seed)
    return 1.0 + scale * rng.normal(0.0, 1.0, (h, w, 1))


def paint_beadwork(size=512):
    """Rows of beads and gold plates: headband, choker, bracers, arm and boot bands, belt."""
    h = w = size
    img = np.zeros((h, w, 3))
    rows = [GOLD, RED, TURQUOISE, GOLD_DARK, CREAM, RED, TURQUOISE, GOLD, LEATHER_DARK, RED, TURQUOISE, GOLD,
            CREAM, RED, GOLD_DARK, TURQUOISE]
    rh = h // len(rows)
    y, x = np.mgrid[0:rh, 0:w]
    for i, colour in enumerate(rows):
        band = np.ones((rh, w, 3)) * np.array(colour)
        if colour in (GOLD, GOLD_DARK):
            band *= (0.85 + 0.15 * np.cos(x / 6.0))[..., None]            # engraved plate
            band[(y < 2) | (y >= rh - 2)] *= 0.5
        else:
            bead = rh * 0.8
            cx = (x % bead) - bead / 2
            cy = y - rh / 2
            d = np.sqrt(cx ** 2 + cy ** 2) / (bead / 2)
            band *= np.clip(1.15 - d * 0.6, 0.35, 1.2)[..., None]          # round beads
            band[d > 1.0] = BLACK
        img[i * rh:(i + 1) * rh] = band
    return np.clip(img * _noise(h, w, 11, 0.04), 0, 1)


def paint_gold(size=256):
    """Medallion: engraved concentric rings and rays, red and turquoise inlay."""
    h = w = size
    y, x = (np.mgrid[0:h, 0:w] + 0.5) / size * 2 - 1
    r = np.sqrt(x * x + y * y)
    a = np.arctan2(y, x)
    img = np.ones((h, w, 3)) * np.array(GOLD)
    img *= (0.8 + 0.2 * np.cos(r * 40))[..., None]
    rays = (np.abs(np.sin(a * 8)) > 0.85) & (r > 0.35) & (r < 0.75)
    img[rays] = GOLD_DARK
    img[(r > 0.18) & (r < 0.3)] = TURQUOISE
    img[r <= 0.18] = RED
    img[(np.abs(r - 0.85) < 0.03) | (np.abs(r - 0.32) < 0.02)] = GOLD_DARK
    return np.clip(img * _noise(h, w, 12, 0.03), 0, 1)


def paint_leather(colour, seed, size=512):
    h = w = size
    y, x = np.mgrid[0:h, 0:w]
    img = np.ones((h, w, 3)) * np.array(colour)
    rng = np.random.default_rng(seed)
    blotch = rng.normal(0, 1, (h // 16 + 1, w // 16 + 1))
    blotch = np.kron(blotch, np.ones((16, 16)))[:h, :w]
    img *= (1.0 + 0.08 * blotch)[..., None]
    stitches = (((x % 128) < 2) & ((y % 12) < 7))
    img[stitches] *= 0.55
    return np.clip(img * _noise(h, w, seed + 1, 0.05), 0, 1)


def paint_fur(size=512, base=FUR, tips=FUR_TIP):
    """Strands with lighter tips; the bottom edge is ragged (alpha)."""
    h = w = size
    rng = np.random.default_rng(13)
    y, x = np.mgrid[0:h, 0:w]
    strand = rng.normal(0, 1, (1, w)) * np.ones((h, 1))
    v = y / h
    img = np.ones((h, w, 3)) * np.array(base)
    img *= (0.85 + 0.15 * np.tanh(strand))[..., None]
    tip = (np.sin(v * 40 + strand * 2) > 0.6)
    img[tip] = img[tip] * 0.4 + np.array(tips) * 0.6
    cut = 0.86 + 0.12 * rng.random(w)
    alpha = (v < cut[None, :]).astype(float)
    return np.clip(np.concatenate([img * _noise(h, w, 14, 0.06), alpha[..., None]], axis=2), 0, 1)


def paint_feathers(width=512, height=256):
    """Two feathers side by side along v (0 = quill end, 1 = tip): cream with a red tip, dark brown
    with a cream tip. Rows are v, columns u."""
    h, w = width, height  # tall texture: v runs down the image rows
    img = np.zeros((h, w * 2, 4))
    v = (np.arange(h) + 0.5) / h
    for k, (body_c, tip_c, tip_from) in enumerate(((CREAM, RED, 0.62), ((0.42, 0.30, 0.20), CREAM, 0.8))):
        u = (np.arange(w) + 0.5) / w * 2 - 1
        vv, uu = np.meshgrid(v, u, indexing="ij")
        # Widens quickly past the bare quill, stays wide, then tapers to a point.
        half = 0.9 * np.clip((vv - 0.06) / 0.1, 0, 1) * np.clip((1.0 - vv) / 0.35, 0, 1) ** 0.6
        inside = np.abs(uu) < half
        colour = np.where((vv > tip_from)[..., None], np.array(tip_c), np.array(body_c))
        barbs = 0.85 + 0.15 * np.sin((vv * 90 + np.abs(uu) * 25))
        colour = colour * barbs[..., None]
        quill = np.abs(uu) < 0.05
        colour[quill] = np.array(BONE) * 0.8
        alpha = (inside | (quill & (vv < 0.97))).astype(float)
        img[:, k * w:(k + 1) * w, :3] = colour
        img[:, k * w:(k + 1) * w, 3] = alpha
    return np.clip(img, 0, 1)


def paint_apron(width=256, height=512):
    """Red panel with black and turquoise diamonds, a cream border and fringe at the bottom
    (the bottom 15% of v; boot fringe uses that strip)."""
    h, w = height, width
    y, x = np.mgrid[0:h, 0:w]
    v = y / h
    u = x / w
    img = np.ones((h, w, 3)) * np.array(RED)
    du = np.abs(((u * 3) % 1.0) - 0.5) * 2
    dv = np.abs(((v * 7) % 1.0) - 0.5) * 2
    diamond = du + dv
    img[diamond < 0.55] = BLACK
    img[diamond < 0.3] = TURQUOISE
    img[(u < 0.06) | (u > 0.94)] = CREAM
    img[(np.abs(v - 0.84) < 0.012)] = CREAM
    fringe_zone = v > 0.85
    strand = ((x % 8) < 4)
    rng = np.random.default_rng(15)
    lengths = 0.92 + 0.08 * rng.random(w)
    alpha = np.where(fringe_zone, (strand & (v < lengths[None, :])).astype(float), 1.0)
    img[fringe_zone] = np.array(LEATHER) * 1.2
    return np.clip(np.concatenate([img * _noise(h, w, 16, 0.05), alpha[..., None]], axis=2), 0, 1)


def paint_hip_flaps(size=512):
    """Dark leather strips with gaps between them and pointed ends (v: 0 top, 1 hem)."""
    h = w = size
    y, x = np.mgrid[0:h, 0:w]
    v = y / h
    strip = (x % 64) / 64.0
    img = np.ones((h, w, 3)) * np.array(LEATHER_DARK)
    img[(strip < 0.04) | (strip > 0.96)] *= 0.5
    img[np.abs(v - 0.1) < 0.015] = np.array(GOLD_DARK)
    point = 0.8 + 0.2 * (1 - np.abs(strip - 0.5) * 2)
    alpha = ((v < point) & (strip > 0.03) & (strip < 0.97)).astype(float)
    return np.clip(np.concatenate([img * _noise(h, w, 17, 0.06), alpha[..., None]], axis=2), 0, 1)


def paint_beads(width=256, height=32):
    """A bead strand along v (tubes map v along their length; u around)."""
    h, w = width, height
    y, x = np.mgrid[0:h, 0:w]
    colours = np.array([RED, TURQUOISE, GOLD, CREAM, RED, TURQUOISE, BONE, RED])
    idx = (y // (h // len(colours))) % len(colours)
    img = colours[idx]
    local = (y % (h // len(colours))) / (h // len(colours))
    img = img * (0.6 + 0.5 * np.sin(np.pi * local))[..., None]
    return np.clip(img * _noise(h, w, 18, 0.03), 0, 1)


def paint_braid(size=256):
    """Dark hair in a braided chevron pattern along v."""
    h = w = size
    y, x = np.mgrid[0:h, 0:w]
    u = x / w
    v = y / h
    chevron = ((v * 4 + np.abs(((u * 2) % 1.0) - 0.5)) % 1.0)
    img = np.ones((h, w, 3)) * np.array(HAIR)
    img *= (0.6 + 0.8 * np.sin(np.pi * chevron) ** 2)[..., None]
    strands = 0.85 + 0.15 * np.sin(x * 0.9 + y * 0.3)
    return np.clip(img * strands[..., None] * _noise(h, w, 19, 0.05) + 0.02, 0, 1)


# Part name -> (painter, masked, two-sided)
TEXTURES = {
    "Beadwork": (paint_beadwork, False, False),
    "Gold": (paint_gold, False, False),
    "Leather": (lambda: paint_leather(LEATHER, 20), False, False),
    "BootLeather": (lambda: paint_leather(LEATHER_DARK, 21), False, False),
    "Fur": (paint_fur, True, True),
    "FurLight": (lambda: paint_fur(base=(0.62, 0.52, 0.40), tips=CREAM), True, True),
    "Feather": (paint_feathers, True, True),
    "Apron": (paint_apron, True, True),
    "HipFlaps": (paint_hip_flaps, True, True),
    "Beads": (paint_beads, False, False),
    "Braid": (paint_braid, False, False),
}
