# Blender 无头脚本：角色和骨骼处理。通过 tools/rig.sh 调用，不要直接运行。
# 挂道具不在这里，用 glb.mjs attach：Blender 导出器遇到带缩放的骨架时，骨骼子物体的位置会算错。
#   rig.sh add-anim 模型.glb 动画.fbx|.glb --name 名字 -o 输出.glb [--clip 来源动画名] [--force]
#       把同骨架（如 Mixamo）的动画按世界空间重定向进模型。自动处理 FBX 和 glTF 的单位、轴向、骨骼朝向和帧率差异。
#       前提是两边静止姿态一致，不一致时默认拒绝。Mixamo 请下载 With Skin 的 FBX。
#   rig.sh rename-bones 模型.glb -o 输出.glb (--strip-prefix 前缀 | --map '{"旧":"新"}')
#   rig.sh decimate 模型.glb --ratio 0.5 -o 输出.glb
import argparse, json, math, re, sys
import bpy
from mathutils import Matrix, Quaternion, Vector


def result(msg): print(f'RESULT: {msg}', flush=True)
def warn(msg): print(f'WARN: {msg}', flush=True)
def fail(msg):
    print(f'ERROR: {msg}', flush=True)
    sys.exit(1)


def import_file(path):
    before = set(bpy.data.objects)
    low = path.lower()
    if low.endswith(('.glb', '.gltf')): bpy.ops.import_scene.gltf(filepath=path)
    elif low.endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
    else: fail(f'不支持的格式：{path}')
    return [o for o in bpy.data.objects if o not in before]


