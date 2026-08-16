"""
Builds the postilion building kit and exports it to public/models/.

Run it from Blender (or via blender-mcp) rather than hand-modelling, so the kit
stays reproducible and reviewable in git — the .blend is an output, not the
source of truth.

Two conventions matter downstream:

  Materials are named for palette keys, not colours. The game swaps every
  imported material for a ToonMaterial looked up by name, so the grade stays in
  src/utils/palette.ts and re-grading never means reopening Blender.

  Faces stay flat-shaded. The ink pass finds creases by comparing view-space
  normals between neighbouring pixels; smooth-shading a wall/roof junction
  averages those normals away and the line disappears.

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
MAT_ROOF = "ROOF"
MAT_TRIM = "TRIM"
MAT_WOOD = "WOOD"
MAT_METAL = "METAL"
MAT_GLASS = "GLASS"
MAT_ACCENT = "ACCENT"

SLOTS = [MAT_WALL, MAT_WALL_ALT, MAT_ROOF, MAT_TRIM,
         MAT_WOOD, MAT_METAL, MAT_GLASS, MAT_ACCENT]

# Viewport-only colours, so the Blender viewport is legible while working.
# The game ignores these entirely.
PREVIEW = {
    MAT_WALL:     (0.94, 0.91, 0.86, 1.0),
    MAT_WALL_ALT: (0.85, 0.82, 0.74, 1.0),
    MAT_ROOF:     (0.29, 0.31, 0.32, 1.0),
    MAT_TRIM:     (0.86, 0.83, 0.76, 1.0),
    MAT_WOOD:     (0.60, 0.50, 0.38, 1.0),
    MAT_METAL:    (0.60, 0.64, 0.64, 1.0),
    MAT_GLASS:    (0.66, 0.80, 0.82, 1.0),
    MAT_ACCENT:   (0.87, 0.37, 0.16, 1.0),
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


def wedge(width, depth, height, location, material, rotation_z=0.0):
    """A gable prism: triangular in profile, ridge running along X."""
    hw, hd = width / 2.0, depth / 2.0
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
    """Fold the parts into one mesh so the game gets one object per building."""
    all_verts = []
    all_faces = []
    face_materials = []

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


def railing(length, height, location, spacing=0.55):
    """Posts plus two rails. Railings read as depth cues at almost no cost."""
    parts = []
    lx, ly, lz = location
    count = max(2, int(length / spacing))
    for i in range(count + 1):
        x = -length / 2.0 + i * (length / count)
        parts.append(box((0.05, 0.05, height), (lx + x, ly, lz + height / 2.0), MAT_METAL))
    for h in (height, height * 0.55):
        parts.append(box((length, 0.04, 0.05), (lx, ly, lz + h), MAT_METAL))
    return parts


def alley_townhouse(storeys=2, width=3.0, depth=3.0, wall=MAT_WALL):
    """
    A narrow street-front townhouse: the workhorse of the kit.

    Tall enough (5-7.5m) to close off a sightline, which the old 2.5m boxes
    could never do on a sphere whose horizon is only ~10m away.
    """
    parts = []
    floor_h = 2.5
    total_h = floor_h * storeys
    front = -depth / 2.0

    parts.append(box((width, depth, total_h), (0, 0, total_h / 2.0), wall))

    # Slab between floors, standing slightly proud to catch a shadow line.
    for s in range(1, storeys):
        parts.append(box((width + 0.12, depth + 0.12, 0.14),
                         (0, 0, floor_h * s), MAT_TRIM))

    parts.append(wedge(width + 0.5, depth + 0.5, 0.85, (0, 0, total_h), MAT_ROOF))
    parts.append(box((width + 0.55, depth + 0.55, 0.12),
                     (0, 0, total_h + 0.06), MAT_ROOF))

    # Recessed sliding door with a frame around it.
    parts.append(box((1.2, 0.06, 2.05), (-width * 0.18, front + 0.04, 1.02), MAT_TRIM))
    parts.append(box((1.05, 0.08, 1.9), (-width * 0.18, front - 0.01, 0.95), MAT_WOOD))

    # Ground-floor shopfront window.
    parts.append(box((0.95, 0.08, 1.0), (width * 0.24, front - 0.01, 1.35), MAT_GLASS))

    for s in range(1, storeys):
        for offset in (-0.26, 0.26):
            z = floor_h * s + 1.35
            parts.append(box((0.9, 0.05, 1.05), (width * offset, front + 0.04, z), MAT_TRIM))
            parts.append(box((0.8, 0.08, 0.95), (width * offset, front - 0.01, z), MAT_GLASS))

    if storeys >= 2:
        parts.append(box((width * 0.92, 0.85, 0.12),
                         (0, front - 0.38, floor_h), MAT_TRIM))
        parts.extend(railing(width * 0.9, 0.85, (0, front - 0.78, floor_h + 0.06)))

    # Downpipe on the front-right corner.
    parts.append(box((0.12, 0.12, total_h),
                     (width / 2.0 - 0.14, front + 0.09, total_h / 2.0), MAT_METAL))

    # AC unit bracketed onto the side wall.
    parts.append(box((0.28, 0.75, 0.55),
                     (width / 2.0 + 0.13, 0.35, floor_h * 0.72), MAT_METAL))
    parts.append(box((0.34, 0.85, 0.05),
                     (width / 2.0 + 0.13, 0.35, floor_h * 0.72 - 0.3), MAT_METAL))

    # Awning over the door — the one saturated element on the building.
    parts.append(box((1.5, 0.62, 0.08), (-width * 0.18, front - 0.3, 2.15), MAT_ACCENT))

    return parts


def external_stair(steps=8, width=1.0, rise=0.24, run=0.34):
    """A run of steps with a rail. Level changes are half the reference's charm."""
    parts = []
    for i in range(steps):
        h = rise * (i + 1)
        parts.append(box((width, run, h), (0, i * run, h / 2.0), MAT_WOOD))
    parts.extend(railing(steps * run, 0.9,
                         (width / 2.0, steps * run / 2.0, rise * steps),
                         spacing=0.7))
    return parts


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)


def build():
    reset_scene()

    assemble("House_TallA", alley_townhouse(3, 3.0, 3.2, MAT_WALL), (0, 0, 0))
    assemble("House_MidB", alley_townhouse(2, 3.4, 3.0, MAT_WALL_ALT), (6, 0, 0))
    assemble("House_NarrowC", alley_townhouse(2, 2.4, 3.4, MAT_WALL), (11, 0, 0))
    assemble("Stair_Straight", external_stair(), (16, 0, 0))

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
