"""Surface points of the scripted truck, for the particle river on /next/.

Run: Blender -b -P blender/truck_points.py
Builds the truck with truck.py (no render), samples its surfaces and sharp edges, and writes
public/world/truck-points.bin: int16 x, y, z (millimetres) and kind per point, in the particle
scene's frame (cab towards -x, y up, the detailed side towards +z), plus truck-points.json with
the wheel centres. kind: 0 surface, 1 edge; +90 wheels (they spin), +110 the rest (it idles).
"""
import json
import os
import random
import struct
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
PTS_DIR = os.path.join(HERE, '..', 'public', 'world')
PTS_N, PTS_SCALE = 40000, 1.45   # names truck.py does not use: its globals land in this namespace

sys.argv = [sys.argv[0], '--', '/tmp/truck-unused.png', '1', 'none']   # 'none': build only, render no shot
exec(compile(open(os.path.join(HERE, 'truck.py')).read(), 'truck.py', 'exec'))

random.seed(3)
dg = bpy.context.evaluated_depsgraph_get()
tris, edges = [], []
for ob in bpy.context.scene.objects:
    if ob.type not in {'MESH', 'CURVE', 'FONT'} or ob.name == 'floor':
        continue
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    M, wheel = ob.matrix_world, ob.name.startswith('wheel')
    vs = [M @ v.co for v in me.vertices]
    me.calc_loop_triangles()
    for t in me.loop_triangles:
        a, b, c = (vs[i] for i in t.vertices)
        area = (b - a).cross(c - a).length / 2
        if area > 1e-7:
            tris.append((area, a, b, c, wheel))
    bm = bmesh.new()
    bm.from_mesh(me)
    for e in bm.edges:
        # Outline: open borders and creases sharper than ~35°, which read as lines of light.
        if len(e.link_faces) == 1 or (len(e.link_faces) == 2 and e.calc_face_angle(0) > .6):
            p, q = M @ e.verts[0].co, M @ e.verts[1].co
            edges.append(((p - q).length, p, q, wheel))
    bm.free()
    ev.to_mesh_clear()

xs = [v.x for _, a, b, c, _ in tris for v in (a, b, c)]
cx = (min(xs) + max(xs)) / 2


def frame(v):   # truck frame (x forward, y left, z up) -> particle frame
    return (-(v.x - cx) * PTS_SCALE, v.z * PTS_SCALE, v.y * PTS_SCALE)


points = []
for area, a, b, c, wheel in random.choices(tris, weights=[t[0] for t in tris], k=int(PTS_N * .68)):
    u, w = random.random(), random.random()
    if u + w > 1:
        u, w = 1 - u, 1 - w
    points.append((*frame(a + (b - a) * u + (c - a) * w), 90 if wheel else 110))
for length, p, q, wheel in random.choices(edges, weights=[e[0] for e in edges], k=PTS_N - len(points)):
    points.append((*frame(p.lerp(q, random.random())), 91 if wheel else 111))

os.makedirs(PTS_DIR, exist_ok=True)
with open(os.path.join(PTS_DIR, 'truck-points.bin'), 'wb') as f:
    for x, y, z, k in points:
        f.write(struct.pack('<4h', round(x * 1000), round(y * 1000), round(z * 1000), k))
meta = {'count': len(points), 'wheels': [round(-(FA - cx) * PTS_SCALE, 3), round(-(RA - cx) * PTS_SCALE, 3)], 'wheelY': round(WZ * PTS_SCALE, 3)}
json.dump(meta, open(os.path.join(PTS_DIR, 'truck-points.json'), 'w'))
print('truck points', meta, len(tris), 'triangles', len(edges), 'edges')
