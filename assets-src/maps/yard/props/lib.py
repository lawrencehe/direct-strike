# ============================================================
# yard 地图道具（集装箱、隔离墩、沙袋墙）建模脚本共用的工具（#50）
#
# 每个道具的脚本（container.py 等）用 Blender 无头模式跑：
#   blender -b --factory-startup --python assets-src/maps/yard/props/container.py
# 流程都一样：bmesh 建几何 → 展 UV → 节点材质（Poly Haven 的 CC0 贴图 + 程序生成的锈、污渍、磨损）
# → Cycles 烘焙成 颜色 / 粗糙度 / 法线 三张贴图 → 导出 glb（贴图嵌在里面）→ tools/glb.mjs 压缩进 assets/。
# 一次跑完整个流程用 build.sh。
# ============================================================
import bpy, bmesh, math, os, subprocess, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
DL = os.path.abspath(os.path.join(HERE, '../download'))      # 原始下载，已 gitignore
OUT = os.path.join(ROOT, 'tools/out/props')                  # 中间产物（烘焙图、未压缩的 glb）
os.makedirs(DL, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


# ---------- 素材 ----------
def polyhaven(pid, res='2k'):
    """下载 Poly Haven 材质（CC0），返回 {'diff','nor','rough'} 本地路径。下载过的不重复下载。"""
    want = {'Diffuse': 'diff', 'nor_gl': 'nor', 'Rough': 'rough'}
    paths = {s: os.path.join(DL, f'{pid}_{s}_{res}.jpg') for s in want.values()}
    if all(os.path.exists(p) for p in paths.values()):
        return paths
    # 用 curl：Python 默认的 User-Agent 会被 Poly Haven 拒绝（403）
    files = json.loads(subprocess.run(['curl', '-sSf', f'https://api.polyhaven.com/files/{pid}'],
                                      check=True, capture_output=True).stdout)
    for ph, s in want.items():
        if not os.path.exists(paths[s]):
            print('下载', pid, s)
            subprocess.run(['curl', '-sSfL', '-o', paths[s], files[ph][res]['jpg']['url']], check=True)
    return paths


# ---------- 场景 ----------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.bake.margin = 8
    return sc


class Mesh:
    """用 bmesh 往一个网格里加零件，最后生成一个物体。单位米，Blender 坐标：x 长、y 宽、z 高。"""

    def __init__(self):
        self.bm = bmesh.new()
        self.sheets = set()     # 单面板的面，不参与自动翻法线

    def box(self, x0, y0, z0, x1, y1, z1, skip=()):
        """轴对齐的方块。skip 里写不要的面：'-x' '+x' '-y' '+y' '-z' '+z'（贴着别的零件、看不见的面）"""
        bm = self.bm
        v = [bm.verts.new((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
        faces = {
            '-z': (0, 2, 3, 1), '+z': (4, 5, 7, 6), '-y': (0, 1, 5, 4),
            '+y': (2, 6, 7, 3), '-x': (0, 4, 6, 2), '+x': (1, 3, 7, 5),
        }
        for k, idx in faces.items():
            if k not in skip:
                bm.faces.new([v[i] for i in idx])

    def cylinder(self, p0, p1, r, seg=8, caps=True):
        """两点之间的圆柱（锁杆、把手）"""
        a, b = Vector(p0), Vector(p1)
        axis = (b - a).normalized()
        u = axis.orthogonal().normalized()
        w = axis.cross(u)
        bm = self.bm
        ring0, ring1 = [], []
        for i in range(seg):
            t = 2 * math.pi * i / seg
            off = (u * math.cos(t) + w * math.sin(t)) * r
            ring0.append(bm.verts.new(a + off))
            ring1.append(bm.verts.new(b + off))
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
        if caps:
            bm.faces.new(list(reversed(ring0)))
            bm.faces.new(ring1)

    def sheet(self, pts, a0, a1, axis, outward):
        """把一条折线（瓦楞的截面）沿 axis 方向从 a0 拉到 a1，成一片单面的板，正面朝 outward（如 (0, 1, 0)）。
        pts 是 [(p, q)...]：截面所在平面的两个坐标；axis='z' 时 (p,q)=(x,y)，axis='y' 时 (x,z)，axis='x' 时 (y,z)。
        单面的板没法自动判断朝向（recalc 只对封闭的零件可靠），所以按 outward 定。"""
        bm = self.bm
        out = Vector(outward)

        def P(p, q, a):
            return {'z': (p, q, a), 'y': (p, a, q), 'x': (a, p, q)}[axis]
        row0 = [bm.verts.new(P(p, q, a0)) for p, q in pts]
        row1 = [bm.verts.new(P(p, q, a1)) for p, q in pts]
        for i in range(len(pts) - 1):
            f = bm.faces.new((row0[i], row0[i + 1], row1[i + 1], row1[i]))
            f.normal_update()
            if f.normal.dot(out) < 0:
                f.normal_flip()
            self.sheets.add(f)

    def to_object(self, name, sharp_deg=35):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f not in self.sheets])
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        # 平滑着色 + 按角度标硬边（导出 glb 时分开法线）
        lim = math.radians(sharp_deg)
        bm2 = bmesh.new(); bm2.from_mesh(me)
        for e in bm2.edges:
            e.smooth = not (len(e.link_faces) != 2 or e.calc_face_angle(0) > lim)
        for f in bm2.faces:
            f.smooth = True
        bm2.to_mesh(me); bm2.free()
        return ob


def corrugation(length, pitch, depth, flat_out, flat_in, start=0.0):
    """梯形瓦楞的截面折线：沿长度方向 p 从 start 到 start+length，q 是向内的深度（0 = 外表面，depth = 凹进去）"""
    slope = (pitch - flat_out - flat_in) / 2
    pts, p = [(start, 0.0)], start
    seq = [(flat_out, 0.0), (slope, depth), (flat_in, depth), (slope, 0.0)]
    end = start + length
    while p < end - 1e-6:
        for d, q in seq:
            np_ = min(p + d, end)
            if np_ - p > 1e-6:
                # 截断在半截斜坡上时按比例插值深度
                q0 = pts[-1][1]
                frac = (np_ - p) / d
                pts.append((np_, q0 + (q - q0) * frac))
            p = np_
            if p >= end - 1e-6:
                break
    return pts


def uv_unwrap(ob, margin=0.004):
    """智能投影展 UV，并按面积打包（所有岛同一个像素密度）"""
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0,
                             scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True, scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------- 节点 ----------
class Nodes:
    """少写点节点连线的样板代码"""

    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.nt.links.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        m = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                self.link(v, m.inputs[i])
        return m.outputs[0]

    def mix(self, fac, a, b, blend='MIX'):
        """颜色混合：fac 为 0 取 a，为 1 取 b"""
        m = self.n('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        for sock, v in ((m.inputs['Factor'], fac), (m.inputs[6], a), (m.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = v
            else:
                self.link(v, sock)
        return m.outputs[2]

    def image(self, path, coords=None, colorspace='sRGB', box=False, ext='REPEAT'):
        """贴图节点。box=True 时按物体坐标做盒式投影（不依赖 UV，贴图按真实米数铺）"""
        t = self.n('ShaderNodeTexImage', extension=ext)
        t.image = bpy.data.images.load(path, check_existing=True)
        t.image.colorspace_settings.name = colorspace
        if box:
            t.projection = 'BOX'
            t.projection_blend = 0.25
        if coords is not None:
            self.link(coords, t.inputs['Vector'])
        return t

    def scaled_obj(self, scale):
        """物体坐标乘一个缩放（一张贴图覆盖 1/scale 米）"""
        tc = self.n('ShaderNodeTexCoord')
        mp = self.n('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
        self.link(tc.outputs['Object'], mp.inputs['Vector'])
        return mp.outputs[0]

    def noise(self, coords, scale, detail=4.0, rough=0.6):
        nz = self.n('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = scale
        nz.inputs['Detail'].default_value = detail
        nz.inputs['Roughness'].default_value = rough
        if coords is not None:
            self.link(coords, nz.inputs['Vector'])
        return nz.outputs['Fac']

    def ramp(self, inp, a, b, ca=(0, 0, 0, 1), cb=(1, 1, 1, 1)):
        """把 inp 在 [a, b] 之间映射到 0..1（线性）"""
        r = self.n('ShaderNodeValToRGB')
        r.color_ramp.elements[0].position = a
        r.color_ramp.elements[0].color = ca
        r.color_ramp.elements[1].position = b
        r.color_ramp.elements[1].color = cb
        self.link(inp, r.inputs['Fac'])
        return r.outputs['Color']

    def bw(self, color):
        c = self.n('ShaderNodeRGBToBW')
        self.link(color, c.inputs[0])
        return c.outputs[0]


# ---------- 烘焙 ----------
def new_image(name, size, data=False):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    return img


def bake(ob, mat, kind, img, samples=16):
    """把材质烘焙到 img（物体要已经展好 UV）。kind: 'DIFFUSE'（只要颜色）/ 'ROUGHNESS' / 'NORMAL' / 'AO'"""
    sc = bpy.context.scene
    sc.cycles.samples = samples
    nt = mat.node_tree
    tgt = nt.nodes.get('__bake__') or nt.nodes.new('ShaderNodeTexImage')
    tgt.name = '__bake__'
    tgt.image = img
    for n in nt.nodes:
        n.select = False
    tgt.select = True
    nt.nodes.active = tgt
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    kw = {'type': kind, 'margin': 8, 'use_clear': True}
    if kind == 'DIFFUSE':
        kw['pass_filter'] = {'COLOR'}
    if kind == 'NORMAL':
        kw['normal_space'] = 'TANGENT'
    print('烘焙', ob.name, kind, img.name, f'{img.size[0]}px', flush=True)
    bpy.ops.object.bake(**kw)
    path = os.path.join(OUT, img.name + '.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return path


def bake_value(ob, mat, socket, img, samples=8):
    """把材质里任意一个输出（遮罩、数值）烘成图：临时接到自发光上，用 EMIT 烘焙，再接回原来的表面"""
    nt = mat.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    old = out.inputs['Surface'].links[0].from_socket
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(socket, em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    path = bake(ob, mat, 'EMIT', img, samples)
    nt.links.new(old, out.inputs['Surface'])
    nt.nodes.remove(em)
    return path


def image_node(N, img, uv=True):
    """读一张已经烘好的图（按 UV）"""
    t = N.n('ShaderNodeTexImage')
    t.image = img
    if uv:
        u = N.n('ShaderNodeUVMap')
        N.link(u.outputs[0], t.inputs['Vector'])
    return t


def final_material(name, diff, rough, nor, metallic=0.0):
    """导出用的材质：只接烘焙好的三张图"""
    mat = bpy.data.materials.new(name)
    N = Nodes(mat)
    out = N.n('ShaderNodeOutputMaterial')
    bs = N.n('ShaderNodeBsdfPrincipled')
    N.link(bs.outputs[0], out.inputs['Surface'])
    bs.inputs['Metallic'].default_value = metallic
    d = N.image(diff)
    N.link(d.outputs['Color'], bs.inputs['Base Color'])
    r = N.image(rough, colorspace='Non-Color')
    N.link(r.outputs['Color'], bs.inputs['Roughness'])
    n = N.image(nor, colorspace='Non-Color')
    nm = N.n('ShaderNodeNormalMap')
    N.link(n.outputs['Color'], nm.inputs['Color'])
    N.link(nm.outputs['Normal'], bs.inputs['Normal'])
    return mat


def export_glb(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_animations=False, export_skins=False, export_yup=True,
                              export_image_format='AUTO', export_apply=True)
    print('导出', path, os.path.getsize(path) // 1024, 'KB')
