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
MAT_SIGN = "SIGN"        # blank board; the game letters it with troika text

SLOTS = [MAT_WALL, MAT_WALL_ALT, MAT_PAINTED, MAT_ROOF, MAT_TIMBER, MAT_TRIM,
         MAT_WOOD, MAT_STONE, MAT_METAL, MAT_GLASS, MAT_SHUTTER, MAT_ACCENT,
         MAT_FOLIAGE, MAT_SIGN]

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
    MAT_SIGN:     (0.16, 0.13, 0.10, 1.0),
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


def box(size, location, material, rotation_z=0.0):
    sx, sy, sz = (s / 2.0 for s in size)
    verts = [
        (-sx, -sy, -sz), (+sx, -sy, -sz), (+sx, +sy, -sz), (-sx, +sy, -sz),
        (-sx, -sy, +sz), (+sx, -sy, +sz), (+sx, +sy, +sz), (-sx, +sy, +sz),
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


def prism(sides, radius, height, location, material, rotation_z=0.0):
    """A low-poly cylinder: tree trunks, church apse, bridge piers."""
    verts = []
    for i in range(sides):
        a = (i / sides) * math.tau
        verts.append((math.cos(a) * radius, math.sin(a) * radius, 0.0))
    for i in range(sides):
        a = (i / sides) * math.tau
        verts.append((math.cos(a) * radius, math.sin(a) * radius, height))

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


def village_house(storeys=2, width=4.0, depth=4.0, wall=MAT_WALL,
                  timbered=False, dormers=0, shop=False):
    """
    The workhorse: a village townhouse with a steep pitched roof.

    Steep is the point. Every reference roof is 45 degrees or more with a real
    overhang, which is what gives the silhouette its character and drops a hard
    shadow onto the facade below.
    """
    parts = []
    floor_h = 2.6
    total_h = floor_h * storeys
    front = -depth / 2.0
    roof_h = depth * 0.62          # ~50 degree pitch

    # Dressed-stone plinth, then the rendered wall above it.
    parts.append(box((width + 0.1, depth + 0.1, 0.45), (0, 0, 0.22), MAT_STONE))
    parts.append(box((width, depth, total_h), (0, 0, total_h / 2.0), wall))

    if timbered:
        for s in range(storeys):
            parts.extend(half_timber_frame(width, floor_h, front, floor_h * s))

    parts.append(gable(width, depth, roof_h, (0, 0, total_h), MAT_ROOF, overhang=0.34))

    # Door, with a stone surround.
    parts.append(box((1.25, 0.1, 2.3), (-width * 0.2, front + 0.04, 1.15), MAT_STONE))
    parts.append(box((1.0, 0.1, 2.05), (-width * 0.2, front - 0.03, 1.02), MAT_WOOD))

    if shop:
        parts.extend(shop_front(width, front))
    else:
        parts.extend(shuttered_window(width * 0.24, 1.45, front))

    # Upper floors.
    for s in range(1, storeys):
        for offset in (-0.26, 0.26):
            parts.extend(shuttered_window(width * offset, floor_h * s + 1.35, front))

    for i in range(dormers):
        x = (i - (dormers - 1) / 2.0) * 1.5
        parts.extend(dormer(x, total_h, front, depth))

    parts.extend(chimney(width * 0.32, depth * 0.2, total_h + roof_h * 0.45, 1.4))

    # Downpipe and a window box of geraniums — the reference's signature note.
    parts.append(box((0.11, 0.11, total_h),
                     (width / 2.0 - 0.16, front + 0.1, total_h / 2.0), MAT_METAL))
    for s in range(1, storeys):
        for offset in (-0.26, 0.26):
            z = floor_h * s + 1.35 - 0.62
            parts.append(box((0.8, 0.22, 0.16), (width * offset, front - 0.12, z), MAT_WOOD))
            parts.append(box((0.74, 0.26, 0.2), (width * offset, front - 0.14, z + 0.14),
                             MAT_ACCENT))
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
    """A pollarded plane, the tree of every French village square."""
    parts = [prism(7, 0.22, 2.4, (0, 0, 0), MAT_WOOD)]
    for i, (r, z, sq) in enumerate(((1.5, 2.2, 1.0), (1.15, 3.4, 0.85), (0.7, 4.2, 0.7))):
        parts.append(prism(9, r, 1.25 * sq, (0, 0, z), MAT_FOLIAGE,
                           rotation_z=i * 0.4))
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
    """Woolly body, dark head and legs. Read at a distance, not up close."""
    parts = [
        prism(7, 0.42, 0.86, (0, 0, 0.42), MAT_TRIM, rotation_z=0.3),
        box((0.3, 0.34, 0.3), (0, -0.56, 0.62), MAT_TIMBER),
        box((0.16, 0.2, 0.16), (0, -0.72, 0.5), MAT_TIMBER),
    ]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box((0.1, 0.1, 0.44),
                             (sx * 0.22, sy * 0.3, 0.22), MAT_TIMBER))
    return parts


def goat():
    """Leaner than the sheep, with horns swept back."""
    parts = [
        box((0.44, 0.92, 0.5), (0, 0, 0.66), MAT_WOOD),
        box((0.28, 0.34, 0.28), (0, -0.6, 0.86), MAT_WOOD),
        box((0.14, 0.22, 0.14), (0, -0.78, 0.76), MAT_TRIM),
    ]
    for side in (-1, 1):
        parts.append(box((0.07, 0.36, 0.07), (side * 0.1, -0.52, 1.06), MAT_TIMBER))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box((0.09, 0.09, 0.56),
                             (sx * 0.16, sy * 0.32, 0.28), MAT_TIMBER))
    parts.append(box((0.08, 0.4, 0.08), (0, 0.56, 0.82), MAT_TRIM))
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


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)


def build():
    reset_scene()

    assemble("House_TallA", village_house(3, 4.0, 4.2, MAT_WALL, dormers=2), (0, 0, 0))
    assemble("House_MidB", village_house(2, 4.4, 4.0, MAT_WALL_ALT, dormers=1), (7, 0, 0))
    assemble("House_NarrowC", village_house(2, 3.2, 4.2, MAT_WALL), (13, 0, 0))
    assemble("House_TimberD", village_house(2, 4.2, 4.0, MAT_PAINTED, timbered=True,
                                            dormers=1), (19, 0, 0))
    assemble("House_TimberE", village_house(3, 3.8, 3.8, MAT_PAINTED, timbered=True),
             (25, 0, 0))
    assemble("Shop_A", village_house(2, 4.6, 4.0, MAT_WALL, shop=True, dormers=1),
             (31, 0, 0))
    assemble("Shop_B", village_house(2, 4.4, 4.0, MAT_PAINTED, timbered=True, shop=True),
             (37, 0, 0))
    assemble("Church", church(), (46, 0, 0))
    assemble("Bridge_Stone", stone_bridge(), (60, 0, 0))
    assemble("Fountain", fountain(), (70, 0, 0))
    assemble("Tree_Plane", plane_tree(), (75, 0, 0))
    assemble("Wall_Low", low_wall(), (80, 0, 0))
    assemble("Well", well(), (86, 0, 0))
    assemble("Barn", barn(), (94, 0, 0))
    assemble("Sheep", sheep(), (102, 0, 0))
    assemble("Goat", goat(), (105, 0, 0))
    assemble("Fence", fence(), (109, 0, 0))

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
