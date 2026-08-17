"""
Builds the postilion village kit and exports it to public/models/.

The village is French — Gerberoy, Lacoste, Colmar, Estaing. That means steep
pitched roofs with real overhangs, dormers and chimneys, shuttered windows,
half-timber framing on some facades, dressed-stone plinths, and a Romanesque
church with a bell tower. Not the flat-roofed Japanese alley blocks this kit
started as.

Run it from Blender (or via blender-mcp) rather than hand-modelling, so the kit
stays reproducible and reviewable in git — the .blend is an output, not the
source of truth.

Three conventions matter downstream:

  Materials are named for palette keys, not colours. The game swaps every
  imported material for a ToonMaterial looked up by name, so the grade stays in
  src/utils/palette.ts and re-grading never means reopening Blender.

  Faces stay flat-shaded. The ink pass finds creases by comparing view-space
  normals between neighbouring pixels; smooth-shading a wall/roof junction
  averages those normals away and the line disappears.

  Models face -Y in Blender. The exporter's Z-up to Y-up conversion maps that
  onto +Z, which is what Planet.placeFacing orients at the street.

Geometry is accumulated as plain vertex/face lists and transformed in Python,
then handed to Blender once at the end. Building it out of real Objects and
reading obj.matrix_world does not work here: matrix_world is only filled in
after the depsgraph evaluates, so every part collapses onto the origin.

Units are metres and match the game 1:1. The courier is ~1.7 tall.
"""

import bpy
import math
import os

MAT_WALL = "WALL"
MAT_WALL_ALT = "WALL_ALT"
MAT_PAINTED = "PAINTED"
MAT_ROOF = "ROOF"
MAT_TIMBER = "TIMBER"
MAT_TRIM = "TRIM"
MAT_WOOD = "WOOD"
MAT_STONE = "STONE"
MAT_METAL = "METAL"
MAT_GLASS = "GLASS"
MAT_SHUTTER = "SHUTTER"
MAT_ACCENT = "ACCENT"
MAT_FOLIAGE = "FOLIAGE"
MAT_CROP = "CROP"        # straw, wheat, thatch
MAT_BLOOM = "BLOOM"      # lavender, blossom
MAT_SIGN = "SIGN"        # blank board; the game letters it with troika text
MAT_WATER = "WATER"      # waterfall sheets and foam-adjacent water

SLOTS = [MAT_WALL, MAT_WALL_ALT, MAT_PAINTED, MAT_ROOF, MAT_TIMBER, MAT_TRIM,
         MAT_WOOD, MAT_STONE, MAT_METAL, MAT_GLASS, MAT_SHUTTER, MAT_ACCENT,
         MAT_FOLIAGE, MAT_CROP, MAT_BLOOM, MAT_SIGN, MAT_WATER]

# Viewport-only colours so the Blender viewport is legible while working.
# The game ignores these entirely.
PREVIEW = {
    MAT_WALL:     (0.91, 0.85, 0.70, 1.0),
    MAT_WALL_ALT: (0.86, 0.79, 0.63, 1.0),
    MAT_PAINTED:  (0.81, 0.48, 0.39, 1.0),
    MAT_ROOF:     (0.66, 0.37, 0.27, 1.0),
    MAT_TIMBER:   (0.37, 0.27, 0.20, 1.0),
    MAT_TRIM:     (0.92, 0.88, 0.78, 1.0),
    MAT_WOOD:     (0.60, 0.48, 0.32, 1.0),
    MAT_STONE:    (0.69, 0.66, 0.58, 1.0),
    MAT_METAL:    (0.55, 0.58, 0.56, 1.0),
    MAT_GLASS:    (0.74, 0.82, 0.86, 1.0),
    MAT_SHUTTER:  (0.48, 0.61, 0.49, 1.0),
    MAT_ACCENT:   (0.77, 0.38, 0.23, 1.0),
    MAT_FOLIAGE:  (0.31, 0.49, 0.25, 1.0),
    MAT_CROP:     (0.83, 0.71, 0.40, 1.0),
    MAT_BLOOM:    (0.55, 0.47, 0.71, 1.0),
    MAT_SIGN:     (0.16, 0.13, 0.10, 1.0),
    MAT_WATER:    (0.45, 0.68, 0.72, 1.0),
}


class Part:
    """A lump of geometry already positioned in the model's own space."""

    def __init__(self, verts, faces, material):
        self.verts = verts
        self.faces = faces
        self.material = material


def _place(verts, location, rotation_z):
    lx, ly, lz = location
    if rotation_z:
        c, s = math.cos(rotation_z), math.sin(rotation_z)
        verts = [(x * c - y * s, x * s + y * c, z) for (x, y, z) in verts]
    return [(x + lx, y + ly, z + lz) for (x, y, z) in verts]