def load_base(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return import_file(path)


def main_armature(objs):
    arms = [o for o in objs if o.type == 'ARMATURE']
    if not arms: fail('文件里没有骨架')
    return max(arms, key=lambda o: len(o.data.bones))


def export_glb(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_animations=True,
                              export_animation_mode='ACTIONS', export_skins=True, export_image_format='AUTO',
                              # 不重新采样：保留原有关键帧的时间，否则循环动画的时长会被取整到整数帧
                              export_force_sampling=False)
    result(f'已输出 {path}（未压缩，再跑 glb.mjs optimize 和 glb-view.mjs compare）')


def strip_name(name):
    # mixamorig:Hips、mixamorig1:Hips、mixamorigHips 都归一成 Hips
    return re.sub(r'^mixamorig\d*:?', '', name.split('|')[-1])


def world_rot(m): return m.decompose()[1]


def add_anim(a):
    base = load_base(a.model)
    tgt = main_armature(base)
    scene = bpy.context.scene
    dst_fps = scene.render.fps / scene.render.fps_base
    keep_actions = set(bpy.data.actions)
    src_objs = import_file(a.anim)        # 注意：FBX 导入器会把场景帧率改成 FBX 的帧率
    src_fps = scene.render.fps / scene.render.fps_base
    src = main_armature(src_objs)
    imported_actions = [x for x in bpy.data.actions if x not in keep_actions]
    new_actions = [x for x in imported_actions if x.name.startswith(a.clip)] if a.clip else imported_actions
    if not new_actions: fail(f'来源文件没有可用动画（--clip={a.clip}）')
    action = max(new_actions, key=lambda x: x.frame_range[1] - x.frame_range[0])
    src.animation_data_create()
    src.animation_data.action = action
    if action.slots and not src.animation_data.action_slot:
        src.animation_data.action_slot = action.slots[0]
    f0, f1 = int(math.floor(action.frame_range[0])), int(math.ceil(action.frame_range[1]))

    src_bones = {strip_name(b.name): b for b in src.pose.bones}
    matched = [b for b in tgt.pose.bones if strip_name(b.name) in src_bones]
    if len(matched) < len(tgt.pose.bones) * 0.5:
        fail(f'骨骼名匹配太少（{len(matched)}/{len(tgt.pose.bones)}），不是同一套骨架')

    # 重定向的前提是两边的静止姿态一致。这里比较每根骨骼在世界空间里的朝向。
    worst, worst_name = 0.0, ''
    for tb in matched:
        sb = src_bones[strip_name(tb.name)]
        # 用“到同名子骨骼的方向”比较。骨骼自身的轴向在不同导入器下本来就不同，不能拿来比。
        sc = {strip_name(c.name): c for c in sb.bone.children}
        pair = next(((c, sc[strip_name(c.name)]) for c in tb.bone.children if strip_name(c.name) in sc), None)
        if not pair: continue
        vt = (tgt.matrix_world.to_3x3() @ (pair[0].head_local - tb.bone.head_local)).normalized()
        vs = (src.matrix_world.to_3x3() @ (pair[1].head_local - sb.bone.head_local)).normalized()
        d = math.degrees(vt.angle(vs, 0.0))
        if d > worst: worst, worst_name = d, tb.name
    if worst > 10:
        msg = f'两边静止姿态不一致：{worst_name} 相差 {worst:.1f}°。常见原因是 Mixamo 选了 Without Skin，请改下载 With Skin'
        if not a.force: fail(msg + '（确认没问题可加 --force）')
        warn(msg)

    roots = [b for b in matched if not b.parent or b.parent not in matched]
    root = max(roots, key=lambda b: len(b.children_recursive))
    sroot = src_bones[strip_name(root.name)]
    h_t = (tgt.matrix_world @ root.bone.head_local).length
    h_s = (src.matrix_world @ sroot.bone.head_local).length
    ratio = h_t / h_s if h_s > 1e-6 else 1.0

    # 父骨骼在前的顺序，按层级累积世界矩阵
    order, seen = [], set()
    def visit(b):
        if b in seen: return
        if b.parent: visit(b.parent)
        seen.add(b); order.append(b)
    for b in tgt.pose.bones: visit(b)

    tgt.animation_data_create()
    prev_action, prev_slot = tgt.animation_data.action, tgt.animation_data.action_slot
    tgt.animation_data.action = None
    for b in order:
        b.rotation_mode = 'QUATERNION'
        b.location = (0, 0, 0); b.rotation_quaternion = (1, 0, 0, 0); b.scale = (1, 1, 1)

    prev_q = {}
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        out_f = (f - f0) * dst_fps / src_fps
        world = {}
        for b in order:
            rest_rel = (b.parent.bone.matrix_local.inverted() @ b.bone.matrix_local) if b.parent else b.bone.matrix_local
            base_m = (world[b.parent] if b.parent else tgt.matrix_world) @ rest_rel
            sb = src_bones.get(strip_name(b.name))
            loc = Vector((0, 0, 0)); q = Quaternion()
            if sb is not None:
                s_pose = src.matrix_world @ sb.matrix
                s_rest = src.matrix_world @ sb.bone.matrix_local
                delta = world_rot(s_pose) @ world_rot(s_rest).inverted()
                want = delta @ world_rot(tgt.matrix_world @ b.bone.matrix_local)
                q = world_rot(base_m).inverted() @ want
                q.normalize()
                if b in prev_q: q.make_compatible(prev_q[b])
                prev_q[b] = q.copy()
                if b == root:
                    t_rest_head = (tgt.matrix_world @ b.bone.matrix_local).translation
                    want_head = t_rest_head + (s_pose.translation - s_rest.translation) * ratio
                    loc = base_m.inverted() @ want_head
                b.location = loc
                b.rotation_quaternion = q
                b.keyframe_insert('rotation_quaternion', frame=out_f, group=b.name)
                if b == root: b.keyframe_insert('location', frame=out_f, group=b.name)
            world[b] = base_m @ Matrix.Translation(loc) @ q.to_matrix().to_4x4()

    new = tgt.animation_data.action
    new.name = a.name
    new.use_fake_user = True
    track = tgt.animation_data.nla_tracks.new()
    track.name = a.name
    track.strips.new(a.name, 0, new)
    tgt.animation_data.action = prev_action
    if prev_action is not None and prev_slot is not None: tgt.animation_data.action_slot = prev_slot

    # 删掉来源文件带进来的东西，不让它们进入输出
    # （--clip 没选中的来源动画也要删，否则会被一起导出）
    for x in imported_actions: bpy.data.actions.remove(x)
    new.name = a.name   # 来源的同名动画删掉后再改一次，去掉 Blender 加的 .001 后缀
    for o in src_objs: bpy.data.objects.remove(o, do_unlink=True)
    scene.render.fps, scene.render.fps_base = round(dst_fps), 1.0
    dur = (f1 - f0) / src_fps
    result(f'动画 {a.name}：{f1 - f0 + 1} 帧，{dur:.2f}s（来源 {src_fps:g}fps），匹配骨骼 {len(matched)}/{len(tgt.pose.bones)}，根骨骼缩放 {ratio:.4f}')
    export_glb(a.output)


def rename_bones(a):
    arm = main_armature(load_base(a.model))
    if a.map: mapping = json.loads(a.map)
    elif a.strip_prefix: mapping = {b.name: b.name[len(a.strip_prefix):] for b in arm.data.bones if b.name.startswith(a.strip_prefix)}
    else: fail('需要 --map 或 --strip-prefix')
    unknown = [k for k in mapping if k not in arm.data.bones]
    if unknown: fail(f'找不到骨骼：{unknown[:5]}')
    for old, new in mapping.items(): arm.data.bones[old].name = new
    result(f'重命名 {len(mapping)} 根骨骼')
    export_glb(a.output)


def tri_count(meshes):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)


def decimate(a):
    objs = load_base(a.model)
    meshes = [o for o in objs if o.type == 'MESH']
    before = tri_count(meshes)
    for o in meshes:
        if o.data.shape_keys:
            warn(f'{o.name} 有形态键，跳过'); continue
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = a.ratio
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier=m.name)
    result(f'三角面 {before} → {tri_count(meshes)}（骨骼权重自动保留，关节处变形要看预览确认）')
    export_glb(a.output)


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
p = argparse.ArgumentParser(prog='rig.sh')
sub = p.add_subparsers(dest='cmd', required=True)
s = sub.add_parser('add-anim'); s.add_argument('model'); s.add_argument('anim'); s.add_argument('--name', required=True); s.add_argument('--clip'); s.add_argument('--force', action='store_true'); s.add_argument('-o', '--output', required=True); s.set_defaults(fn=add_anim)
s = sub.add_parser('rename-bones'); s.add_argument('model'); s.add_argument('--map'); s.add_argument('--strip-prefix'); s.add_argument('-o', '--output', required=True); s.set_defaults(fn=rename_bones)
s = sub.add_parser('decimate'); s.add_argument('model'); s.add_argument('--ratio', type=float, required=True); s.add_argument('-o', '--output', required=True); s.set_defaults(fn=decimate)
args = p.parse_args(argv)
args.fn(args)
