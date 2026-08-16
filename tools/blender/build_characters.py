"""
Builds the courier and the villagers, and exports them to public/models/.

The figures were fourteen box primitives with a sine-wave gait — readable as
"a person" and nothing more. These are still simple and low-poly, but they are
dressed in present-day clothes: hoodies, zip jackets, jeans, gilets and
trainers. The village is old; the people living in it are not.

The courier is a teenager — shorter and slighter than the adults, in a hoodie
and a backwards cap with a backpack. The `scale` argument on build_figure is
what carries that: a teen reads as a teen mostly through height and limb
thickness relative to head size, so the same parts build both.

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
MAT_SOLE = "SOLE"    # trainer soles; the one reliably near-white thing worn

SLOTS = [MAT_SKIN, MAT_HAIR, MAT_COAT, MAT_COAT_ALT, MAT_APRON,
         MAT_BOOT, MAT_BAG, MAT_HAT, MAT_ACCENT, MAT_SOLE]

PREVIEW = {
    MAT_SKIN:     (0.94, 0.82, 0.69, 1.0),
    MAT_HAIR:     (0.23, 0.17, 0.12, 1.0),
    MAT_COAT:     (0.94, 0.77, 0.29, 1.0),
    MAT_COAT_ALT: (0.17, 0.19, 0.21, 1.0),
    MAT_APRON:    (0.90, 0.87, 0.79, 1.0),
    MAT_BOOT:     (0.20, 0.16, 0.13, 1.0),
    MAT_BAG:      (0.45, 0.31, 0.19, 1.0),
    MAT_HAT:      (0.18, 0.22, 0.32, 1.0),
    MAT_ACCENT:   (0.77, 0.30, 0.22, 1.0),
    MAT_SOLE:     (0.93, 0.92, 0.89, 1.0),
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

def head_parts(hair=MAT_HAIR, hat=None, z=1.42, scale=1.0):
    """Head, hair, ears, and modern headwear."""
    k = scale
    z = z * k
    parts = [
        box((0.2 * k, 0.19 * k, 0.24 * k), (0, 0, z), MAT_SKIN, taper=0.94),
        box((0.21 * k, 0.2 * k, 0.08 * k), (0, 0, z + 0.11 * k), hair, taper=0.96),
        box((0.2 * k, 0.1 * k, 0.1 * k), (0, -0.055 * k, z + 0.09 * k), hair),
    ]
    for side in (-1, 1):
        parts.append(box((0.035 * k, 0.06 * k, 0.08 * k),
                         (side * 0.105 * k, 0.005 * k, z), MAT_SKIN))
        parts.append(box((0.03 * k, 0.02 * k, 0.035 * k),
                         (side * 0.05 * k, -0.098 * k, z + 0.012 * k), MAT_HAIR))

    if hat == "bob":
        # Messy short bob — the courier's silhouette from behind.
        parts.extend([
            box((0.23 * k, 0.22 * k, 0.14 * k), (0, 0.02 * k, z + 0.1 * k),
                MAT_HAIR, taper=0.9),
            box((0.2 * k, 0.09 * k, 0.1 * k), (0, -0.08 * k, z + 0.07 * k), MAT_HAIR),
            box((0.075 * k, 0.1 * k, 0.18 * k), (-0.11 * k, 0.0, z), MAT_HAIR),
            box((0.075 * k, 0.1 * k, 0.18 * k), (0.11 * k, 0.0, z), MAT_HAIR),
            box((0.18 * k, 0.1 * k, 0.14 * k), (0, 0.09 * k, z - 0.02 * k), MAT_HAIR),
            box((0.06 * k, 0.07 * k, 0.08 * k), (-0.06 * k, -0.04 * k, z + 0.14 * k),
                MAT_HAIR),
            box((0.055 * k, 0.06 * k, 0.07 * k), (0.05 * k, 0.02 * k, z + 0.15 * k),
                MAT_HAIR),
        ])
        return parts

    if hat == "cap":
        parts.append(box((0.225 * k, 0.215 * k, 0.08 * k),
                         (0, 0.005 * k, z + 0.175 * k), MAT_HAT, taper=0.86))
        parts.append(box((0.2 * k, 0.12 * k, 0.028 * k),
                         (0, -0.135 * k, z + 0.15 * k), MAT_HAT))
    elif hat == "cap_back":
        # Peak round the back — the whole point of a teenager's cap.
        parts.append(box((0.225 * k, 0.215 * k, 0.08 * k),
                         (0, 0.005 * k, z + 0.175 * k), MAT_HAT, taper=0.86))
        parts.append(box((0.2 * k, 0.12 * k, 0.028 * k),
                         (0, 0.145 * k, z + 0.15 * k), MAT_HAT))
        parts.append(box((0.07 * k, 0.02 * k, 0.03 * k),
                         (0, 0.115 * k, z + 0.175 * k), MAT_ACCENT))
    elif hat == "beanie":
        parts.append(box((0.225 * k, 0.215 * k, 0.14 * k),
                         (0, 0, z + 0.16 * k), MAT_HAT, taper=0.9))
        parts.append(box((0.235 * k, 0.225 * k, 0.045 * k),
                         (0, 0, z + 0.105 * k), MAT_HAT))
    elif hat == "bucket":
        parts.append(prism(10, 0.135 * k, 0.13 * k, (0, 0, z + 0.14 * k),
                           MAT_HAT, taper=0.95))
        parts.append(prism(10, 0.22 * k, 0.025 * k, (0, 0, z + 0.13 * k), MAT_HAT))
    return parts


def torso_parts(coat=MAT_COAT, style="hoodie", apron=False, z=1.05,
                width=0.32, scale=1.0):
    """
    Chest and hips in present-day clothing.

    "hoodie" gets a hood bunched at the neck and a kangaroo pocket; "jacket"
    gets a zip line and a collar; "tee" is a plain short-sleeved top. All three
    sit over jeans, which is what MAT_COAT_ALT is on every figure.
    """
    k = scale
    z = z * k
    w = width * k
    parts = [
        box((w, 0.2 * k, 0.42 * k), (0, 0, z), coat, taper=0.9),
        box((w * 0.94, 0.19 * k, 0.16 * k), (0, 0, z - 0.28 * k), MAT_COAT_ALT),
    ]

    if style == "hoodie":
        # Hood, sitting behind the neck rather than up.
        parts.append(box((w * 0.78, 0.13 * k, 0.15 * k),
                         (0, 0.085 * k, z + 0.24 * k), coat, taper=0.85))
        # Kangaroo pocket and drawstrings.
        parts.append(box((w * 0.64, 0.05 * k, 0.14 * k),
                         (0, -0.105 * k, z - 0.12 * k), coat))
        for side in (-1, 1):
            parts.append(box((0.022 * k, 0.02 * k, 0.16 * k),
                             (side * 0.05 * k, -0.1 * k, z + 0.13 * k), MAT_ACCENT))
    elif style == "jacket":
        parts.append(box((w * 0.62, 0.16 * k, 0.06 * k),
                         (0, -0.03 * k, z + 0.235 * k), MAT_COAT_ALT))
        parts.append(box((0.03 * k, 0.05 * k, 0.4 * k),
                         (0, -0.1 * k, z), MAT_ACCENT))
    else:  # tee
        parts.append(box((w * 0.6, 0.17 * k, 0.05 * k),
                         (0, 0, z + 0.225 * k), coat))

    if apron:
        parts.append(box((w * 0.86, 0.05 * k, 0.46 * k),
                         (0, -0.11 * k, z - 0.09 * k), MAT_APRON))
        parts.append(box((w * 0.3, 0.04 * k, 0.12 * k),
                         (0, -0.11 * k, z + 0.19 * k), MAT_APRON))
    return parts


def arm_parts(side, coat=MAT_COAT, z=1.16, reach=0.28, scale=1.0, short=False):
    """
    Sleeve, forearm, hand. Pivot goes at the shoulder.

    `short` gives a t-shirt sleeve, so more of the arm is skin.
    """
    k = scale
    z = z * k
    x = side * 0.215 * k
    sleeve = reach * (0.42 if short else 1.0) * k
    r = reach * k
    return [
        box((0.095 * k, 0.1 * k, sleeve), (x, 0, z - sleeve / 2), coat, taper=0.92),
        box((0.082 * k, 0.088 * k, (r - sleeve) + 0.2 * k),
            (x, 0, z - sleeve - ((r - sleeve) + 0.2 * k) / 2), MAT_SKIN),
        box((0.09 * k, 0.075 * k, 0.08 * k),
            (x, -0.01 * k, z - r - 0.22 * k), MAT_SKIN),
    ]


def leg_parts(side, z=0.72, scale=1.0):
    """Jeans and trainers. Pivot goes at the hip."""
    k = scale
    z = z * k
    x = side * 0.088 * k
    return [
        box((0.115 * k, 0.13 * k, 0.38 * k), (x, 0, z - 0.19 * k),
            MAT_COAT_ALT, taper=0.92),
        box((0.102 * k, 0.112 * k, 0.32 * k), (x, 0, z - 0.54 * k), MAT_COAT_ALT),
        # Trainer: coloured upper over a pale sole.
        box((0.115 * k, 0.19 * k, 0.075 * k), (x, -0.028 * k, z - 0.735 * k),
            MAT_BOOT),
        box((0.12 * k, 0.2 * k, 0.035 * k), (x, -0.03 * k, z - 0.785 * k),
            MAT_SOLE),
    ]


def backpack_parts(scale=1.0):
    """A backpack and its shoulder straps — the teenager's version of a satchel."""
    k = scale
    parts = [
        box((0.27 * k, 0.15 * k, 0.34 * k), (0, 0.15 * k, 1.06 * k), MAT_BAG),
        box((0.2 * k, 0.05 * k, 0.12 * k), (0, 0.09 * k, 0.98 * k), MAT_ACCENT),
    ]
    for side in (-1, 1):
        parts.append(box((0.05 * k, 0.05 * k, 0.34 * k),
                         (side * 0.1 * k, -0.075 * k, 1.12 * k), MAT_BAG))
    return parts


