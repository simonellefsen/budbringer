"""
Builds the courier and the villagers, and exports them to public/models/.

The figures were fourteen box primitives with a sine-wave gait — readable as
"a person" and nothing more. These are still simple and low-poly, but they are
dressed for a French village: the courier in a postal-blue jacket with a
satchel and a flat cap, the villagers in aprons, work coats, smocks and hats
that say what they do.

Conventions match build_kit.py:

  Materials are named for palette keys, not colours. The game swaps every
  imported material for a ToonMaterial looked up by name.

  Faces stay flat-shaded, so the ink pass finds the creases.

  Figures face -Y in Blender, which the exporter's Z-up to Y-up conversion
  maps onto +Z — the same convention the buildings use.

Each figure is split into named parts (HEAD, TORSO, ARM_L, ARM_R, LEG_L,
LEG_R) so the game can animate them. The game looks those names up on the
loaded object and rotates them; anything it does not find simply stays put.

Units are metres. The courier is 1.68 tall.
"""

import bpy
import math
import os

MAT_SKIN = "SKIN"
MAT_HAIR = "HAIR"
MAT_COAT = "COAT"          # main garment; varies per character
MAT_COAT_ALT = "COAT_ALT"  # trousers / skirt
MAT_APRON = "APRON"
MAT_BOOT = "BOOT"
MAT_BAG = "BAG"
MAT_HAT = "HAT"
MAT_ACCENT = "ACCENT"

SLOTS = [MAT_SKIN, MAT_HAIR, MAT_COAT, MAT_COAT_ALT, MAT_APRON,
         MAT_BOOT, MAT_BAG, MAT_HAT, MAT_ACCENT]

PREVIEW = {
    MAT_SKIN:     (0.94, 0.82, 0.69, 1.0),
    MAT_HAIR:     (0.23, 0.17, 0.12, 1.0),
    MAT_COAT:     (0.24, 0.32, 0.48, 1.0),
    MAT_COAT_ALT: (0.30, 0.28, 0.26, 1.0),
    MAT_APRON:    (0.90, 0.87, 0.79, 1.0),
    MAT_BOOT:     (0.20, 0.16, 0.13, 1.0),
    MAT_BAG:      (0.45, 0.31, 0.19, 1.0),
    MAT_HAT:      (0.18, 0.22, 0.32, 1.0),
    MAT_ACCENT:   (0.77, 0.30, 0.22, 1.0),
}


class Part:
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
    """A box, optionally tapered towards the top — shoulders, skirts, hats."""
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


def prism(sides, radius, height, location, material, rotation_z=0.0, taper=1.0):
    verts = []
    for i in range(sides):
        a = (i / sides) * math.tau
        verts.append((math.cos(a) * radius, math.sin(a) * radius, 0.0))
    for i in range(sides):
        a = (i / sides) * math.tau
        verts.append((math.cos(a) * radius * taper, math.sin(a) * radius * taper, height))
    faces = [tuple(range(sides - 1, -1, -1)), tuple(range(sides, sides * 2))]
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((i, j, j + sides, i + sides))
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


def make_object(name, parts, parent=None, origin=(0.0, 0.0, 0.0)):
    """
    One mesh object per body part, so the game can rotate limbs individually.

    Vertices are written relative to `origin` and the object is then moved
    there, which puts the pivot at the shoulder or hip rather than the model
    root — otherwise a limb rotation swings the whole figure.
    """
    all_verts, all_faces, face_materials = [], [], []
    ox, oy, oz = origin

    for part in parts:
        offset = len(all_verts)
        all_verts.extend([(x - ox, y - oy, z - oz) for (x, y, z) in part.verts])
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
    obj.location = origin
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


# ------------------------------------------------------------------ anatomy

def head_parts(hair=MAT_HAIR, hat=None, hat_style="cap", z=1.42):
    """Head, hair, ears, eyes, and an optional hat."""
    parts = [
        box((0.2, 0.19, 0.24), (0, 0, z), MAT_SKIN, taper=0.94),
        box((0.21, 0.2, 0.08), (0, 0, z + 0.11), hair, taper=0.96),
        box((0.2, 0.1, 0.1), (0, -0.055, z + 0.09), hair),
    ]
    for side in (-1, 1):
        parts.append(box((0.035, 0.06, 0.08), (side * 0.105, 0.005, z), MAT_SKIN))
        parts.append(box((0.03, 0.02, 0.035), (side * 0.05, -0.098, z + 0.012),
                         MAT_HAIR))

    if hat == "cap":
        parts.append(box((0.23, 0.22, 0.07), (0, 0.005, z + 0.18), MAT_HAT, taper=0.86))
        parts.append(box((0.2, 0.11, 0.03), (0, -0.13, z + 0.16), MAT_HAT))
    elif hat == "beret":
        parts.append(prism(9, 0.14, 0.06, (0, 0.01, z + 0.15), MAT_HAT, taper=0.8))
        parts.append(box((0.03, 0.03, 0.03), (0, 0.01, z + 0.21), MAT_HAT))
    elif hat == "brim":
        parts.append(prism(10, 0.24, 0.025, (0, 0, z + 0.15), MAT_HAT))
        parts.append(prism(9, 0.135, 0.13, (0, 0, z + 0.16), MAT_HAT, taper=0.9))
    elif hat == "chef":
        parts.append(prism(10, 0.115, 0.2, (0, 0, z + 0.15), MAT_HAT))
        parts.append(prism(10, 0.14, 0.09, (0, 0, z + 0.34), MAT_HAT, taper=0.8))
    elif hat == "scarf":
        parts.append(box((0.23, 0.22, 0.1), (0, 0, z + 0.16), MAT_HAT, taper=0.7))
    return parts