def box(size, location, material, rotation_z=0.0, taper=1.0):
    """A box, optionally narrowing towards the top — headstones, hedges, towers."""
    sx, sy, sz = (s / 2.0 for s in size)
    tx, ty = sx * taper, sy * taper
    verts = [
        (-sx, -sy, -sz), (+sx, -sy, -sz), (+sx, +sy, -sz), (-sx, +sy, -sz),
        (-tx, -ty, +sz), (+tx, -ty, +sz), (+tx, +ty, +sz), (-tx, +ty, +sz),
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5),
        (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    return Part(_place(verts, location, rotation_z), faces, material)


def lean_roof(width, depth, drop, location, material, rotation_z=0.0, thick=0.14):
    """
    A single-pitch shed roof: high on -Y, low on +Y.

    Lean-tos and side wings need this; a gable on a 1.6 m shed reads as
    another Minecraft lid.
    """
    hw, hd = width / 2.0, depth / 2.0
    verts = [
        (-hw, -hd, drop), (+hw, -hd, drop), (+hw, +hd, 0.0), (-hw, +hd, 0.0),
        (-hw, -hd, drop + thick), (+hw, -hd, drop + thick),
        (+hw, +hd, thick), (-hw, +hd, thick),
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5),
        (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    return Part(_place(verts, location, rotation_z), faces, material)


def gable(width, depth, height, location, material, rotation_z=0.0, overhang=0.0):
    """
    A pitched roof: ridge along X, eaves on +/-Y.

    `overhang` extends the eaves past the walls, which is what throws the deep
    shadow line under the roof in every one of the reference photos.
    """
    hw = width / 2.0 + overhang
    hd = depth / 2.0 + overhang
    verts = [
        (-hw, -hd, 0.0), (+hw, -hd, 0.0), (+hw, +hd, 0.0), (-hw, +hd, 0.0),
        (-hw, 0.0, height), (+hw, 0.0, height),
    ]
    faces = [
        (0, 3, 2, 1),
        (0, 1, 5, 4),
        (3, 4, 5, 2),
        (0, 4, 3),
        (1, 2, 5),
    ]
    return Part(_place(verts, location, rotation_z), faces, material)


def pyramid(width, depth, height, location, material, rotation_z=0.0):
    """A four-sided spire — the church tower cap."""
    hw, hd = width / 2.0, depth / 2.0
    verts = [
        (-hw, -hd, 0.0), (+hw, -hd, 0.0), (+hw, +hd, 0.0), (-hw, +hd, 0.0),
        (0.0, 0.0, height),
    ]
    faces = [(0, 3, 2, 1), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    return Part(_place(verts, location, rotation_z), faces, material)


def prism(sides, radius, height, location, material, rotation_z=0.0, taper=1.0):
    """
    A low-poly cylinder: tree trunks, church apse, bridge piers, mill towers.

    `taper` scales the top ring, which is what turns a cylinder into the
    battered tower of a windmill or the mound of a lavender row.
    """
    verts = []
    for i in range(sides):
        a = (i / sides) * math.tau
        verts.append((math.cos(a) * radius, math.sin(a) * radius, 0.0))
    for i in range(sides):
        a = (i / sides) * math.tau
        verts.append((math.cos(a) * radius * taper,
                      math.sin(a) * radius * taper, height))

    faces = [tuple(range(sides - 1, -1, -1)), tuple(range(sides, sides * 2))]
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((i, j, j + sides, i + sides))
    return Part(_place(verts, location, rotation_z), faces, material)


def arch_wall(width, thickness, height, opening_w, opening_h, location,
              material, rotation_z=0.0, segments=6):
    """
    A wall with an arched opening through it — bridge spans and church doors.

    Built as a ring of quads around the arch rather than by boolean subtraction,
    which keeps the topology predictable and the normals sharp.
    """
    parts_v, parts_f = [], []
    ht = thickness / 2.0

    def quad(x0, z0, x1, z1):
        base = len(parts_v)
        parts_v.extend([
            (x0, -ht, z0), (x1, -ht, z1), (x1, +ht, z1), (x0, +ht, z0),
        ])
        return base

    # Side piers.
    for sign in (-1, 1):
        outer = sign * width / 2.0
        inner = sign * opening_w / 2.0
        base = len(parts_v)
        x0, x1 = min(outer, inner), max(outer, inner)
        parts_v.extend([
            (x0, -ht, 0.0), (x1, -ht, 0.0), (x1, +ht, 0.0), (x0, +ht, 0.0),
            (x0, -ht, height), (x1, -ht, height), (x1, +ht, height), (x0, +ht, height),
        ])
        parts_f.extend([
            (base + 0, base + 3, base + 2, base + 1),
            (base + 4, base + 5, base + 6, base + 7),
            (base + 0, base + 1, base + 5, base + 4),
            (base + 1, base + 2, base + 6, base + 5),
            (base + 2, base + 3, base + 7, base + 6),
            (base + 3, base + 0, base + 4, base + 7),
        ])

    # Spandrel above the arch, as a fan of quads following the curve.
    r = opening_w / 2.0
    springing = opening_h - r
    for i in range(segments):
        a0 = math.pi * (i / segments)
        a1 = math.pi * ((i + 1) / segments)
        x0, z0 = -math.cos(a0) * r, springing + math.sin(a0) * r
        x1, z1 = -math.cos(a1) * r, springing + math.sin(a1) * r

        base = len(parts_v)
        parts_v.extend([
            (x0, -ht, z0), (x1, -ht, z1), (x1, -ht, height), (x0, -ht, height),
            (x0, +ht, z0), (x1, +ht, z1), (x1, +ht, height), (x0, +ht, height),
        ])
        parts_f.extend([
            (base + 0, base + 1, base + 2, base + 3),          # -Y face
            (base + 4, base + 7, base + 6, base + 5),          # +Y face
            (base + 0, base + 4, base + 5, base + 1),          # soffit
            (base + 3, base + 2, base + 6, base + 7),          # top
        ])

    return Part(_place(parts_v, location, rotation_z), parts_f, material)


def apply_box_uvs(mesh, scale=0.35):
    """Triplanar UVs from vertex positions so painted maps land on the kit."""
    if mesh.uv_layers.active is None:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active
    for poly in mesh.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop_i in poly.loop_indices:
            v = mesh.vertices[mesh.loops[loop_i].vertex_index].co
            if az >= ax and az >= ay:
                u, vv = v.x, v.y
            elif ax >= ay:
                u, vv = v.y, v.z
            else:
                u, vv = v.x, v.z
            uv.data[loop_i].uv = (u * scale, vv * scale)


def get_material(name):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        colour = PREVIEW.get(name, (0.8, 0.8, 0.8, 1.0))
        mat.diffuse_color = colour
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = colour
            bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def assemble(name, parts, location=(0.0, 0.0, 0.0)):
    """Fold the parts into one mesh so the game gets one object per piece."""
    all_verts, all_faces, face_materials = [], [], []

    for part in parts:
        offset = len(all_verts)
        all_verts.extend(part.verts)
        for face in part.faces:
            all_faces.append(tuple(i + offset for i in face))
            face_materials.append(part.material)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(all_verts, [], all_faces)
    mesh.validate()

    used = [m for m in SLOTS if m in set(face_materials)]
    for slot in used:
        mesh.materials.append(get_material(slot))
    index_of = {slot: i for i, slot in enumerate(used)}

    for poly, material in zip(mesh.polygons, face_materials):
        poly.material_index = index_of[material]
        poly.use_smooth = False

    mesh.update()
    apply_box_uvs(mesh)

    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ------------------------------------------------------------------ details

def shuttered_window(x, z, front, w=0.72, h=1.05, shutters=True):
    """A window with a sill, frame, glass and a pair of open shutters."""
    parts = [
        box((w + 0.16, 0.07, h + 0.16), (x, front + 0.05, z), MAT_TRIM),
        box((w, 0.08, h), (x, front - 0.01, z), MAT_GLASS),
        box((w + 0.28, 0.16, 0.08), (x, front - 0.05, z - h / 2 - 0.1), MAT_STONE),
    ]
    if shutters:
        for side in (-1, 1):
            parts.append(box(
                (w * 0.46, 0.05, h),
                (x + side * (w * 0.76), front - 0.06, z), MAT_SHUTTER))
    return parts


def dormer(x, roof_base_z, front, depth):
    """A dormer window poking through the roof pitch."""
    return [
        box((0.85, 0.9, 0.85), (x, front + depth * 0.16, roof_base_z + 0.42), MAT_WALL),
        gable(0.95, 1.0, 0.4, (x, front + depth * 0.16, roof_base_z + 0.85),
              MAT_ROOF, overhang=0.06),
        box((0.5, 0.07, 0.5), (x, front + depth * 0.16 - 0.46, roof_base_z + 0.44),
            MAT_GLASS),
    ]


def chimney(x, y, base_z, height=1.5):
    return [
        box((0.5, 0.5, height), (x, y, base_z + height / 2.0), MAT_ACCENT),
        box((0.66, 0.66, 0.14), (x, y, base_z + height), MAT_STONE),
    ]


def half_timber_frame(width, height, front, base_z, material=MAT_TIMBER):
    """
    Colmar-style framing: posts, rails, and a pair of braces per bay.

    Applied as thin boxes proud of the render rather than as texture, so the
    ink pass picks out every member.
    """
    parts = []
    t = 0.11
    y = front - 0.04

    # Corner posts and one intermediate.
    for x in (-width / 2 + 0.1, 0.0, width / 2 - 0.1):
        parts.append(box((t, 0.09, height), (x, y, base_z + height / 2.0), material))
    # Top and bottom rails.
    for z in (base_z + 0.06, base_z + height - 0.06):
        parts.append(box((width - 0.1, 0.09, t), (0.0, y, z), material))
    # Braces: two per bay, angled.
    for side in (-1, 1):
        for i, ang in enumerate((0.62, -0.62)):
            bx = side * width * 0.25
            bz = base_z + height * (0.34 + i * 0.32)
            length = height * 0.44
            c, s = math.cos(ang), math.sin(ang)
            verts = [
                (-t / 2, -0.045, -length / 2), (t / 2, -0.045, -length / 2),
                (t / 2, 0.045, -length / 2), (-t / 2, 0.045, -length / 2),
                (-t / 2, -0.045, length / 2), (t / 2, -0.045, length / 2),
                (t / 2, 0.045, length / 2), (-t / 2, 0.045, length / 2),
            ]
            verts = [(x, y2 * 1.0, z2) for (x, y2, z2) in verts]
            verts = [(x * c - z2 * s, y2, x * s + z2 * c) for (x, y2, z2) in verts]
            verts = [(x + bx, y2 + y, z2 + bz) for (x, y2, z2) in verts]
            faces = [
                (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
            ]
            parts.append(Part(verts, faces, material))
    return parts


# -------------------------------------------------------------- kit pieces

def shop_front(width, front, sign=True):
    """
    A ground-floor shop: wide glazing, a stall board, an awning, and a blank
    sign panel. The panel is left unlettered here — the game draws the French
    name onto it with SDF text, so renaming a shop never means re-exporting.
    """
    parts = [
        box((width * 0.52, 0.12, 1.75), (width * 0.14, front - 0.02, 1.25), MAT_GLASS),
        box((width * 0.56, 0.09, 1.95), (width * 0.14, front + 0.05, 1.3), MAT_WOOD),
        box((width * 0.6, 0.45, 0.12), (width * 0.14, front - 0.24, 0.42), MAT_WOOD),
        box((width * 0.66, 0.75, 0.1), (width * 0.14, front - 0.4, 2.5), MAT_ACCENT),
    ]
    if sign:
        # Board sits proud of the wall so the ink pass outlines it.
        parts.append(box((width * 0.82, 0.1, 0.62), (0, front - 0.09, 2.95), MAT_SIGN))
    return parts


def quoins(width, depth, height, base_z=0.45):
    """Stone corner blocks so a facade is not one flat plaster slab."""
    parts = []
    t, h = 0.22, 0.38
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = sx * (width / 2.0 - 0.04)
            y = sy * (depth / 2.0 - 0.04)
            z = base_z + 0.2
            while z + h / 2.0 < height - 0.15:
                parts.append(box((t, t, h), (x, y, z), MAT_STONE))
                z += h + 0.16
    return parts


def village_house(storeys=2, width=4.0, depth=4.0, wall=MAT_WALL,
                  timbered=False, dormers=0, shop=False,
                  jetty=0.0, lean_to=False, wing=False):
    """
    A village townhouse whose silhouette is not a cube with a lid.

    `jetty` pushes the upper floors out over the street (Colmar / Gerberoy).
    `lean_to` adds a side shed. `wing` adds a rear L. Together those break
    the Minecraft one-box mass the last streets still read as.
    """
    parts = []
    floor_h = 2.6
    total_h = floor_h * storeys
    front = -depth / 2.0
    roof_h = depth * 0.62
    jetty = max(0.0, jetty)

    # Ground floor is set back when there is a jetty; the upper mass
    # keeps the full depth and hangs over the pavement.
    ground_d = depth - jetty
    ground_y = jetty / 2.0
    ground_front = front + jetty

    parts.append(box((width + 0.12, ground_d + 0.12, 0.48),
                     (0, ground_y, 0.24), MAT_STONE))
    parts.append(box((width, ground_d, floor_h),
                     (0, ground_y, floor_h / 2.0), wall))

    if storeys > 1:
        upper_h = floor_h * (storeys - 1)
        parts.append(box((width, depth, upper_h),
                         (0, 0, floor_h + upper_h / 2.0), wall))
        if jetty > 0.04:
            # Timber soffit under the overhang — the line that sells a jetty.
            parts.append(box((width + 0.04, jetty + 0.06, 0.14),
                             (0, front + jetty / 2.0, floor_h + 0.02), MAT_WOOD))
    else:
        parts.append(box((width, depth, 0.08), (0, 0, floor_h), wall))

    parts.extend(quoins(width, ground_d if storeys == 1 else depth, total_h))

    if timbered:
        parts.extend(half_timber_frame(width, floor_h, ground_front, 0.0))
        for s in range(1, storeys):
            parts.extend(half_timber_frame(width, floor_h, front, floor_h * s))

    parts.append(gable(width, depth, roof_h, (0, 0, total_h), MAT_ROOF, overhang=0.38))
    # Eaves fascia so the roof has thickness, not a paper lid.
    parts.append(box((width + 0.76, 0.07, 0.16),
                     (0, front - 0.36, total_h + 0.04), MAT_WOOD))
    parts.append(box((width + 0.76, 0.07, 0.16),
                     (0, -front + 0.36, total_h + 0.04), MAT_WOOD))

    parts.append(box((1.25, 0.1, 2.3), (-width * 0.2, ground_front + 0.04, 1.15), MAT_STONE))
    parts.append(box((1.0, 0.1, 2.05), (-width * 0.2, ground_front - 0.03, 1.02), MAT_WOOD))

    if shop:
        parts.extend(shop_front(width, ground_front))
    else:
        parts.extend(shuttered_window(width * 0.24, 1.45, ground_front))

    for s in range(1, storeys):
        for offset in (-0.26, 0.26):
            parts.extend(shuttered_window(width * offset, floor_h * s + 1.35, front))

    for i in range(dormers):
        x = (i - (dormers - 1) / 2.0) * 1.5
        parts.extend(dormer(x, total_h, front, depth))

    parts.extend(chimney(width * 0.32, depth * 0.2, total_h + roof_h * 0.45, 1.4))

    parts.append(box((0.11, 0.11, total_h),
                     (width / 2.0 - 0.16, ground_front + 0.1, total_h / 2.0), MAT_METAL))
    for s in range(1, storeys):
        for offset in (-0.26, 0.26):
            z = floor_h * s + 1.35 - 0.62
            parts.append(box((0.8, 0.22, 0.16), (width * offset, front - 0.12, z), MAT_WOOD))
            parts.append(box((0.74, 0.26, 0.2), (width * offset, front - 0.14, z + 0.14),
                             MAT_ACCENT))

    if lean_to:
        lw, ld, lh = 1.85, depth * 0.7, floor_h * 0.88
        lx = width / 2.0 + lw / 2.0 - 0.12
        parts.append(box((lw + 0.08, ld + 0.08, 0.36), (lx, 0.12, 0.18), MAT_STONE))
        parts.append(box((lw, ld, lh), (lx, 0.12, lh / 2.0), wall))
        parts.append(lean_roof(lw + 0.3, ld + 0.28, 0.85, (lx, 0.12, lh), MAT_ROOF))
        parts.extend(shuttered_window(lx, 1.25, 0.12 - ld / 2.0, w=0.55, h=0.85))

    if wing:
        ww, wd, wh = width * 0.58, depth * 0.68, floor_h * 1.55
        wy = depth / 2.0 + wd / 2.0 - 0.18
        wx = width * 0.12
        parts.append(box((ww, wd, 0.4), (wx, wy, 0.2), MAT_STONE))
        parts.append(box((ww, wd, wh), (wx, wy, wh / 2.0), wall))
        parts.append(gable(ww, wd, wd * 0.52, (wx, wy, wh), MAT_ROOF, overhang=0.22))
        parts.extend(shuttered_window(wx, 1.4, wy - wd / 2.0, w=0.6, h=0.9))

    return parts


def church():
    """
    A Romanesque village church: nave, apse, and a bell tower with a spire.

    The tallest thing in the village by a clear margin, so it works as the
    landmark you navigate by from anywhere on the sphere.
    """
    parts = []
    nave_w, nave_d, nave_h = 6.0, 12.0, 6.5

    parts.append(box((nave_w + 0.3, nave_d + 0.3, 0.5), (0, 0, 0.25), MAT_STONE))
    parts.append(box((nave_w, nave_d, nave_h), (0, 0, nave_h / 2.0), MAT_STONE))
    parts.append(gable(nave_w, nave_d, 2.6, (0, 0, nave_h), MAT_ROOF, overhang=0.3))

    # Apse: a half-round end, done as a prism.
    parts.append(prism(8, nave_w * 0.42, 4.6, (0, nave_d / 2.0, 0), MAT_STONE))
    parts.append(pyramid(nave_w * 0.86, nave_w * 0.86, 1.9,
                         (0, nave_d / 2.0, 4.6), MAT_ROOF))

    # Bell tower at the west end.
    tower_w, tower_h = 3.4, 12.0
    ty = -nave_d / 2.0 - 0.4
    parts.append(box((tower_w, tower_w, tower_h), (0, ty, tower_h / 2.0), MAT_STONE))
    # Belfry openings on all four faces.
    for angle in (0, math.pi / 2):
        for side in (-1, 1):
            dx = math.cos(angle) * side * (tower_w / 2.0)
            dy = math.sin(angle) * side * (tower_w / 2.0)
            parts.append(box((0.6, 0.6, 1.5),
                             (dx * 0.98, ty + dy * 0.98, tower_h - 1.6), MAT_METAL))
    parts.append(box((tower_w + 0.4, tower_w + 0.4, 0.3), (0, ty, tower_h), MAT_STONE))
    parts.append(pyramid(tower_w + 0.3, tower_w + 0.3, 4.4, (0, ty, tower_h + 0.3), MAT_ROOF))

    # Arched west door and a rose window above it.
    parts.append(arch_wall(2.6, 0.5, 3.4, 1.5, 2.6, (0, ty - tower_w / 2.0, 0), MAT_STONE))
    parts.append(prism(10, 0.62, 0.24, (0, ty - tower_w / 2.0 - 0.1, 6.2), MAT_GLASS,
                       rotation_z=0.0))

    # Nave windows: tall, narrow, round-topped.
    for i in range(4):
        y = -nave_d / 2.0 + 2.4 + i * 2.4
        for side in (-1, 1):
            parts.append(box((0.14, 0.7, 2.2),
                             (side * nave_w / 2.0, y, 3.4), MAT_GLASS))
    return parts


def stone_bridge(span=9.0, width=4.0):
    """A two-arch stone bridge — the Estaing note, and how you cross the river."""
    parts = []
    rise = 2.6
    pier_w = 1.2

    for side in (-1, 1):
        cx = side * span * 0.25
        parts.append(arch_wall(span * 0.5, width, rise + 1.1, span * 0.34, rise,
                               (cx, 0, 0), MAT_STONE))

    # Central pier and abutments.
    parts.append(box((pier_w, width + 0.2, rise * 0.8), (0, 0, rise * 0.4), MAT_STONE))
    for side in (-1, 1):
        parts.append(box((1.4, width + 0.3, rise + 1.0),
                         (side * (span / 2.0 + 0.5), 0, (rise + 1.0) / 2.0), MAT_STONE))

    # Deck and parapets.
    parts.append(box((span + 3.0, width, 0.35), (0, 0, rise + 1.25), MAT_STONE))
    for side in (-1, 1):
        parts.append(box((span + 3.0, 0.35, 0.75),
                         (0, side * (width / 2.0 - 0.14), rise + 1.75), MAT_STONE))
    return parts


def fountain():
    """A village square fountain: basin, column, bowl."""
    parts = [
        prism(12, 1.5, 0.55, (0, 0, 0), MAT_STONE),
        prism(12, 1.28, 0.42, (0, 0, 0.13), MAT_GLASS),
        prism(8, 0.28, 1.5, (0, 0, 0.55), MAT_STONE),
        prism(10, 0.72, 0.26, (0, 0, 1.9), MAT_STONE),
    ]
    return parts


def plane_tree():
    """
    An illustrated plane: a leaning trunk and a flattened canopy.

    Height ≈ radius made every cluster a green drum — the Minecraft tree.
    These are wide, short, overlapping masses, like a painted umbrella.
    """
    parts = [
        prism(6, 0.18, 2.9, (0, 0, 0), MAT_WOOD, taper=0.62),
        box((0.14, 0.85, 0.14), (0.38, 0.15, 2.35), MAT_WOOD, rotation_z=0.55),
        box((0.72, 0.13, 0.13), (-0.18, -0.2, 2.55), MAT_WOOD, rotation_z=0.35),
        box((0.12, 0.55, 0.12), (-0.35, 0.25, 2.15), MAT_WOOD, rotation_z=-0.4),
    ]
    clusters = [
        (1.45, 0.62, (0.12, 0.08, 3.05), 0.2),
        (1.15, 0.5, (-0.62, 0.38, 3.35), 0.9),
        (1.05, 0.48, (0.58, -0.48, 3.45), 1.4),
        (0.88, 0.4, (-0.2, -0.62, 2.85), 0.5),
        (0.8, 0.38, (0.7, 0.4, 2.75), 1.15),
        (1.0, 0.44, (0.04, 0.06, 3.85), 0.15),
        (0.78, 0.36, (-0.48, -0.18, 3.7), 0.7),
        (0.7, 0.32, (0.35, 0.55, 3.55), 1.1),
    ]
    for r, h, loc, rot in clusters:
        parts.append(prism(7, r, h, loc, MAT_FOLIAGE, rotation_z=rot, taper=0.52))
    return parts


def forest_tree():
    """Taller, denser cousin of the plane — used to wall a sightline."""
    parts = [
        prism(6, 0.22, 4.2, (0, 0, 0), MAT_WOOD, taper=0.55),
        box((0.16, 1.1, 0.16), (0.5, 0.1, 3.2), MAT_WOOD, rotation_z=0.45),
        box((0.9, 0.14, 0.14), (-0.3, -0.25, 3.5), MAT_WOOD, rotation_z=0.3),
    ]
    clusters = [
        (1.75, 0.72, (0.08, 0.04, 4.25), 0.1),
        (1.3, 0.55, (-0.75, 0.42, 4.75), 0.8),
        (1.2, 0.52, (0.72, -0.52, 4.9), 1.3),
        (1.05, 0.46, (-0.22, -0.72, 4.05), 0.4),
        (1.0, 0.44, (0.78, 0.5, 3.85), 1.1),
        (1.15, 0.5, (0.0, 0.08, 5.45), 0.2),
        (0.9, 0.4, (-0.58, -0.22, 5.2), 0.65),
        (0.85, 0.38, (0.42, 0.58, 5.05), 1.5),
    ]
    for r, h, loc, rot in clusters:
        parts.append(prism(7, r, h, loc, MAT_FOLIAGE, rotation_z=rot, taper=0.5))
    return parts


def low_wall(length=5.0, height=0.95):
    """Dry-stone garden wall with a coping course."""
    return [
        box((length, 0.42, height), (0, 0, height / 2.0), MAT_STONE),
        box((length + 0.12, 0.54, 0.13), (0, 0, height + 0.06), MAT_STONE),
    ]


def well():
    parts = [
        prism(10, 0.85, 0.9, (0, 0, 0), MAT_STONE),
        prism(10, 0.7, 0.12, (0, 0, 0.78), MAT_METAL),
    ]
    for side in (-1, 1):
        parts.append(box((0.16, 0.16, 1.9), (side * 0.72, 0, 1.55), MAT_WOOD))
    parts.append(gable(2.1, 1.5, 0.6, (0, 0, 2.5), MAT_ROOF, overhang=0.16))
    return parts



def barn(width=7.0, depth=5.0):
    """A stone byre with big timber doors — the farm's anchor building."""
    parts = []
    h = 3.4
    front = -depth / 2.0
    parts.append(box((width + 0.12, depth + 0.12, 0.4), (0, 0, 0.2), MAT_STONE))
    parts.append(box((width, depth, h), (0, 0, h / 2.0), MAT_STONE))
    parts.append(gable(width, depth, depth * 0.5, (0, 0, h), MAT_ROOF, overhang=0.4))

    # Double doors, with a plank pattern implied by two leaves and a rail.
    for side in (-1, 1):
        parts.append(box((width * 0.19, 0.12, 2.5),
                         (side * width * 0.1, front - 0.02, 1.25), MAT_WOOD))
    parts.append(box((width * 0.44, 0.08, 0.14), (0, front - 0.08, 1.9), MAT_TIMBER))
    # Hayloft opening in the gable.
    parts.append(box((0.9, 0.12, 0.9), (0, front - 0.02, h + 0.75), MAT_WOOD))
    # Side windows.
    for side in (-1, 1):
        parts.append(box((0.12, 0.6, 0.6), (side * width / 2.0, 0.9, 2.1), MAT_GLASS))
    return parts


def sheep():
    """
    A woolly ewe, long on Y and low — not a wool tower.

    Tufts sit on the back, not stacked into a drum. The dark head sticks
    out in front so the silhouette is animal, not crate.
    """
    parts = [
        # Barrel of the body, longer than it is tall.
        box((0.46, 0.95, 0.38), (0, 0.08, 0.5), MAT_TRIM, taper=0.94),
        box((0.42, 0.4, 0.22), (0.06, 0.18, 0.68), MAT_TRIM, taper=0.86, rotation_z=0.25),
        box((0.4, 0.36, 0.2), (-0.08, -0.12, 0.67), MAT_TRIM, taper=0.88, rotation_z=0.9),
        box((0.38, 0.32, 0.2), (0.0, 0.38, 0.66), MAT_TRIM, taper=0.84),
        # Head out in front (-Y), below the wool line.
        box((0.22, 0.28, 0.22), (0, -0.58, 0.48), MAT_TIMBER, taper=0.9),
        box((0.14, 0.18, 0.11), (0, -0.74, 0.4), MAT_TIMBER, taper=0.8),
    ]
    for side in (-1, 1):
        parts.append(box((0.1, 0.04, 0.12),
                         (side * 0.13, -0.52, 0.6), MAT_TIMBER, taper=0.7))
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        parts.append(box((0.08, 0.08, 0.36),
                         (sx * 0.16, sy * 0.3, 0.18), MAT_TIMBER, taper=0.84))
    parts.append(box((0.07, 0.08, 0.08), (0, 0.54, 0.48), MAT_TRIM, taper=0.8))
    return parts


def goat():
    """Leaner than the sheep, with horns swept back."""
    parts = [
        box((0.4, 0.88, 0.42), (0, 0.02, 0.7), MAT_WOOD, taper=0.88),
        box((0.26, 0.32, 0.26), (0, -0.58, 0.88), MAT_WOOD, taper=0.86),
        box((0.14, 0.22, 0.13), (0, -0.78, 0.76), MAT_TRIM, taper=0.8),
        box((0.1, 0.12, 0.14), (0, -0.62, 0.62), MAT_TRIM),  # beard
    ]
    for side in (-1, 1):
        parts.append(box((0.055, 0.32, 0.055),
                         (side * 0.1, -0.5, 1.12), MAT_TIMBER, rotation_z=side * 0.18))
        parts.append(box((0.07, 0.04, 0.1),
                         (side * 0.12, -0.5, 1.0), MAT_WOOD, taper=0.7))
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        parts.append(box((0.08, 0.08, 0.52),
                         (sx * 0.15, sy * 0.3, 0.26), MAT_TIMBER, taper=0.8))
    parts.append(box((0.07, 0.36, 0.07), (0, 0.52, 0.86), MAT_TRIM))
    return parts


def sheepdog():
    """
    A black-and-white herding dog — the paddock needs one.

    Horizontal body, pointed muzzle, pricked ears, a collar. TRIM is the
    white, TIMBER the black saddle, ACCENT the collar.
    """
    parts = [
        box((0.28, 0.72, 0.3), (0, 0.04, 0.42), MAT_TIMBER, taper=0.9),
        box((0.26, 0.28, 0.24), (0, -0.28, 0.4), MAT_TRIM, taper=0.92),
        box((0.2, 0.24, 0.22), (0, -0.48, 0.46), MAT_TRIM, taper=0.85),
        box((0.12, 0.2, 0.1), (0, -0.64, 0.38), MAT_TIMBER, taper=0.75),
        box((0.22, 0.22, 0.18), (0, 0.38, 0.4), MAT_TRIM, taper=0.88),
        box((0.16, 0.08, 0.06), (0, -0.18, 0.56), MAT_ACCENT),
    ]
    for side in (-1, 1):
        parts.append(box((0.07, 0.05, 0.12),
                         (side * 0.08, -0.46, 0.62), MAT_TIMBER, taper=0.65))
        parts.append(box((0.05, 0.05, 0.04),
                         (side * 0.055, -0.68, 0.42), MAT_TRIM))
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        parts.append(box((0.07, 0.07, 0.34),
                         (sx * 0.1, sy * 0.24, 0.17), MAT_TIMBER, taper=0.8))
    parts.append(box((0.06, 0.28, 0.06), (0, 0.52, 0.5), MAT_TIMBER, taper=0.7))
    return parts


def fence(length=4.0):
    """Post-and-rail paddock fencing."""
    parts = []
    posts = max(2, int(length / 1.3))
    for i in range(posts + 1):
        x = -length / 2.0 + i * (length / posts)
        parts.append(box((0.13, 0.13, 1.15), (x, 0, 0.57), MAT_WOOD))
    for z in (0.45, 0.92):
        parts.append(box((length, 0.08, 0.12), (0, 0, z), MAT_WOOD))
    return parts



# ----------------------------------------------------------- countryside

def windmill_tower():
    """The stone tower. Sails are a separate piece so the game can spin them."""
    return [
        prism(10, 2.1, 6.5, (0, 0, 0), MAT_STONE, taper=0.72),
        prism(10, 1.6, 0.4, (0, 0, 6.5), MAT_WOOD),
        pyramid(3.0, 3.0, 1.6, (0, 0, 6.9), MAT_ROOF),
        box((0.9, 0.12, 2.0), (0, -1.6, 3.0), MAT_WOOD),   # door
    ]


def windmill_sails():
    """
    Hub and four sails, origin on the axle.

    Built in the XZ plane (thin on Y) so after the glTF Y-up conversion the
    axle is local +Z — the same axis placeFacing uses for the mill's face.
    The game parents this to the tower at the old hub (0, 6.4, 1.9).
    """
    parts = [box((0.5, 0.5, 0.5), (0, 0, 0), MAT_WOOD)]
    for i in range(4):
        a = i * (math.pi / 2) + 0.4
        c, sn = math.cos(a), math.sin(a)
        length, width = 4.6, 0.75
        verts = [
            (-width/2, -0.12, -length/2), (width/2, -0.12, -length/2),
            (width/2, 0.12, -length/2), (-width/2, 0.12, -length/2),
            (-width/2, -0.12, length/2), (width/2, -0.12, length/2),
            (width/2, 0.12, length/2), (-width/2, 0.12, length/2),
        ]
        verts = [(x * c - z * sn, y, x * sn + z * c) for (x, y, z) in verts]
        faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                 (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        parts.append(Part(verts, faces, MAT_WOOD))
    return parts


def chapel():
    """A wayside chapel: one room, a bellcote, an arched door."""
    w, d, h = 3.4, 4.6, 3.2
    return [
        box((w + 0.2, d + 0.2, 0.35), (0, 0, 0.17), MAT_STONE),
        box((w, d, h), (0, 0, h / 2), MAT_STONE),
        gable(w, d, 1.7, (0, 0, h), MAT_ROOF, overhang=0.28),
        arch_wall(1.5, 0.4, 2.3, 0.95, 1.9, (0, -d / 2, 0), MAT_STONE),
        box((0.7, 0.3, 1.0), (0, d / 2 - 0.1, h + 1.7), MAT_STONE),
        box((0.16, 0.16, 0.7), (0, d / 2 - 0.1, h + 2.4), MAT_METAL),
    ]


def gravestone(kind=0):
    """One of three headstone shapes, so a churchyard isn't a grid of clones."""
    if kind == 0:
        return [box((0.62, 0.18, 0.95), (0, 0, 0.48), MAT_STONE),
                box((0.8, 0.34, 0.12), (0, 0, 0.06), MAT_STONE)]
    if kind == 1:
        return [prism(8, 0.34, 1.15, (0, 0, 0), MAT_STONE, taper=0.8),
                box((0.7, 0.3, 0.12), (0, 0, 0.06), MAT_STONE)]
    return [box((0.5, 0.2, 1.35), (0, 0, 0.68), MAT_STONE, taper=0.85),
            box((0.55, 0.24, 0.16), (0, 0, 1.4), MAT_STONE),
            box((0.16, 0.16, 0.5), (0, 0, 1.65), MAT_STONE)]


def haystack():
    return [prism(9, 1.05, 1.5, (0, 0, 0), MAT_CROP, taper=0.55),
            prism(9, 0.5, 0.35, (0, 0, 1.5), MAT_CROP, taper=0.4)]


def vine_row(length=6.0):
    """Trained vines: end posts, a wire, and a hedge of leaf along it."""
    parts = [box((0.11, 0.11, 1.5), (-length / 2, 0, 0.75), MAT_WOOD),
             box((0.11, 0.11, 1.5), (length / 2, 0, 0.75), MAT_WOOD),
             box((length, 0.05, 0.05), (0, 0, 1.35), MAT_METAL)]
    n = int(length / 1.2)
    for i in range(n):
        x = -length / 2 + (i + 0.5) * (length / n)
        parts.append(box((length / n * 0.86, 0.55, 0.95), (x, 0, 0.85), MAT_FOLIAGE))
        parts.append(box((0.13, 0.13, 0.7), (x, 0, 0.35), MAT_WOOD))
    return parts


def lavender_row(length=5.5):
    """Low mounded rows — the Provence note, and cheap to repeat."""
    parts = []
    n = int(length / 0.85)
    for i in range(n):
        x = -length / 2 + (i + 0.5) * (length / n)
        parts.append(prism(7, 0.34, 0.42, (x, 0, 0), MAT_FOLIAGE, taper=0.8))
        parts.append(prism(7, 0.3, 0.34, (x, 0, 0.4), MAT_BLOOM, taper=0.45))
    return parts


def orchard_tree():
    """Smaller and rounder than the plane tree, planted in rows."""
    parts = [prism(6, 0.14, 1.45, (0, 0, 0), MAT_WOOD, taper=0.7)]
    for r, h, loc, rot in (
        (0.95, 0.42, (0.05, 0.0, 1.45), 0.2),
        (0.72, 0.34, (-0.35, 0.2, 1.75), 0.9),
        (0.68, 0.32, (0.35, -0.25, 1.82), 1.3),
        (0.55, 0.28, (0.0, 0.05, 2.05), 0.4),
    ):
        parts.append(prism(7, r, h, loc, MAT_FOLIAGE, rotation_z=rot, taper=0.55))
    return parts


def garden_bench():
    """A slatted park bench — not two boxes stacked."""
    parts = []
    for x in (-0.72, 0.72):
        parts.append(box((0.1, 0.46, 0.42), (x, 0.02, 0.21), MAT_STONE))
        parts.append(box((0.08, 0.08, 0.55), (x, -0.16, 0.72), MAT_WOOD))
    for i, z in enumerate((0.44, 0.52)):
        parts.append(box((1.55, 0.09, 0.05), (0, 0.06 - i * 0.14, z), MAT_WOOD))
    for i in range(3):
        parts.append(box((1.5, 0.06, 0.08),
                         (0, -0.18, 0.62 + i * 0.14), MAT_WOOD))
    return parts


def calvary():
    """
    A hillside calvary: stepped plinth and a stone cross.

    Replaces the leftover torii/box-shrine that sat on the shrine biome.
    """
    return [
        box((2.2, 2.2, 0.35), (0, 0, 0.17), MAT_STONE),
        box((1.5, 1.5, 0.4), (0, 0, 0.52), MAT_STONE),
        box((0.85, 0.85, 0.55), (0, 0, 0.95), MAT_STONE),
        box((0.32, 0.28, 2.4), (0, 0, 2.35), MAT_STONE),
        box((1.35, 0.24, 0.3), (0, 0, 2.85), MAT_STONE),
    ]


def waterfall():
    """
    A hanging sheet of water with a rocky lip and foam.

    Origin sits at the plunge pool so it can be placed on the river and
    reach up the bank. The game tints WATER from the palette.
    """
    return [
        box((5.4, 2.4, 1.9), (0, 0.7, 8.3), MAT_STONE, taper=0.9),
        box((6.0, 2.8, 1.1), (0.2, 0.35, 7.25), MAT_STONE, taper=0.92),
        box((2.2, 1.6, 2.4), (1.6, 0.2, 6.4), MAT_STONE),
        box((3.6, 0.22, 7.6), (0, -0.35, 3.7), MAT_WATER),
        box((2.5, 0.18, 6.8), (0.75, -0.18, 3.5), MAT_WATER),
        box((2.1, 0.18, 6.0), (-0.85, -0.22, 3.1), MAT_WATER),
        box((4.2, 0.75, 0.48), (0, -0.22, 7.7), MAT_TRIM),
        box((4.8, 2.1, 0.55), (0, -0.65, 0.32), MAT_TRIM),
        box((3.3, 2.7, 0.35), (0.45, -1.05, 0.22), MAT_TRIM),
    ]


def cliff_rock():
    """A chunk of cliff face for the lip above a fall."""
    return [
        box((4.8, 2.4, 3.6), (0, 0, 1.8), MAT_STONE, taper=0.84),
        box((3.4, 1.7, 2.5), (0.9, -0.45, 2.9), MAT_STONE, taper=0.9),
        box((2.5, 1.5, 1.7), (-1.1, 0.35, 3.3), MAT_STONE),
    ]


def hedge(length=5.0):
    return [box((length, 0.85, 1.25), (0, 0, 0.63), MAT_FOLIAGE, taper=0.88)]


def ruin_arch():
    """A fragment of castle wall. Reads as history without needing a whole keep."""
    return [
        box((5.2, 1.5, 0.5), (0, 0, 0.25), MAT_STONE),
        arch_wall(5.0, 1.2, 4.6, 1.9, 3.0, (0, 0, 0.5), MAT_STONE),
        box((1.5, 1.4, 2.2), (2.9, 0, 1.6), MAT_STONE),
        box((1.1, 1.3, 1.2), (-3.0, 0, 1.1), MAT_STONE),
    ]


def boathouse():
    """A jetty and a shed, for the riverside."""
    parts = [box((3.2, 3.6, 2.4), (0, 0.4, 1.2), MAT_WOOD),
             gable(3.4, 3.8, 1.2, (0, 0.4, 2.4), MAT_ROOF, overhang=0.25),
             box((2.4, 4.0, 0.16), (0, -2.6, 0.42), MAT_WOOD)]
    for i in range(4):
        parts.append(box((0.16, 0.16, 0.9), (0.9 * (1 if i % 2 else -1),
                                             -1.4 - (i // 2) * 2.0, 0.0), MAT_WOOD))
    return parts


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)


def build():
    reset_scene()

    assemble("House_TallA", village_house(3, 4.0, 4.2, MAT_WALL, dormers=2,
                                          jetty=0.3), (0, 0, 0))
    assemble("House_MidB", village_house(2, 4.4, 4.0, MAT_WALL_ALT, dormers=1,
                                         lean_to=True), (7, 0, 0))
    assemble("House_NarrowC", village_house(2, 3.2, 4.2, MAT_WALL, jetty=0.22),
             (13, 0, 0))
    assemble("House_TimberD", village_house(2, 4.2, 4.0, MAT_PAINTED, timbered=True,
                                            dormers=1, jetty=0.32), (19, 0, 0))
    assemble("House_TimberE", village_house(3, 3.8, 3.8, MAT_PAINTED, timbered=True,
                                            wing=True), (25, 0, 0))
    assemble("Shop_A", village_house(2, 4.6, 4.0, MAT_WALL, shop=True, dormers=1,
                                     lean_to=True), (31, 0, 0))
    assemble("Shop_B", village_house(2, 4.4, 4.0, MAT_PAINTED, timbered=True,
                                     shop=True, jetty=0.26), (37, 0, 0))
    assemble("Church", church(), (46, 0, 0))
    assemble("Bridge_Stone", stone_bridge(), (60, 0, 0))
    assemble("Fountain", fountain(), (70, 0, 0))
    assemble("Tree_Plane", plane_tree(), (75, 0, 0))
    assemble("Tree_Forest", forest_tree(), (81, 0, 0))
    assemble("Wall_Low", low_wall(), (80, 0, 0))
    assemble("Well", well(), (86, 0, 0))
    assemble("Barn", barn(), (94, 0, 0))
    assemble("Sheep", sheep(), (102, 0, 0))
    assemble("Goat", goat(), (105, 0, 0))
    assemble("Dog", sheepdog(), (108, 0, 0))
    assemble("Fence", fence(), (109, 0, 0))
    assemble("Windmill", windmill_tower(), (118, 0, 0))
    assemble("Windmill_Sails", windmill_sails(), (124, 0, 0))
    assemble("Chapel", chapel(), (128, 0, 0))
    assemble("Grave_A", gravestone(0), (134, 0, 0))
    assemble("Grave_B", gravestone(1), (137, 0, 0))
    assemble("Grave_C", gravestone(2), (140, 0, 0))
    assemble("Haystack", haystack(), (144, 0, 0))
    assemble("Vine_Row", vine_row(), (152, 0, 0))
    assemble("Lavender_Row", lavender_row(), (161, 0, 0))
    assemble("Tree_Orchard", orchard_tree(), (169, 0, 0))
    assemble("Hedge", hedge(), (175, 0, 0))
    assemble("Ruin_Arch", ruin_arch(), (184, 0, 0))
    assemble("Boathouse", boathouse(), (194, 0, 0))
    assemble("Waterfall", waterfall(), (204, 0, 0))
    assemble("Cliff_Rock", cliff_rock(), (214, 0, 0))
    assemble("Bench", garden_bench(), (222, 0, 0))
    assemble("Calvary", calvary(), (228, 0, 0))

    return {o.name: len(o.data.polygons) for o in bpy.data.objects}


def export(path="/Users/lindau/codex/budbringer/public/models/kit.glb"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials='EXPORT',
    )
    return path


if __name__ == "__main__":
    print(build())
    print(export())