def tote_parts(scale=1.0):
    """A canvas tote, carried at the hip."""
    k = scale
    return [
        box((0.045 * k, 0.03 * k, 0.42 * k), (0.14 * k, -0.05 * k, 1.12 * k), MAT_BAG),
        box((0.24 * k, 0.1 * k, 0.28 * k), (0.2 * k, -0.02 * k, 0.83 * k), MAT_BAG),
    ]


def sling_bag(scale=1.0):
    """Cross-body satchel, the reference kid's bag."""
    k = scale
    return [
        box((0.2 * k, 0.13 * k, 0.26 * k), (-0.18 * k, 0.1 * k, 0.78 * k), MAT_BAG),
        box((0.18 * k, 0.05 * k, 0.08 * k), (-0.18 * k, 0.03 * k, 0.92 * k), MAT_BAG),
        box((0.055 * k, 0.04 * k, 0.58 * k), (0.08 * k, -0.02 * k, 1.12 * k), MAT_BAG),
        box((0.05 * k, 0.04 * k, 0.22 * k), (-0.08 * k, 0.06 * k, 0.92 * k), MAT_BAG),
    ]


def short_leg_parts(side, z=0.72, scale=1.0):
    """Cropped trousers, socks, shoes."""
    k = scale
    z = z * k
    x = side * 0.088 * k
    return [
        box((0.12 * k, 0.13 * k, 0.28 * k), (x, 0, z - 0.14 * k),
            MAT_COAT_ALT, taper=0.94),
        box((0.09 * k, 0.1 * k, 0.22 * k), (x, 0, z - 0.42 * k), MAT_SKIN),
        box((0.085 * k, 0.09 * k, 0.07 * k), (x, 0, z - 0.56 * k), MAT_SOLE),
        box((0.11 * k, 0.18 * k, 0.07 * k), (x, -0.03 * k, z - 0.64 * k), MAT_BOOT),
        box((0.115 * k, 0.19 * k, 0.03 * k), (x, -0.03 * k, z - 0.69 * k), MAT_SOLE),
    ]


