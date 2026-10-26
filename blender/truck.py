"""Delivery box truck (Isuzu NPR / Hyundai Mighty class) as a studio product render.

Run: Blender -b -P blender/truck.py -- <out.png> [samples] [front,rear,close]
Several shots render to <out>_<shot>.png. X is forward, Y is the truck's left, Z up; metres.
"""
import math
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/truck.png'
SAMPLES = int(args[1]) if len(args) > 1 else 64
SHOTS = (args[2] if len(args) > 2 else 'front').split(',')
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

FA, RA = 2.65, -1.60          # front / rear axle x
WZ = .385                      # wheel centre height (tyre slightly loaded)
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
SIDES = (1, -1)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


# ---------- Materials ----------
def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)


def material(name, color, metal=0., rough=.5, coat=0., coat_rough=.03, trans=0., ior=1.5,
             emit=None, strength=0., rough_var=0., bump=0., bump_scale=300., dust=0., aniso=0., aniso_axis='Z'):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links.new
    b = nt.nodes['Principled BSDF']
    for k, v in (('Base Color', (*color, 1)), ('Metallic', metal), ('Roughness', rough),
                 ('Coat Weight', coat), ('Coat Roughness', coat_rough),
                 ('Transmission Weight', trans), ('IOR', ior)):
        b.inputs[k].default_value = v
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    tc = nt.nodes.new('ShaderNodeTexCoord')
    if aniso:   # brushed metal: highlights stretch around the given axis
        b.inputs['Anisotropic'].default_value = aniso
        tg = nt.nodes.new('ShaderNodeTangent')
        tg.direction_type, tg.axis = 'RADIAL', aniso_axis
        L(tg.outputs['Tangent'], b.inputs['Tangent'])

    def noise(scale, detail=6):
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        L(tc.outputs['Object'], n.inputs['Vector'])
        return n.outputs['Fac']

    def remap(sock, a, b_, c, d):
        r = nt.nodes.new('ShaderNodeMapRange')
        for k, v in (('From Min', a), ('From Max', b_), ('To Min', c), ('To Max', d)):
            r.inputs[k].default_value = v
        L(sock, r.inputs['Value'])
        return r.outputs['Result']

    if rough_var:   # no surface is evenly rough in reality
        L(remap(noise(3), .3, .7, rough - rough_var, rough + rough_var), b.inputs['Roughness'])
    if bump:
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = .002
        L(noise(bump_scale, 2), bp.inputs['Height'])
        L(bp.outputs['Normal'], b.inputs['Normal'])
    if dust:        # road dust settles low on the body, in patches
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        L(geo.outputs['Position'], sep.inputs[0])
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        L(remap(sep.outputs['Z'], .2, 1.4, dust, 0), mul.inputs[0])
        L(remap(noise(5, 8), .35, .65, .2, 1), mul.inputs[1])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        L(mul.outputs[0], mix.inputs['Factor'])
        a, bb = [s for s in mix.inputs if s.type == 'RGBA']
        a.default_value = (*color, 1)
        bb.default_value = (.36, .33, .29, 1)
        L([s for s in mix.outputs if s.type == 'RGBA'][0], b.inputs['Base Color'])
    return m