def torso_parts(coat=MAT_COAT, apron=False, z=1.05, width=0.32):
    """Chest, hips, and an optional apron over the front."""
    parts = [
        box((width, 0.2, 0.42), (0, 0, z), coat, taper=0.88),
        box((width * 0.92, 0.19, 0.16), (0, 0, z - 0.28), MAT_COAT_ALT),
        # Collar.
        box((width * 0.6, 0.17, 0.05), (0, 0, z + 0.23), MAT_COAT_ALT),
    ]
    if apron:
        parts.append(box((width * 0.86, 0.05, 0.46), (0, -0.11, z - 0.09), MAT_APRON))
        parts.append(box((width * 0.3, 0.04, 0.12), (0, -0.11, z + 0.19), MAT_APRON))
    return parts


def arm_parts(side, coat=MAT_COAT, z=1.16, reach=0.28):
    """Upper sleeve, forearm, hand. Pivot goes at the shoulder."""
    x = side * 0.215
    return [
        box((0.095, 0.1, reach), (x, 0, z - reach / 2), coat, taper=0.9),
        box((0.082, 0.088, 0.2), (x, 0, z - reach - 0.1), MAT_SKIN),
        box((0.09, 0.075, 0.08), (x, -0.01, z - reach - 0.22), MAT_SKIN),
    ]


def leg_parts(side, z=0.72):
    """Thigh, calf, boot. Pivot goes at the hip."""
    x = side * 0.088
    return [
        box((0.115, 0.13, 0.38), (x, 0, z - 0.19), MAT_COAT_ALT, taper=0.9),
        box((0.1, 0.11, 0.3), (x, 0, z - 0.53), MAT_COAT_ALT),
        box((0.115, 0.2, 0.11), (x, -0.03, z - 0.72), MAT_BOOT),
    ]


def satchel_parts():
    """The courier's bag: strap across the chest, box on the hip."""
    return [
        box((0.055, 0.03, 0.5), (-0.02, -0.085, 1.08), MAT_BAG),
        box((0.26, 0.14, 0.22), (0.19, 0.02, 0.83), MAT_BAG),
        box((0.24, 0.03, 0.09), (0.19, -0.055, 0.92), MAT_BAG),
        box((0.06, 0.02, 0.04), (0.19, -0.07, 0.86), MAT_ACCENT),
    ]


# --------------------------------------------------------------- characters

def build_figure(name, hat=None, coat=MAT_COAT, apron=False, satchel=False,
                 props=None, location=(0, 0, 0)):
    """
    Assemble one villager as a parented rig of named parts.

    HEAD / ARM_L / ARM_R / LEG_L / LEG_R are separate objects with their pivots
    at neck, shoulders and hips, so the game can drive a walk cycle by rotating
    them. Everything else lives on the root.
    """
    root_parts = torso_parts(coat, apron)
    if satchel:
        root_parts.extend(satchel_parts())
    if props:
        root_parts.extend(props)

    root = make_object(name, root_parts)
    root.location = location

    make_object(f"{name}.HEAD", head_parts(hat=hat), root, origin=(0, 0, 1.3))
    for side, label in ((-1, "ARM_L"), (1, "ARM_R")):
        make_object(f"{name}.{label}", arm_parts(side, coat), root,
                    origin=(side * 0.215, 0, 1.3))
    for side, label in ((-1, "LEG_L"), (1, "LEG_R")):
        make_object(f"{name}.{label}", leg_parts(side), root,
                    origin=(side * 0.088, 0, 0.74))
    return root


def crook():
    """The shepherd's crook."""
    return [
        box((0.05, 0.05, 1.55), (0.3, -0.02, 0.78), MAT_BAG),
        box((0.05, 0.16, 0.05), (0.3, -0.08, 1.53), MAT_BAG),
    ]


def baguette():
    return [box((0.1, 0.44, 0.1), (-0.26, -0.06, 1.0), MAT_HAT, rotation_z=0.5)]


def rod():
    return [box((0.04, 0.04, 1.7), (0.32, 0.0, 0.95), MAT_BAG)]


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)


def build():
    reset_scene()

    # The courier. Flat cap, postal jacket, satchel.
    build_figure("Courier", hat="cap", satchel=True, location=(0, 0, 0))

    # Villagers, each dressed for their trade.
    build_figure("Villager_Postmaster", hat="cap", location=(2, 0, 0))
    build_figure("Villager_Baker", hat="chef", apron=True, props=baguette(),
                 location=(4, 0, 0))
    build_figure("Villager_Shepherd", hat="brim", props=crook(), location=(6, 0, 0))
    build_figure("Villager_Fisher", hat="brim", props=rod(), location=(8, 0, 0))
    build_figure("Villager_Artist", hat="beret", apron=True, location=(10, 0, 0))
    build_figure("Villager_Keeper", hat="scarf", location=(12, 0, 0))

    return sorted(o.name for o in bpy.data.objects)


def export(path="/Users/lindau/codex/budbringer/public/models/characters.glb"):
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