# --------------------------------------------------------------- characters

def build_figure(name, hat=None, coat=MAT_COAT, style="hoodie", apron=False,
                 carry=None, props=None, scale=1.0, location=(0, 0, 0),
                 shorts=False):
    """
    Assemble one person as a parented rig of named parts.

    HEAD / ARM_L / ARM_R / LEG_L / LEG_R are separate objects with their pivots
    at neck, shoulders and hips, so the game can drive a walk cycle by rotating
    them. Everything else lives on the root.

    `scale` is how the teenage courier is built from the same parts as the
    adults: shorter, with slimmer limbs against the same head, which is what
    reads as young rather than merely small.
    """
    root_parts = torso_parts(coat, style=style, apron=apron, scale=scale)

    if carry == "backpack":
        root_parts.extend(backpack_parts(scale))
    elif carry == "tote":
        root_parts.extend(tote_parts(scale))
    elif carry == "sling":
        root_parts.extend(sling_bag(scale))
    if props:
        root_parts.extend(props)

    root = make_object(name, root_parts)
    root.location = location

    short_sleeves = style == "tee"

    make_object(f"{name}.HEAD", head_parts(hat=hat, scale=scale), root,
                origin=(0, 0, 1.3 * scale))
    for side, label in ((-1, "ARM_L"), (1, "ARM_R")):
        make_object(f"{name}.{label}",
                    arm_parts(side, coat, scale=scale, short=short_sleeves),
                    root, origin=(side * 0.215 * scale, 0, 1.3 * scale))
    for side, label in ((-1, "LEG_L"), (1, "LEG_R")):
        legs = short_leg_parts if shorts else leg_parts
        make_object(f"{name}.{label}",
                    legs(side, scale=scale),
                    root, origin=(side * 0.088 * scale, 0, 0.74 * scale))
    return root