def thin_glass(name, tint):
    """Tinted transparent plus a Fresnel mirror: lets shadows and the cab interior show, unlike refraction."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links.new
    p = nt.nodes['Principled BSDF']
    p.inputs['Metallic'].default_value = 1
    p.inputs['Roughness'].default_value = 0
    p.inputs['Base Color'].default_value = (1, 1, 1, 1)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (*tint, 1)
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.52
    # the back face would see Fresnel with 1/IOR and total internal reflection: keep it transparent
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    front = nt.nodes.new('ShaderNodeMath')
    front.operation = 'SUBTRACT'
    front.inputs[0].default_value = 1
    L(geo.outputs['Backfacing'], front.inputs[1])
    fac = nt.nodes.new('ShaderNodeMath')
    fac.operation = 'MULTIPLY'
    L(fr.outputs[0], fac.inputs[0])
    L(front.outputs[0], fac.inputs[1])
    mix = nt.nodes.new('ShaderNodeMixShader')
    L(fac.outputs[0], mix.inputs[0])
    L(tr.outputs[0], mix.inputs[1])
    L(p.outputs[0], mix.inputs[2])
    L(mix.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


BLUE = srgb('#1c6bd2')
M = {
    'paint': material('paint_white', (.80, .81, .82), rough=.28, rough_var=.06, coat=1, coat_rough=.02, dust=.28),
    'box': material('box_white', (.83, .84, .85), rough=.32, rough_var=.08, coat=.6, coat_rough=.05, dust=.22),
    'blue': material('paint_blue', BLUE, rough=.35, coat=.25, coat_rough=.05),
    'black': material('plastic_black', (.022, .022, .024), rough=.55, rough_var=.1, bump=.15, bump_scale=900),
    'gloss': material('gloss_black', (.01, .01, .011), rough=.08, coat=1, coat_rough=.01),
    'gap': material('panel_gap', (.004, .004, .004), rough=.8),
    'chrome': material('chrome', (.95, .95, .96), metal=1, rough=.04),
    'satin': material('satin_metal', (.78, .79, .80), metal=1, rough=.3, rough_var=.08, aniso=.5),
    'alu': material('brushed_alu', (.86, .87, .88), metal=1, rough=.2, rough_var=.05, aniso=.6),
    'dkchrome': material('dark_chrome', (.12, .12, .13), metal=1, rough=.12),
    'hl_inner': material('headlamp_inner', (.10, .10, .11), metal=1, rough=.2),
    'chassis': material('chassis_black', (.018, .018, .02), rough=.42, rough_var=.12, coat=.3, dust=.15),
    'rim': material('rim_silver', (.62, .63, .65), metal=.9, rough=.3, coat=.6, coat_rough=.08, aniso=.45, aniso_axis='Y'),
    'drum': material('brake_drum', (.09, .085, .08), metal=.7, rough=.65),
    'rubber': material('rubber', (.012, .012, .013), rough=.8, rough_var=.1, bump=.06, bump_scale=500),
    'rubber_txt': material('rubber_text', (.035, .035, .037), rough=.5),
    'flap': material('rubber_flap', (.015, .015, .016), rough=.75, rough_var=.12, bump=.1, bump_scale=400),
    'glass': thin_glass('glass_tint', (.62, .66, .66)),
    'interior': material('interior', (.025, .025, .028), rough=.6, bump=.1, bump_scale=600),
    'fabric': material('fabric', (.09, .092, .1), rough=.9, bump=.3, bump_scale=900),
    'lens': material('lens_clear', (1, 1, 1), rough=.0, trans=1),
    'amber': material('lens_amber', (1, .32, .02), rough=.02, trans=1),
    'red': material('lens_red', (.75, .015, .012), rough=.02, trans=1, emit=(1, .01, .005), strength=.45),
    'led': material('led', (1, 1, 1), emit=(.92, .96, 1), strength=12),
    'plate': material('plate', (.85, .86, .86), rough=.35),
    'ink': material('ink', (.01, .01, .012), rough=.4),
    'grey': material('text_grey', (.18, .19, .2), rough=.35, coat=1),
}


# ---------- Geometry helpers ----------
def rpoly(pts, r, seg=6):
    """Polygon with filleted corners; r is one radius or one per corner."""
    out = []
    n = len(pts)
    for i in range(n):
        p, a, b = Vector(pts[i]), Vector(pts[i - 1]), Vector(pts[(i + 1) % n])
        rr = r[i] if isinstance(r, (list, tuple)) else r
        if rr <= 0:
            out.append(p)
            continue
        ua, ub = a - p, b - p
        t = min(rr, ua.length * .45, ub.length * .45)
        p0, p1 = p + ua.normalized() * t, p + ub.normalized() * t
        out += [(1 - s) ** 2 * p0 + 2 * (1 - s) * s * p + s * s * p1
                for s in (k / seg for k in range(seg + 1))]
    return out


def rect(u0, v0, u1, v1, r=0.):
    pts = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    return rpoly(pts, r) if r else pts


def slab_bm(pts, O, U, V, W, t0, t1):
    """Extrude a 2-D outline (in the U,V plane at O) from t0 to t1 along W."""
    bm = bmesh.new()
    O, U, V, W = map(Vector, (O, U, V, W))
    a = [bm.verts.new(O + U * p[0] + V * p[1] + W * t0) for p in pts]
    b = [bm.verts.new(O + U * p[0] + V * p[1] + W * t1) for p in pts]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bevel_where(bm, pred, off, seg, clamp=True):
    """pred(n0, n1, mid) on the two face normals and the edge midpoint."""
    bm.normal_update()
    es = [e for e in bm.edges if e.is_manifold and all(f.normal.length > 0 for f in e.link_faces) and
          pred(e.link_faces[0].normal, e.link_faces[1].normal, (e.verts[0].co + e.verts[1].co) / 2)]
    if es:
        bmesh.ops.bevel(bm, geom=es, offset=off, segments=seg, profile=.5, affect='EDGES', clamp_overlap=clamp)
    bm.normal_update()


def to_mesh(bm, sharp=None):
    for f in bm.faces:
        f.smooth = True
    if sharp is not None:
        for e in bm.edges:
            if e.is_manifold and e.calc_face_angle(0) > math.radians(sharp):
                e.smooth = False
    me = bpy.data.meshes.new('m')
    bm.to_mesh(me)
    bm.free()
    return me


def link(name, me, mats, bevel=0., seg=3, parent=None):
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    for m in mats:
        me.materials.append(m)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL')
        bv.width, bv.segments = bevel, seg
        bv.limit_method = 'ANGLE'
        bv.angle_limit = math.radians(30)
        bv.harden_normals = True
        bv.use_clamp_overlap = True
    ob.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True
    if parent:
        ob.parent = parent
    return ob


def slab(name, pts, O, U, V, W, t0, t1, mat, bevel=.004, seg=2):
    return link(name, to_mesh(slab_bm(pts, O, U, V, W, t0, t1)), [mat], bevel, seg)


def box(name, c, s, mat, r=0., bevel=.008, seg=3):
    hx, hy = s[0] / 2, s[1] / 2
    return slab(name, rect(-hx, -hy, hx, hy, r), c, X, Y, Z, -s[2] / 2, s[2] / 2, mat, bevel, seg)


def lathe_bm(prof, seg=64, closed=True):
    """Spin an (r, a) profile around the local Y axis."""
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        th = 2 * math.pi * i / seg
        c, s = math.cos(th), math.sin(th)
        rings.append([bm.verts.new((r * c, a, r * s)) for r, a in prof])
    n = len(prof)
    for i in range(seg):
        A, B = rings[i], rings[(i + 1) % seg]
        for j in range(n if closed else n - 1):
            k = (j + 1) % n
            bm.faces.new((A[j], A[k], B[k], B[j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def lathe(name, prof, mat, seg=64, closed=True, sharp=40, loc=(0, 0, 0), rot=(0, 0, 0)):
    ob = link(name, to_mesh(lathe_bm(prof, seg, closed), sharp), [mat])
    ob.location, ob.rotation_euler = loc, rot
    return ob


def tube(name, pts, r, mat, cyclic=False, smooth=True):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth, cu.bevel_resolution = r, 4
    cu.use_fill_caps = True
    if smooth:
        sp = cu.splines.new('BEZIER')
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
    else:
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        for pt, p in zip(sp.points, pts):
            pt.co = (*p, 1)
    sp.use_cyclic_u = cyclic
    cu.materials.append(mat)
    ob = bpy.data.objects.new(name, cu)
    col.objects.link(ob)
    return ob


def text(name, body, size, O, U, V, W, mat, extrude=.0015):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.size, cu.extrude = size, extrude
    cu.align_x, cu.align_y = 'CENTER', 'CENTER'
    cu.materials.append(mat)
    ob = bpy.data.objects.new(name, cu)
    col.objects.link(ob)
    ob.matrix_world = Matrix.Translation(Vector(O)) @ Matrix((U, V, W)).transposed().to_4x4()
    return ob


def arc(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


# ---------- Cab ----------
# Side silhouette of a cab-over: near-vertical face, raked screen, front wheel under the door.
CAB_PROFILE = ([(1.75, .62)] + arc(FA, .42, .53, 158, 22, 28) +
               [(3.50, .62), (3.50, 1.42), (3.24, 2.28), (3.10, 2.43), (2.92, 2.465),
                (1.86, 2.47), (1.77, 2.41)])
bm = slab_bm(CAB_PROFILE, (0, 0, 0), X, Z, Y, -1.0, 1.0)
# clamp off: clamping shrinks every width to fit the short wheel-arch segments
bevel_where(bm, lambda a, b, m: m.x > 3.05 and ((abs(a.y) > .9 and b.x > .15) or (abs(b.y) > .9 and a.x > .15)), .16, 8, clamp=False)
# roof-to-side and rear corners get a soft radius too (the arch edges keep a small one below)
bevel_where(bm, lambda a, b, m: (abs(a.y) > .9 and (b.z > .5 or b.x < -.5)) or (abs(b.y) > .9 and (a.z > .5 or a.x < -.5)), .07, 5, clamp=False)
bevel_where(bm, lambda a, b, m: a.angle(b) > math.radians(30), .03, 4)
for f in bm.faces:   # wheel-house and underside faces get the black liner
    c = f.calc_center_median()
    if f.normal.z < -.5 or (math.hypot(c.x - FA, c.z - .42) < .56 and abs(f.normal.y) < .7):
        f.material_index = 1
cab = link('cab', to_mesh(bm), [M['paint'], M['black']])

# Roof deflector, so the cab line flows up into the taller box.
bm = slab_bm([(2.98, 2.45), (2.76, 2.62), (2.42, 2.86), (2.05, 3.06), (1.79, 3.12), (1.79, 2.45)],
             (0, 0, 0), X, Z, Y, -.93, .93)
bevel_where(bm, lambda a, b, m: abs(a.y) > .9 or abs(b.y) > .9, .09, 6, clamp=False)
bevel_where(bm, lambda a, b, m: a.angle(b) > math.radians(30), .03, 3)
link('deflector', to_mesh(bm), [M['paint']])

# Windscreen on the raked plane: black ceramic border, then tinted glass.
WS_O, WS_TOP = Vector((3.50, 0, 1.42)), Vector((3.24, 0, 2.28))
WS_D = (WS_TOP - WS_O).normalized()
WS_N = Vector((WS_D.z, 0, -WS_D.x))
WS_LEN = (WS_TOP - WS_O).length
ws_frit = slab('ws_frit', rect(-.83, .03, .83, WS_LEN - .03, .07), WS_O, Y, WS_D, WS_N, -.004, .005, M['gloss'])
slab('ws_glass', rect(-.79, .07, .79, WS_LEN - .07, .05), WS_O, Y, WS_D, WS_N, 0, .008, M['glass'], .003)
slab('cowl', rect(-.82, 1.355, .82, 1.425, .02), (3.50, 0, 0), Y, Z, X, -.004, .008, M['gloss'])


def ws(y, s, t):   # point on the windscreen plane
    return WS_O + Y * y + WS_D * s + WS_N * t


for i, (y0, y1, piv) in enumerate(((-.80, -.08, -.36), (.0, .74, .38))):
    slab(f'wiper_blade{i}', rect(y0, .085 + i * .03, y1, .1 + i * .03, .006), WS_O, Y, WS_D, WS_N, .009, .024, M['black'], .003)
    tube(f'wiper_arm{i}', [ws(piv, .0, .02), ws((y0 + y1) / 2, .092 + i * .03, .03)], .008, M['chassis'], smooth=False)

# Grille, brow bar, lower intake and wrap-around headlamps on the front face.
F = (3.50, 0, 0)
slab('grille', rect(-.43, .93, .43, 1.215, .03), F, Y, Z, X, -.005, .012, M['gloss'])
for k in range(5):
    z = .955 + k * .052
    slab(f'slat{k}', rect(-.40, z, .40, z + .02, .008), F, Y, Z, X, .010, .02, M['dkchrome'], .003)
slab('brow', rect(-.86, 1.215, .86, 1.25, .016), F, Y, Z, X, -.002, .02, M['chrome'], .005)
slab('badge_rim', rect(-.17, 1.19, .17, 1.275, .035), F, Y, Z, X, .018, .03, M['chrome'], .004)
slab('badge', rect(-.16, 1.197, .16, 1.268, .03), F, Y, Z, X, .02, .034, M['blue'], .003)
text('badge_txt', 'cloudplus', .046, (3.535, 0, 1.232), Y, Z, X, M['chrome'], .001)
slab('intake', rect(-.70, .70, .70, .885, .05), F, Y, Z, X, -.004, .01, M['black'], .004)
for k in range(3):
    z = .725 + k * .05
    slab(f'intake_slot{k}', rect(-.64, z, .64, z + .026, .012), F, Y, Z, X, .006, .012, M['gap'], .002)

REFLECTOR = [(r, .012 + r * r / .25) for r in (.004, .012, .022, .032, .042, .052, .062)]
HZ0, HZ1 = .93, 1.21


def wrap(s, r0, r1, a0, a1, z0, z1, mat, name):
    """Band hugging the rounded cab corner (plan radius .16 around x=3.34, y=.84)."""
    pts = [(3.34 + r * math.cos(math.radians(t)), s * (.84 + r * math.sin(math.radians(t))))
           for r, t in [(r1, a0 + (a1 - a0) * i / 16) for i in range(17)] +
           [(r0, a1 - (a1 - a0) * i / 16) for i in range(17)]]
    return slab(name, pts, (0, 0, 0), X, Y, Z, z0, z1, mat, .003)


for s in SIDES:
    y0, y1 = sorted((s * .44, s * .84))
    slab(f'hl_housing{s}', rect(y0, HZ0, y1, HZ1, .02), F, Y, Z, X, -.006, .01, M['gloss'], .003)
    slab(f'hl_inner{s}', rect(y0 + .01, HZ0 + .012, y1, HZ1 - .012, .02), F, Y, Z, X, 0, .014, M['hl_inner'], .002)
    wrap(s, .150, .172, 0, 74, HZ0, HZ1, M['gloss'], f'hl_wrap_house{s}')
    wrap(s, .168, .176, 0, 70, HZ0 + .012, HZ1 - .012, M['hl_inner'], f'hl_wrap_inner{s}')
    wrap(s, .176, .186, 28, 68, HZ0 + .02, HZ1 - .02, M['amber'], f'hl_wrap_amber{s}')
    wrap(s, .192, .202, 0, 74, HZ0 + .004, HZ1 - .004, M['lens'], f'hl_wrap_lens{s}')
    slab(f'hl_cover{s}', rect(y0 + .004, HZ0 + .004, y1, HZ1 - .004, .015), F, Y, Z, X, .034, .046, M['lens'], .004)
    for k, yy in enumerate((.56, .74)):
        c = s * yy
        lathe(f'hl_bowl{s}{k}', REFLECTOR, M['chrome'], 48, closed=False, sharp=None,
              loc=(3.50, c, 1.075), rot=(0, 0, -math.pi / 2))
        lathe(f'hl_bezel{s}{k}', [(.062, .03), (.07, .03), (.07, .036), (.064, .036)], M['chrome'], 48, sharp=50,
              loc=(3.50, c, 1.075), rot=(0, 0, -math.pi / 2))
        if k == 0:   # projector lens in the inboard bowl
            lathe(f'hl_proj{s}', [(.001, .03), (.016, .028), (.026, .02), (.03, .008), (.03, 0), (.001, 0)],
                  M['lens'], 32, sharp=60, loc=(3.505, c, 1.075), rot=(0, 0, -math.pi / 2))
        else:
            lathe(f'hl_led{s}', [(.001, .022), (.012, .021), (.016, .016), (.016, 0), (.001, 0)],
                  M['satin'], 24, sharp=60, loc=(3.505, c, 1.075), rot=(0, 0, -math.pi / 2))
    slab(f'drl{s}', rect(y0 + .03, .95, y1 - .02, .962, .005), F, Y, Z, X, .008, .02, M['led'], .002)

# Bumper: body colour above, textured black valance below, fog lamps and plate.
bm = slab_bm([(3.42, .525), (3.675, .525), (3.68, .55), (3.67, .66), (3.63, .72), (3.42, .72)],
             (0, 0, 0), X, Z, Y, -.99, .99)
bevel_where(bm, lambda a, b, m: (abs(a.y) > .9 and b.x > .2) or (abs(b.y) > .9 and a.x > .2), .14, 8, clamp=False)
bevel_where(bm, lambda a, b, m: a.angle(b) > math.radians(30), .02, 3)
link('bumper', to_mesh(bm, 30), [M['paint']])
bm = slab_bm([(3.40, .40), (3.60, .40), (3.655, .45), (3.667, .53), (3.42, .53)], (0, 0, 0), X, Z, Y, -.95, .95)
bevel_where(bm, lambda a, b, m: (abs(a.y) > .9 and b.x > .2) or (abs(b.y) > .9 and a.x > .2), .13, 8, clamp=False)
bevel_where(bm, lambda a, b, m: a.angle(b) > math.radians(30), .015, 3)
link('valance', to_mesh(bm, 30), [M['black']])
for s in SIDES:
    rot = (0, 0, -math.pi / 2)
    p = (3.655, s * .76, .475)
    lathe(f'fog_ring{s}', [(.038, 0), (.052, 0), (.055, .007), (.05, .013), (.04, .01)], M['chrome'], 48, sharp=50, loc=p, rot=rot)
    lathe(f'fog_bowl{s}', [(r * .6, a * .6) for r, a in REFLECTOR], M['chrome'], 32, closed=False, sharp=None, loc=p, rot=rot)
    lathe(f'fog_lens{s}', [(.001, .014), (.025, .012), (.04, .008), (.04, .004), (.001, .004)], M['lens'], 48, sharp=60, loc=p, rot=rot)
slab('plate_frame', rect(-.27, .548, .27, .672, .012), (3.675, 0, 0), Y, Z, X, -.004, .004, M['black'], .002)
slab('plate', rect(-.26, .556, .26, .664, .008), (3.675, 0, 0), Y, Z, X, 0, .006, M['plate'], .002)
text('plate_txt', '01 A 777 CP', .075, (3.6815, .02, .608), Y, Z, X, M['ink'], .0008)

# Cab sides: doors, glass, handles, steps, mirrors, repeaters.
for s in SIDES:
    O = (0, s * 1.0, 0)
    W = Y * s
    tube(f'door_seam{s}', [(p[0], s * 1.0, p[1]) for p in
                           rpoly([(1.88, 1.0), (3.20, 1.0), (3.31, 1.45), (3.05, 2.34), (1.88, 2.34)], .05)],
         .0045, M['gap'], cyclic=True, smooth=False)
    seals = locals().setdefault('seals', [])
    seals.append(slab(f'win_seal{s}', rpoly([(1.95, 1.56), (3.27, 1.56), (3.06, 2.24), (1.95, 2.24)], .07), O, X, Z, W, -.003, .003, M['black'], .002))
    slab(f'win_glass{s}', rpoly([(1.98, 1.59), (3.23, 1.59), (3.03, 2.21), (1.98, 2.21)], .05), O, X, Z, W, -.002, .006, M['glass'], .002)
    slab(f'handle_well{s}', rect(1.97, 1.40, 2.19, 1.49, .03), O, X, Z, W, -.002, .004, M['black'], .002)
    slab(f'handle{s}', rect(1.99, 1.425, 2.17, 1.468, .02), O, X, Z, W, .004, .022, M['chassis'], .006)
    lathe(f'lock{s}', [(.001, 0), (.012, 0), (.012, .008), (.009, .011), (.001, .011)], M['chrome'], 24, sharp=50,
          loc=(2.24, s * 1.0, 1.447), rot=(0, 0, 0 if s > 0 else math.pi))
    slab(f'repeater_back{s}', rect(3.12, 1.10, 3.27, 1.16, .025), O, X, Z, W, -.002, .006, M['chrome'], .002)
    slab(f'repeater{s}', rect(3.12, 1.10, 3.27, 1.16, .025), O, X, Z, W, .006, .016, M['amber'], .004)
    # steps behind the front wheel
    slab(f'step_well{s}', rect(1.80, .66, 2.10, .95, .03), O, X, Z, W, -.003, .004, M['black'], .002)
    box(f'step_tread_hi{s}', (1.95, s * .985, .70), (.30, .09, .028), M['black'], .01)
    box(f'step_tread_lo{s}', (1.95, s * .93, .43), (.32, .20, .03), M['black'], .02)
    for x in (1.83, 2.07):
        box(f'step_hanger{s}{x}', (x, s * .93, .53), (.02, .04, .2), M['chassis'], 0, .004)
    tube(f'grab{s}', [(1.84, s * 1.0, 1.12), (1.84, s * 1.05, 1.19), (1.84, s * 1.05, 1.90), (1.84, s * 1.0, 1.97)],
         .013, M['satin'])
    # mirrors on tubular arms
    box(f'mirror_mount_hi{s}', (3.08, s * 1.005, 2.15), (.09, .03, .07), M['black'], .01, .006)
    box(f'mirror_mount_lo{s}', (3.27, s * 1.005, 1.45), (.09, .03, .07), M['black'], .01, .006)
    tube(f'mirror_arm_hi{s}', [(3.08, s * 1.0, 2.15), (3.12, s * 1.16, 2.22), (3.13, s * 1.31, 2.16), (3.13, s * 1.33, 2.10)], .014, M['chassis'])
    tube(f'mirror_arm_lo{s}', [(3.27, s * 1.0, 1.45), (3.22, s * 1.18, 1.46), (3.15, s * 1.31, 1.50)], .014, M['chassis'])
    tube(f'mirror_post{s}', [(3.13, s * 1.33, 2.10), (3.14, s * 1.32, 1.50)], .012, M['chassis'], smooth=False)
    for name, z0, z1, h in (('main', 1.72, 2.12, .11), ('wide', 1.50, 1.66, .09)):
        yc = s * 1.36
        slab(f'mirror_{name}{s}', rect(yc - h, z0, yc + h, z1, .035), (3.13, 0, 0), Y, Z, X, -.03, .035, M['gloss'], .012, 3)
        slab(f'mirror_{name}_glass{s}', rect(yc - h + .014, z0 + .014, yc + h - .014, z1 - .014, .025),
             (3.13, 0, 0), Y, Z, X, -.036, -.026, M['chrome'], .002)

# ---------- Cab interior, seen through the glass ----------
# Hollow the cab and open the windows with booleans, so the glass shows a dash, wheel and seats.
def cutter(name, bm_):
    c = link(name, to_mesh(bm_), [M['interior']])
    c.hide_render = True
    c.display_type = 'WIRE'
    return c


def cut(ob, c):
    bo = ob.modifiers.new(c.name, 'BOOLEAN')
    bo.operation, bo.object, bo.solver = 'DIFFERENCE', c, 'EXACT'
    bo.material_mode = 'TRANSFER'
    ob.modifiers.move(len(ob.modifiers) - 1, 0)


cut(cab, cutter('cut_inner', slab_bm([(1.80, .98), (3.44, .98), (3.44, 1.36), (3.19, 2.20), (3.0, 2.40), (1.80, 2.40)],
                                     (0, 0, 0), X, Z, Y, -.95, .95)))
c = cutter('cut_ws', slab_bm(rect(-.78, .08, .78, WS_LEN - .08, .04), WS_O, Y, WS_D, WS_N, -.25, .1))
cut(cab, c)
cut(ws_frit, c)
for s, seal in zip(SIDES, seals):
    c = cutter(f'cut_win{s}', slab_bm(rpoly([(1.99, 1.60), (3.22, 1.60), (3.02, 2.20), (1.99, 2.20)], .05),
                                      (0, 0, 0), X, Z, Y, s * .85, s * 1.1))
    cut(cab, c)
    cut(seal, c)
dash = slab_bm([(3.44, 1.0), (3.44, 1.36), (3.30, 1.44), (3.06, 1.43), (3.0, 1.30), (3.10, 1.0)], (0, 0, 0), X, Z, Y, -.93, .93)
link('dash', to_mesh(dash), [M['interior']], .02)
col_dir = Vector((-.55, 0, .84)).normalized()
wheel_at = Vector((2.92, .47, 1.62))
sw = lathe('steering', [(.19 + .018 * math.cos(a * math.pi / 6), .018 * math.sin(a * math.pi / 6)) for a in range(12)],
           M['interior'], 48, sharp=None, loc=wheel_at)
sw.rotation_euler = col_dir.to_track_quat('Y', 'Z').to_euler()
tube('column', [wheel_at, wheel_at - col_dir * .45], .035, M['interior'], smooth=False)
q = col_dir.to_track_quat('Y', 'Z')
for a in (0, 180, 270):
    tip = wheel_at + q @ Vector((.19 * math.cos(math.radians(a)), 0, .19 * math.sin(math.radians(a))))
    tube(f'spoke{a}', [wheel_at, tip], .014, M['interior'], smooth=False)
hub = lathe('steering_hub', [(.001, -.03), (.065, -.03), (.07, 0), (.06, .02), (.001, .025)], M['interior'], 32, sharp=50, loc=wheel_at)
hub.rotation_euler = sw.rotation_euler
box('binnacle', (3.13, .47, 1.48), (.16, .44, .10), M['interior'], .04, .02)
box('console', (2.72, .05, 1.18), (.55, .26, .36), M['interior'], .04, .02)
tube('gear_lever', [(2.62, .05, 1.36), (2.58, .05, 1.55)], .012, M['chrome'], smooth=False)
for yc, w in ((.48, .50), (-.33, .80)):
    box(f'seat_cushion{yc}', (2.20, yc, 1.42), (.50, w, .13), M['fabric'], .05, .035)
    bk = box(f'seat_back{yc}', (1.97, yc, 1.84), (.13, w, .72), M['fabric'], .05, .035)
    for hy in ((yc,) if w < .6 else (yc - .2, yc + .2)):
        box(f'headrest{yc}{hy}', (1.95, hy, 2.25), (.09, .26, .18), M['fabric'], .04, .03)

# Front mud flaps hang from the cab floor behind the front wheels.
for s in SIDES:
    slab(f'flap_f{s}', rect(min(s * .70, s * .98), .20, max(s * .70, s * .98), .63, .015), (2.09, 0, 0), Y, Z, X, 0, .012, M['flap'], .003)

# ---------- Chassis ----------
for s in SIDES:
    box(f'rail{s}', (.05, s * .43, .63), (6.70, .075, .22), M['chassis'], 0, .006)
    box(f'subframe{s}', (-.90, s * .43, .795), (5.00, .10, .11), M['chassis'], 0, .006)
    # leaf springs: stacked cambered leaves
    for ax, half in ((FA, .62), (RA, .66)):
        for j in range(4):
            L_ = half - .13 * j
            top = [(ax + L_ * u, .462 - .013 * j + .065 * u * u) for u in [i / 8 - 1 for i in range(17)]]
            pts = top + [(x, z - .012) for x, z in reversed(top)]
            slab(f'leaf{s}{ax}{j}', pts, (0, s * .43, 0), X, Z, Y, -.035, .035, M['chassis'], .003, 1)
for x in (3.30, 1.70, .10, -1.10, -3.25):
    box(f'xmember{x}', (x, 0, .63), (.08, .80, .18), M['chassis'], 0, .006)
for k in range(12):
    box(f'bearer{k}', (1.50 - k * .42, 0, .915), (.07, 2.16, .11), M['alu'], 0, .006)
lathe('rear_axle', [(.07, -.66), (.07, .66), (.001, .66), (.001, -.66)], M['chassis'], 32, sharp=60, loc=(RA, 0, WZ))
diff = lathe('diff', [(.001, -.17), (.10, -.15), (.17, -.05), (.17, .05), (.10, .15), (.001, .17)], M['chassis'], 32, sharp=70,
             loc=(RA + .05, 0, WZ), rot=(0, 0, math.pi / 2))
box('front_axle', (FA, 0, .34), (.11, 1.50, .11), M['chassis'], 0, .01)

# Fuel tank on the left, battery box on the right, side guards between the axles.
tank = rect(.55, .36, 1.0, .80, .11)
slab('fuel_tank', tank, (0, 0, 0), Y, Z, X, .20, 1.30, M['alu'], .01)
for x in (.42, 1.06):
    slab(f'tank_strap{x}', rpoly([(.54, .35), (1.01, .35), (1.01, .81), (.54, .81)], .115), (0, 0, 0), Y, Z, X, x, x + .04, M['chassis'], .003)
lathe('fuel_cap', [(.001, 0), (.045, 0), (.045, .03), (.038, .04), (.001, .04)], M['chrome'], 32, sharp=50, loc=(1.15, .80, .80), rot=(-math.pi / 2, 0, 0))
box('battery_box', (.95, -.82, .57), (.62, .34, .36), M['black'], .02, .01)
for s, x0, x1 in ((1, -1.05, .12), (-1, -1.05, 2.05)):
    for z in (.47, .70):
        box(f'guard{s}{z}', ((x0 + x1) / 2, s * 1.04, z), (x1 - x0, .04, .09), M['alu'], .01, .008)
    for x in (x0 + .1, x1 - .1, (x0 + x1) / 2):
        box(f'guard_post{s}{x}', (x, s * 1.02, .70), (.05, .035, .38), M['chassis'], 0, .005)

# ---------- Wheels ----------
TYRE = [(.226, -.086), (.245, -.097), (.28, -.106), (.32, -.108), (.355, -.104), (.374, -.097), (.385, -.089),
        (.390, -.078), (.390, -.052), (.379, -.050), (.379, -.036), (.390, -.034), (.390, -.010), (.379, -.008),
        (.379, .008), (.390, .010), (.390, .034), (.379, .036), (.379, .050), (.390, .052), (.390, .078),
        (.385, .089), (.374, .097), (.355, .104), (.32, .108), (.28, .106), (.245, .097), (.226, .086), (.222, 0)]
RIM = [(.240, .092), (.232, .098), (.218, .091), (.206, .076), (.201, .03), (.201, -.07), (.208, -.086),
       (.222, -.095), (.236, -.097), (.241, -.091), (.227, -.086), (.215, -.076), (.211, -.03), (.211, .07), (.222, .085)]
DISC = [(.207, .040), (.185, .046), (.150, .058), (.125, .062), (.112, .072), (.100, .078), (.068, .078),
        (.064, .074), (.064, .066), (.100, .070), (.110, .064), (.125, .054), (.150, .050), (.185, .038), (.207, .032)]
HUB = [(.066, .05), (.066, .095), (.062, .108), (.05, .118), (.03, .124), (.001, .126), (.001, .05)]


def wheel_meshes():
    bm_ = lathe_bm(TYRE, 288)
    for v in bm_.verts:   # every 4th ring of the tread sinks 11 mm: 72 cross grooves
        r = math.hypot(v.co.x, v.co.z)
        ring = round(math.atan2(v.co.z, v.co.x) / (2 * math.pi / 288)) % 288
        if r > .386 and ring % 4 == 0:
            v.co.x *= (r - .011) / r
            v.co.z *= (r - .011) / r
    tyre = to_mesh(bm_, 50)
    rim = to_mesh(lathe_bm(RIM, 72), 50)
    # disc with six hand holes, cut once and shared by every wheel
    disc = link('disc_src', to_mesh(lathe_bm(DISC, 72), 50), [M['rim']])
    cut = bmesh.new()
    for i in range(6):
        a = 2 * math.pi * i / 6 + math.pi / 6
        bmesh.ops.create_cone(cut, cap_ends=True, segments=32, radius1=.031, radius2=.031, depth=.2,
                              matrix=Matrix.Translation((.15 * math.cos(a), .05, .15 * math.sin(a))) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    cutter = link('disc_cut', to_mesh(cut), [])
    bo = disc.modifiers.new('holes', 'BOOLEAN')
    bo.operation, bo.object = 'DIFFERENCE', cutter
    disc.modifiers.move(len(disc.modifiers) - 1, 0)
    dg = bpy.context.evaluated_depsgraph_get()
    disc_me = bpy.data.meshes.new_from_object(disc.evaluated_get(dg))
    bpy.data.objects.remove(disc)
    bpy.data.objects.remove(cutter)
    hub = to_mesh(lathe_bm(HUB, 48), 35)
    drum = to_mesh(lathe_bm([(.19, -.08), (.19, .03), (.07, .03), (.07, -.08)], 48), 50)
    nuts = bmesh.new()
    for i in range(6):
        a = 2 * math.pi * i / 6
        m = Matrix.Translation((.0875 * math.cos(a), .092, .0875 * math.sin(a))) @ Matrix.Rotation(math.pi / 2, 4, 'X')
        bmesh.ops.create_cone(nuts, cap_ends=True, segments=6, radius1=.016, radius2=.016, depth=.03, matrix=m)
        bmesh.ops.create_cone(nuts, cap_ends=True, segments=16, radius1=.007, radius2=.007, depth=.05,
                              matrix=Matrix.Translation((.0875 * math.cos(a), .1, .0875 * math.sin(a))) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    nut_me = to_mesh(nuts, 40)
    return [(tyre, M['rubber']), (rim, M['rim']), (disc_me, M['rim']), (hub, M['chrome']),
            (drum, M['drum']), (nut_me, M['chrome'])]


WHEEL = wheel_meshes()


def wheel(name, loc, face):
    """face=+1: disc faces +Y."""
    root = bpy.data.objects.new(name, None)
    col.objects.link(root)
    root.location = loc
    root.scale = (1, face, 1)
    for i, (me, m) in enumerate(WHEEL):
        ob = bpy.data.objects.new(f'{name}_{i}', me)
        col.objects.link(ob)
        if not me.materials:
            me.materials.append(m)
        ob.parent = root
    if face > 0:   # mirrored wheels would read backwards, and the right side is never the hero
        for k, body in enumerate(('CLOUDPLUS  RADIAL  TUBELESS', '215/75 R17.5  LT  128/126 M')):
            path = bpy.data.curves.new(f'{name}_path{k}', 'CURVE')
            sp = path.splines.new('POLY')
            sp.points.add(63)
            for i, pt in enumerate(sp.points):   # clockwise, so letters stand with their tops to the tread
                t = -2 * math.pi * i / 64 + math.pi * (.62 + k)
                pt.co = (.296 * math.cos(t), .296 * math.sin(t), 0, 1)
            sp.use_cyclic_u = True
            po = bpy.data.objects.new(f'{name}_path{k}', path)
            col.objects.link(po)
            tx = text(f'{name}_txt{k}', body, .03, (0, 0, 0), X, Y, Z, M['rubber_txt'], .0016)
            tx.data.align_x, tx.data.align_y = 'LEFT', 'BOTTOM'
            tx.data.follow_curve = po
            for o in (po, tx):
                o.parent = root
                o.matrix_basis = Matrix.Translation((0, .1085, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
            po.hide_render = True
    return root


for s in SIDES:
    wheel(f'wheel_f{s}', (FA, s * .84, WZ), s)
    wheel(f'wheel_ro{s}', (RA, s * .92, WZ), s)
    wheel(f'wheel_ri{s}', (RA, s * .655, WZ), -s)
    lathe(f'hub_ext{s}', [(.07, 0), (.07, .14), (.001, .14)], M['chrome'], 32, sharp=50, loc=(RA, s * .92, WZ),
          rot=(0, 0, 0 if s > 0 else math.pi))
    # rear fender and mud flap
    band = arc(0, 0, .47, 12, 168, 40) + arc(0, 0, .455, 168, 12, 40)
    slab(f'fender{s}', band, (RA, 0, WZ), X, Z, Y, s * .53, s * 1.06, M['black'], .004)
    slab(f'flap_r{s}', rect(min(s * .55, s * 1.05), .17, max(s * .55, s * 1.05), .80, .02), (RA - .56, 0, 0), Y, Z, X, 0, .012, M['flap'], .003)
    box(f'flap_bar{s}', (RA - .55, s * .80, .82), (.04, .52, .04), M['chassis'], 0, .006)

# ---------- Cargo box ----------
BX0, BX1, BW, BZ0, BZ1 = -3.45, 1.62, 1.10, .97, 3.20
bxc = (BX0 + BX1) / 2
box('cargo_box', (bxc, 0, (BZ0 + BZ1) / 2), (BX1 - BX0, 2 * BW, BZ1 - BZ0), M['box'], 0, .02)
P = .075
for x in (BX0, BX1):
    for s in SIDES:
        box(f'post{x}{s}', (x, s * BW, (BZ0 + BZ1) / 2 + .01), (P, P, BZ1 - BZ0 + .06), M['alu'], .012, .006)
    box(f'top_x{x}', (x, 0, BZ1), (P, 2 * BW + P, P), M['alu'], .012, .006)
for s in SIDES:
    box(f'top_rail{s}', (bxc, s * BW, BZ1), (BX1 - BX0 + P, P, P), M['alu'], .012, .006)
    box(f'rub_rail{s}', (bxc, s * (BW + .012), 1.045), (BX1 - BX0 + .04, .05, .16), M['alu'], 0, .008)
    box(f'rub_rib{s}', (bxc, s * (BW + .04), 1.045), (BX1 - BX0 + .02, .012, .03), M['alu'], 0, .004)
    # rivet rows along the rails
    for z, y in ((BZ1 - .01, BW + P / 2), (1.09, BW + .037), (1.0, BW + .037)):
        rb = bmesh.new()
        bmesh.ops.create_uvsphere(rb, u_segments=10, v_segments=6, radius=.0075)
        bmesh.ops.scale(rb, vec=(1, .45, 1), verts=rb.verts)
        rv = link(f'rivets{s}{z}', to_mesh(rb), [M['alu']])
        rv.location = (BX0 + .06, s * y, z)
        ar = rv.modifiers.new('arr', 'ARRAY')
        ar.use_relative_offset, ar.use_constant_offset = False, True
        ar.constant_offset_displace = (.1, 0, 0)
        ar.count = int((BX1 - BX0 - .1) / .1)
        rv.modifiers.move(len(rv.modifiers) - 1, 0)
    # side marker lights: amber along the side, red at the rear
    for x in (1.35, .35, -.75, -2.40, -3.30):
        y = s * (BW + .037)
        slab(f'marker{s}{x}', rect(x - .045, 1.025, x + .045, 1.065, .012), (0, y, 0), X, Z, Y * s, 0, .014,
             M['red'] if x < -3 else M['amber'], .004)
    for k in range(1, 4):   # sandwich-panel joints
        x = BX1 - (BX1 - BX0) * k / 4
        tube(f'panel_joint{s}{k}', [(x, s * (BW - .0012), BZ0 + .1), (x, s * (BW - .0012), BZ1 - .05)], .0035, M['gap'], smooth=False)
    # wordmark and line on the box side
    U = -X * s
    text(f'logo{s}', 'cloudplus', .62, (bxc, s * (BW + .0008), 2.30), U, Z, Y * s, M['blue'])
    text(f'tag{s}', 'CRM  ·  ERP  ·  1C', .15, (bxc, s * (BW + .0008), 1.86), U, Z, Y * s, M['grey'])
    slab(f'stripe{s}', rect(BX0 + .08, 1.20, BX1 - .08, 1.235), (0, s * BW, 0), X, Z, Y * s, -.001, .0024, M['blue'], 0)

# Rear: two swing doors with hinges, locking bars, lights, sill and underride guard.
R = (BX0, 0, 0)
for s in SIDES:
    door = rect(min(s * .007, s * 1.065), 1.06, max(s * .007, s * 1.065), 3.13, .015)
    slab(f'door{s}', door, R, Y, Z, -X, 0, .035, M['box'], .008)
    for z in (1.22, 1.78, 2.46, 3.00):
        box(f'hinge{s}{z}', (BX0 - .045, s * .975, z), (.014, .17, .07), M['satin'], .006, .004)
        lathe(f'knuckle{s}{z}', [(.017, -.05), (.017, .05), (.001, .05), (.001, -.05)], M['satin'], 24, sharp=50,
              loc=(BX0 - .035, s * 1.09, z), rot=(math.pi / 2, 0, 0))
    for y in (s * .24, s * .74):
        tube(f'lockbar{s}{y}', [(BX0 - .07, y, 1.02), (BX0 - .07, y, 3.17)], .017, M['satin'], smooth=False)
        for z in (1.03, 3.16):
            box(f'keeper{s}{y}{z}', (BX0 - .06, y, z), (.06, .09, .06), M['satin'], .01, .008)
        for z in (1.70, 2.70):
            box(f'guide{s}{y}{z}', (BX0 - .05, y, z), (.04, .08, .045), M['satin'], .006, .005)
        tube(f'lever{s}{y}', [(BX0 - .07, y, 1.52), (BX0 - .1, y, 1.52), (BX0 - .1, y + s * .22, 1.52)], .012, M['satin'], smooth=False)
        box(f'catch{s}{y}', (BX0 - .055, y + s * .24, 1.52), (.04, .05, .06), M['satin'], .008, .005)
    # rear top markers
    slab(f'top_marker{s}', rect(min(s * .86, s * .98), 3.08, max(s * .86, s * .98), 3.12, .012), R, Y, Z, -X, .035, .05, M['red'], .004)
    # tail light cluster: amber | red | white
    slab(f'tail_house{s}', rect(min(s * .58, s * 1.0), .63, max(s * .58, s * 1.0), .79, .03), (BX0 + .05, 0, 0), Y, Z, -X, 0, .05, M['black'], .006)
    for (a, b), m in (((.60, .76), M['red']), ((.76, .87), M['amber']), ((.87, .98), M['lens'])):
        slab(f'tail_back{s}{a}', rect(min(s * a, s * b), .65, max(s * a, s * b), .77, .01), (BX0 + .05, 0, 0), Y, Z, -X, .05, .056, M['chrome'], 0)
        slab(f'tail{s}{a}', rect(min(s * a, s * b) + .004, .652, max(s * a, s * b) - .004, .768, .01), (BX0 + .05, 0, 0), Y, Z, -X, .056, .072, m, .004)
    box(f'dock_bumper{s}', (BX0 - .05, s * .80, .84), (.10, .20, .16), M['black'], .02, .01)
    box(f'underride_post{s}', (BX0 + .12, s * .43, .52), (.08, .07, .26), M['chassis'], 0, .006)
box('door_seal', (BX0 - .012, 0, 2.095), (.03, .016, 2.06), M['black'], 0, .003)
box('tail_bar', (BX0 + .07, 0, .71), (.06, 2.0, .14), M['chassis'], 0, .006)
box('rear_sill', (BX0 - .01, 0, .93), (.10, 2.25, .12), M['alu'], 0, .008)
box('underride', (BX0 + .05, 0, .44), (.12, 1.90, .10), M['alu'], .02, .01)
for s in SIDES:
    slab(f'reflector{s}', rect(min(s * .55, s * .85), .42, max(s * .55, s * .85), .46, .01), (BX0 - .01, 0, 0), Y, Z, -X, 0, .008, M['red'], .002)


# ---------- Bowed front ----------
# A flat-faced cab reads as a toy; bow everything ahead of x=3.0 into a convex front in plan.
def bow(x, y):
    w = min(max((x - 3.0) / .3, 0), 1)
    return .06 * (1 - min(1, y * y)) * w * w * (3 - 2 * w)


for ob in list(col.objects):
    if ob.parent:
        continue
    at_origin = ob.location.length == 0 and Vector(ob.rotation_euler).length == 0
    if at_origin and ob.type == 'MESH':
        for v in ob.data.vertices:
            v.co.x += bow(v.co.x, v.co.y)
    elif at_origin and ob.type == 'CURVE':
        for sp in ob.data.splines:
            for p in list(sp.bezier_points) + list(sp.points):
                p.co.x += bow(p.co.x, p.co.y)
    elif ob.location.x > 3.0:
        x, y = ob.location.x, ob.location.y
        ob.location.x += bow(x, y)
        ob.rotation_euler.z += math.atan(.12 * y) * (1 if x > 3.3 else 0)


# ---------- Studio ----------
def look(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()


fl = bmesh.new()
bmesh.ops.create_grid(fl, x_segments=1, y_segments=1, size=150)
floor_m = material('floor', (.03, .03, .032), rough=.42)
nt = floor_m.node_tree
tc, b = nt.nodes['Texture Coordinate'], nt.nodes['Principled BSDF']
vl = nt.nodes.new('ShaderNodeVectorMath')
vl.operation = 'LENGTH'
nt.links.new(tc.outputs['Object'], vl.inputs[0])
ramp = nt.nodes.new('ShaderNodeValToRGB')
mr = nt.nodes.new('ShaderNodeMapRange')
mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = 5, 18
nt.links.new(vl.outputs['Value'], mr.inputs['Value'])
nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].color = (.02, .021, .023, 1)
ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
fade = nt.nodes.new('ShaderNodeMath')   # far floor stops mirroring the studio horizon, so it melts into black
fade.operation = 'MULTIPLY_ADD'
nt.links.new(mr.outputs['Result'], fade.inputs[0])
fade.inputs[1].default_value, fade.inputs[2].default_value = -.5, .5
nt.links.new(fade.outputs[0], b.inputs['Specular IOR Level'])
link('floor', to_mesh(fl), [floor_m])

world = bpy.data.worlds.new('world')
world.use_nodes = True
wn = world.node_tree
tcw, sepw, rmp, lp = (wn.nodes.new(k) for k in ('ShaderNodeTexCoord', 'ShaderNodeSeparateXYZ', 'ShaderNodeValToRGB', 'ShaderNodeLightPath'))
mpw = wn.nodes.new('ShaderNodeMapRange')
wn.links.new(tcw.outputs['Generated'], sepw.inputs[0])
wn.links.new(sepw.outputs['Z'], mpw.inputs['Value'])
mpw.inputs['From Min'].default_value = -1
wn.links.new(mpw.outputs['Result'], rmp.inputs['Fac'])
# a dark floor, a bright horizon strip and a soft overhead: what a studio cyclorama gives the paint to reflect
els = rmp.color_ramp.elements
els[0].color, els[1].position, els[1].color = (.002, .002, .002, 1), 1, (.16, .17, .18, 1)
for pos, v in ((.49, .004), (.515, .45), (.55, .03), (.75, .09)):
    e = els.new(pos)
    e.color = (v, v, v * 1.05, 1)
mxw = wn.nodes.new('ShaderNodeMix')
mxw.data_type = 'RGBA'
wn.links.new(lp.outputs['Is Camera Ray'], mxw.inputs['Factor'])
wa, wb = [x for x in mxw.inputs if x.type == 'RGBA']
wn.links.new(rmp.outputs['Color'], wa)
wb.default_value = (.004, .004, .005, 1)
wn.links.new([x for x in mxw.outputs if x.type == 'RGBA'][0], wn.nodes['Background'].inputs['Color'])
scene.world = world


def area(name, loc, target, size, size_y, energy, color=(1, 1, 1)):
    li = bpy.data.lights.new(name, 'AREA')
    li.shape, li.size, li.size_y, li.energy, li.color = 'RECTANGLE', size, size_y, energy, color
    ob = bpy.data.objects.new(name, li)
    col.objects.link(ob)
    ob.location = loc
    look(ob, target)
    return ob


area('top', (.2, 0, 7.5), (.2, 0, 0), 8, 3.5, 800)
area('key', (7.5, 6.5, 4.5), (1, 0, 1.2), 3, 2, 1400, (1, .97, .93))
area('streak', (-.5, 6.5, 4.6), (-.5, 0, 1.6), 11, .7, 900)
area('rim_l', (-6, 7, 3.2), (0, 0, 1.4), .6, 6, 700, (.9, .95, 1))
area('rim_r', (5, -7.5, 3.0), (0, 0, 1.4), .6, 6, 600, (.9, .95, 1))
area('fill', (10, -3, 1.6), (0, 0, 1.2), 4, 3, 120)
cab_lamp = area('cab_lamp', (2.6, 0, 2.34), (2.6, 0, 1.0), 1.2, 1.4, 45)   # car-render cheat: lights the cab interior
cab_lamp.visible_camera = cab_lamp.visible_glossy = False
area('back', (-9, -2, 2.5), (0, 0, 1.4), 3, 3, 400, (.9, .95, 1))
area('side_box', (-11, 9, 2.6), (-1, 1, 2), 4, 3, 260)   # reads as a gradient band in the box side

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
col.objects.link(cam)
scene.camera = cam
SHOT = {   # location, aim, focal length, f-stop, focus point
    'front': ((10.8, 7.6, 1.7), (.3, .2, 1.4), 50, 2.8, (3.5, 1.0, 1.2)),
    'rear': ((-10.4, 7.8, 2.6), (-.4, .2, 1.45), 50, 2.8, (-3.45, 1.1, 1.6)),
    'close': ((5.4, 2.9, .55), (3.05, .8, .78), 55, 2.2, (2.9, 1.0, .5)),
}

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = True
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.blur_glossy = .5
scene.cycles.caustics_reflective = scene.cycles.caustics_refractive = False
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'

for shot in [s for s in SHOTS if s in SHOT]:
    loc, aim, lens, fstop, focus = SHOT[shot]
    cam.location = loc
    look(cam, aim)
    cam.data.lens = lens
    cam.data.dof.use_dof = True
    cam.data.dof.aperture_fstop = fstop
    cam.data.dof.focus_distance = (Vector(focus) - Vector(loc)).length
    scene.render.filepath = OUT if len(SHOTS) == 1 else OUT.rsplit('.', 1)[0] + f'_{shot}.png'
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)