def crook(scale=1.0):
    """The shepherd still carries one; the rest of the outfit is modern."""
    k = scale
    return [
        box((0.05 * k, 0.05 * k, 1.55 * k), (0.3 * k, -0.02 * k, 0.78 * k), MAT_BAG),
        box((0.05 * k, 0.16 * k, 0.05 * k), (0.3 * k, -0.08 * k, 1.53 * k), MAT_BAG),
    ]


def baguette(scale=1.0):
    k = scale
    return [box((0.1 * k, 0.44 * k, 0.1 * k), (-0.26 * k, -0.06 * k, 1.0 * k),
                MAT_HAT, rotation_z=0.5)]


def rod(scale=1.0):
    k = scale
    return [box((0.04 * k, 0.04 * k, 1.7 * k), (0.32 * k, 0.0, 0.95 * k), MAT_BAG)]


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)


def build():
    reset_scene()

    # The courier: yellow tee, cropped trousers, sling bag, messy bob.
    build_figure("Courier", hat="bob", style="tee", carry="sling", shorts=True,
                 scale=0.9, location=(0, 0, 0))

    # The villagers, in present-day clothes rather than period costume.
    build_figure("Villager_Postmaster", hat="cap", style="jacket",
                 carry="tote", location=(2, 0, 0))
    build_figure("Villager_Baker", style="tee", apron=True,
                 props=baguette(), location=(4, 0, 0))
    build_figure("Villager_Shepherd", hat="beanie", style="jacket",
                 props=crook(), location=(6, 0, 0))
    build_figure("Villager_Fisher", hat="bucket", style="jacket",
                 props=rod(), location=(8, 0, 0))
    build_figure("Villager_Artist", hat="beanie", style="hoodie",
                 carry="tote", location=(10, 0, 0))
    build_figure("Villager_Keeper", style="hoodie", location=(12, 0, 0))

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
