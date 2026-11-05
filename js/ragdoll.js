// ============================================================
// 布娃娃：NPC 死亡时的物理身体
//
// 用 Verlet 积分：身体是一组质点（关节），质点之间用长度约束连起来。
// 不存速度，"这一帧的位置 - 上一帧的位置"就是速度，所以约束和碰撞直接挪位置就行，
// 不会炸开，也不需要物理引擎。每帧结束后再把质点的位置换算回骨骼旋转。
//
// 约束分两种：
//   link   长度固定（骨头本身）
//   range  长度在一个范围内（关节活动范围：膝盖不能折到底、脖子不能转一圈）
//
// "死法不一样"靠下面几点，都在 Soldier.applyHit 里：
//   head   爆头：全身一起被掀飞，头最快，脚离地
//   body   打身体：随机三种（踉跄后仰 / 膝盖一软跪下去 / 拧着身子倒）。先靠腿撑一下再倒
//   leg    打腿：被打的腿先软，身体往那边歪
//   blast  爆炸：朝爆心反方向整个人抛出去
// 跑动中被打死时还会带上原来的速度，所以会往前扑。
// ============================================================
Game.Ragdoll = (function () {
  const STEP = 1 / 60;
  const ITERATIONS = 8;
  const MAX_SPEED = 13;     // 单个质点的速度上限，防止穿墙
  const cfg = () => Game.Config.ragdoll;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (r) => rand(r[0], r[1]);

  // ---------- 通用解算器 ----------
  class Solver {
    constructor(colliders) {
      this.points = [];
      this.sticks = [];
      this.colliders = colliders;
      this.hinges = [];      // 每次迭代都调用的额外约束
    }

    point(pos, radius, friction = 0.4, weight = 1) {
      const p = { p: pos.clone(), o: pos.clone(), r: radius, f: friction, w: weight, touch: null };
      this.points.push(p);
      return p;
    }

    range(a, b, min, max) {
      const s = { a, b, min, max, on: true };
      this.sticks.push(s);
      return s;
    }

    link(a, b) {
      const d = a.p.distanceTo(b.p);
      return this.range(a, b, d, d);
    }

    // 关节活动范围：相对当前距离的比例
    span(a, b, minF, maxF) {
      const d = a.p.distanceTo(b.p);
      return this.range(a, b, d * minF, d * maxF);
    }

    setVelocity(p, v) {
      p.o.copy(p.p).addScaledVector(v, -STEP);
    }

    step() {
      const g = cfg().gravity * STEP * STEP;
      const maxMove = MAX_SPEED * STEP;
      for (const q of this.points) {
        if (q.w === 0) { q.o.copy(q.p); continue; }
        let vx = (q.p.x - q.o.x) * 0.998, vy = (q.p.y - q.o.y) * 0.998 - g, vz = (q.p.z - q.o.z) * 0.998;
        const m = Math.hypot(vx, vy, vz);
        if (m > maxMove) { const s = maxMove / m; vx *= s; vy *= s; vz *= s; }
        q.o.copy(q.p);
        q.p.x += vx; q.p.y += vy; q.p.z += vz;
        q.touch = null;
      }
      for (let i = 0; i < ITERATIONS; i++) {
        for (const s of this.sticks) if (s.on) this.solve(s);
        for (const h of this.hinges) h();
        this.collide();
      }
      // 摩擦每步只算一次：接触面切向的速度打折
      for (const q of this.points) {
        if (!q.touch || q.w === 0) continue;
        for (const a of ['x', 'y', 'z']) if (a !== q.touch) q.o[a] += (q.p[a] - q.o[a]) * q.f;
      }
    }

    solve(s) {
      const a = s.a, b = s.b;
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z;
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      let target;
      if (d < s.min) target = s.min;
      else if (d > s.max) target = s.max;
      else return;
      const total = a.w + b.w;
      if (total === 0) return;
      const c = (d - target) / d / total;
      a.p.x += dx * c * a.w; a.p.y += dy * c * a.w; a.p.z += dz * c * a.w;
      b.p.x -= dx * c * b.w; b.p.y -= dy * c * b.w; b.p.z -= dz * c * b.w;
    }

    // 质点是小球，碰撞盒是 AABB：陷进去了就从最近的面推出去
    collide() {
      for (const q of this.points) {
        if (q.w === 0) continue;
        const p = q.p, r = q.r;
        for (const c of this.colliders) {
          if (p.x <= c.min.x - r || p.x >= c.max.x + r ||
              p.y <= c.min.y - r || p.y >= c.max.y + r ||
              p.z <= c.min.z - r || p.z >= c.max.z + r) continue;
          const dx0 = p.x - (c.min.x - r), dx1 = (c.max.x + r) - p.x;
          const dy0 = p.y - (c.min.y - r), dy1 = (c.max.y + r) - p.y;
          const dz0 = p.z - (c.min.z - r), dz1 = (c.max.z + r) - p.z;
          const m = Math.min(dx0, dx1, dy0, dy1, dz0, dz1);
          if (m === dy1) { p.y = c.max.y + r; q.touch = 'y'; }
          else if (m === dy0) { p.y = c.min.y - r; q.touch = 'y'; }
          else if (m === dx0) { p.x = c.min.x - r; q.touch = 'x'; }
          else if (m === dx1) { p.x = c.max.x + r; q.touch = 'x'; }
          else if (m === dz0) { p.z = c.min.z - r; q.touch = 'z'; }
          else { p.z = c.max.z + r; q.touch = 'z'; }
        }
      }
    }
  }

  // ---------- 临时变量 ----------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _dq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _iq = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  // 由"朝上"和"朝右"两个方向确定一个朝向（躯干和头用，能保留扭转）
  function frameQuat(up, side, out) {
    _a.copy(up).normalize();
    _b.copy(side).addScaledVector(_a, -side.dot(_a)).normalize();
    _c.crossVectors(_b, _a);
    _m.makeBasis(_b, _a, _c);
    return out.setFromRotationMatrix(_m);
  }

  // ---------- Mixamo 骨架的士兵 ----------
  // find(name) 按骨骼名（不带前缀）找骨头；rifle 是 NPC 手上那把枪，死后脱手单独掉落
  class Soldier {
    constructor(root, find, rifle, hit) {
      this.root = root;
      this.rifle = rifle;
      root.updateMatrixWorld(true);

      // 只保留尸体附近的碰撞盒，每个质点不用和全图比较
      const near = new THREE.Box3().setFromCenterAndSize(root.position.clone().setY(root.position.y + 1), new THREE.Vector3(14, 12, 14));
      const colliders = (hit.colliders || []).filter((c) => near.intersectsBox(c));
      this.solver = new Solver(colliders);
      this.bone = {};
      for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder',
        'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
        'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']) {
        this.bone[n] = find(n);
      }
      this.ok = Object.values(this.bone).every(Boolean);
      if (!this.ok) return;

      // 记下死亡瞬间每根骨头的世界旋转。之后每帧的旋转 = 变化量 × 这个初始值
      this.q0 = {};
      for (const [n, b] of Object.entries(this.bone)) this.q0[n] = b.getWorldQuaternion(new THREE.Quaternion());
      this.baseQ = this.bone.Hips.parent.getWorldQuaternion(new THREE.Quaternion());

      this.buildBody();
      this.buildRifle();
      // 贴墙死的时候枪和手可能已经在墙里了：先推出来再给速度，否则这段位移会变成一个巨大的速度
      this.solver.collide();
      this.applyHit(hit);

      this.acc = 0;
      this.time = 0;
      this.still = 0;
      this.sleeping = false;
    }

    buildBody() {
      const S = this.solver, B = this.bone;
      const at = (n) => B[n].getWorldPosition(new THREE.Vector3());
      const headTop = at('Head').add(UP.clone().applyQuaternion(this.q0.Head).multiplyScalar(0.2));
      const P = this.P = {
        pelvis: S.point(at('Hips'), 0.13, 0.45), chest: S.point(at('Spine2'), 0.14, 0.45),
        neck: S.point(at('Neck'), 0.07, 0.4), head: S.point(headTop, 0.1, 0.35, 0.8),
        lSh: S.point(at('LeftArm'), 0.06, 0.4), lEl: S.point(at('LeftForeArm'), 0.045, 0.4), lHa: S.point(at('LeftHand'), 0.045, 0.45, 0.7),
        rSh: S.point(at('RightArm'), 0.06, 0.4), rEl: S.point(at('RightForeArm'), 0.045, 0.4), rHa: S.point(at('RightHand'), 0.045, 0.45, 0.7),
        lHip: S.point(at('LeftUpLeg'), 0.09, 0.45), lKn: S.point(at('LeftLeg'), 0.06, 0.5), lAn: S.point(at('LeftFoot'), 0.05, 0.6), lTo: S.point(at('LeftToeBase'), 0.035, 0.7),
        rHip: S.point(at('RightUpLeg'), 0.09, 0.45), rKn: S.point(at('RightLeg'), 0.06, 0.5), rAn: S.point(at('RightFoot'), 0.05, 0.6), rTo: S.point(at('RightToeBase'), 0.035, 0.7),
      };

      // 骨盆三角、肩膀三角
      S.link(P.pelvis, P.lHip); S.link(P.pelvis, P.rHip); S.link(P.lHip, P.rHip);
      S.link(P.chest, P.lSh); S.link(P.chest, P.rSh); S.link(P.lSh, P.rSh);
      S.link(P.chest, P.neck); S.link(P.neck, P.lSh); S.link(P.neck, P.rSh);
      // 腰：能弯能扭，但有限度
      S.span(P.pelvis, P.chest, 0.8, 1.03);
      S.span(P.pelvis, P.neck, 0.78, 1.03);
      for (const [h, s] of [[P.lHip, P.lSh], [P.rHip, P.rSh], [P.lHip, P.rSh], [P.rHip, P.lSh]]) S.span(h, s, 0.72, 1.08);
      // 头
      S.link(P.neck, P.head);
      S.span(P.head, P.chest, 0.78, 1.08);
      S.span(P.head, P.lSh, 0.72, 1.2);
      S.span(P.head, P.rSh, 0.72, 1.2);

      // 四肢
      const legLen = 0.9;
      const hipGap = P.lHip.p.distanceTo(P.rHip.p);
      for (const [hip, kn, an, to] of [[P.lHip, P.lKn, P.lAn, P.lTo], [P.rHip, P.rKn, P.rAn, P.rTo]]) {
        S.link(hip, kn); S.link(kn, an); S.link(an, to);
        const len = hip.p.distanceTo(kn.p) + kn.p.distanceTo(an.p);
        S.range(hip, an, len * 0.42, len);       // 膝盖不能折到底
        const kt = kn.p.distanceTo(to.p);
        S.range(kn, to, kt * 0.82, kt * 1.04);   // 脚踝
        S.range(P.chest, kn, 0.3, 2);            // 大腿不能穿进胸口
      }
      S.range(P.lKn, P.rKn, hipGap, legLen);     // 不能劈叉，也不能并到一起
      for (const [sh, el, ha] of [[P.lSh, P.lEl, P.lHa], [P.rSh, P.rEl, P.rHa]]) {
        S.link(sh, el); S.link(el, ha);
        S.range(sh, ha, (sh.p.distanceTo(el.p) + el.p.distanceTo(ha.p)) * 0.35, 2);
      }

      // 膝盖只能朝前弯：解算器不懂方向，这里单独修正
      const f = new THREE.Vector3(), u = new THREE.Vector3(), o = new THREE.Vector3(), r = new THREE.Vector3(), up = new THREE.Vector3();
      for (const [hip, kn, an] of [[P.lHip, P.lKn, P.lAn], [P.rHip, P.rKn, P.rAn]]) {
        S.hinges.push(() => {
          r.subVectors(P.lHip.p, P.rHip.p).negate();     // 左 → 右
          up.subVectors(P.chest.p, P.pelvis.p);
          f.crossVectors(up, r).normalize();             // 身体正前方
          u.subVectors(an.p, hip.p).normalize();
          o.subVectors(kn.p, hip.p);
          o.addScaledVector(u, -o.dot(u));
          const bend = o.dot(f);
          if (bend < 0.01) kn.p.addScaledVector(f, (0.01 - bend) * 0.4);
        });
      }

      // 腿撑一下（hold）：脚钉在地上、腿长固定，时间到了再松开
      this.legs = [
        { an: P.lAn, to: P.lTo, kn: P.lKn, stiff: S.span(P.lHip, P.lAn, 0.98, 1.02), until: 0 },
        { an: P.rAn, to: P.rTo, kn: P.rKn, stiff: S.span(P.rHip, P.rAn, 0.98, 1.02), until: 0 },
      ];
      for (const l of this.legs) l.stiff.on = false;

      this.Q0 = {
        hips: frameQuat(_a.subVectors(P.chest.p, P.pelvis.p), _b.subVectors(P.rHip.p, P.lHip.p), new THREE.Quaternion()).clone(),
        chest: frameQuat(_a.subVectors(P.neck.p, P.chest.p), _b.subVectors(P.rSh.p, P.lSh.p), new THREE.Quaternion()).clone(),
        head: frameQuat(_a.subVectors(P.head.p, P.neck.p), _b.subVectors(P.rSh.p, P.lSh.p), new THREE.Quaternion()).clone(),
      };
      // 四肢：只记初始方向（from → to），旋转取最短弧
      this.limbs = [
        ['LeftArm', P.lSh, P.lEl], ['LeftForeArm', P.lEl, P.lHa], ['RightArm', P.rSh, P.rEl], ['RightForeArm', P.rEl, P.rHa],
        ['LeftUpLeg', P.lHip, P.lKn], ['LeftLeg', P.lKn, P.lAn], ['LeftFoot', P.lAn, P.lTo],
        ['RightUpLeg', P.rHip, P.rKn], ['RightLeg', P.rKn, P.rAn], ['RightFoot', P.rAn, P.rTo],
      ].map(([name, a, b]) => ({ name, a, b, dir0: b.p.clone().sub(a.p).normalize() }));
    }

    // 枪：两个质点连一根棍，脱手后自己掉在地上
    buildRifle() {
      const g = this.rifle.group;
      this.rifleQ0 = g.getWorldQuaternion(new THREE.Quaternion());
      const stock = this.solver.point(g.localToWorld(new THREE.Vector3(0, 0, 0.3)), 0.03, 0.5, 1);
      const muzzle = this.solver.point(g.localToWorld(new THREE.Vector3(0, 0, -0.55)), 0.03, 0.5, 1);
      this.solver.link(stock, muzzle);
      this.gunPts = { stock, muzzle, dir0: muzzle.p.clone().sub(stock.p).normalize() };
    }

    applyHit(hit) {
      const c = cfg();
      const P = this.P, S = this.solver;
      const y0 = this.root.position.y;
      const f = hit.force === undefined ? 1 : hit.force;
      const dir = (hit.dir ? hit.dir.clone() : new THREE.Vector3(0, 0, 1));
      dir.y = 0;
      if (dir.lengthSq() < 1e-4) dir.set(rand(-1, 1), 0, rand(-1, 1));
      dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const carry = hit.vel ? new THREE.Vector3(hit.vel.x, 0, hit.vel.z).multiplyScalar(0.8) : new THREE.Vector3();
      const hitPoint = hit.point || P.chest.p;

      const kind = hit.explosion ? 'blast' : hit.part === 'head' ? 'head' : hit.part === 'leg' ? 'leg' : 'body';
      this.kind = kind;
      const v = new THREE.Vector3();
      const setAll = (fn) => {
        for (const q of S.points) {
          const h = THREE.MathUtils.clamp((q.p.y - y0) / 1.7, 0, 1.1);
          fn(q, h);
          v.add(carry);
          S.setVelocity(q, v);
        }
      };

      if (kind === 'head') {
        // 爆头：头被猛地打出去，身体跟着腾空。越靠上速度越大，人向后翻
        const push = pick(c.headPush) * f, lift = pick(c.headLift) * f, lateral = rand(-0.9, 0.9);
        setAll((q, h) => {
          v.copy(dir).multiplyScalar(push * (0.4 + 0.85 * h));
          v.addScaledVector(side, lateral * h);
          v.y = lift * (0.6 + 0.55 * h);
        });
        S.setVelocity(P.head, v.copy(dir).multiplyScalar(push + 3.5 * f).addScaledVector(UP, lift + 1.2).add(carry));
      } else if (kind === 'blast') {
        const push = pick(c.blastPush) * f, lift = pick(c.blastLift) * f;
        setAll((q) => {
          v.copy(dir).multiplyScalar(push * rand(0.85, 1.15));
          v.addScaledVector(side, rand(-1.2, 1.2));
          v.y = lift * rand(0.8, 1.2);
        });
      } else if (kind === 'leg') {
        // 打腿：被打的腿立刻软掉，另一条腿撑一小下，身体往伤腿一侧栽
        const lLeg = hitPoint.distanceToSquared(P.lKn.p) < hitPoint.distanceToSquared(P.rKn.p);
        const hurt = lLeg ? this.legs[0] : this.legs[1], good = lLeg ? this.legs[1] : this.legs[0];
        this.hold(good, rand(0.15, 0.32));
        const toHurt = _a.subVectors(hurt.kn.p, good.kn.p).setY(0).normalize().clone();
        const push = pick(c.bodyPush) * f * 0.7;
        setAll((q, h) => {
          v.copy(dir).multiplyScalar(push * h);
          v.addScaledVector(toHurt, 1.3 * h);
          v.y = 0;
        });
        S.setVelocity(hurt.kn, v.copy(dir).multiplyScalar(1.6 * f).add(carry));
      } else {
        // 打身体：三种死法随机选一种
        const style = hit.style || ['stagger', 'buckle', 'twist'][Math.floor(Math.random() * 3)];
        this.style = style;
        const push = pick(c.bodyPush) * f;
        if (style === 'stagger') {
          // 被打得往后踉跄：腿撑住，上半身先仰过去，再整个人倒
          this.hold(this.legs[0], rand(0.2, 0.34));
          this.hold(this.legs[1], rand(0.2, 0.34));
          setAll((q, h) => { v.copy(dir).multiplyScalar(push * 1.25 * h * h); v.y = 0; });
        } else if (style === 'buckle') {
          // 膝盖一软：骨盆往下掉，膝盖往前顶，上半身往前栽，几乎原地瘫下去
          this.hold(this.legs[0], rand(0.03, 0.08));
          this.hold(this.legs[1], rand(0.03, 0.1));
          const fwd = _a.crossVectors(_b.subVectors(P.chest.p, P.pelvis.p), _c.subVectors(P.rHip.p, P.lHip.p)).setY(0).normalize().clone();
          setAll((q, h) => { v.copy(dir).multiplyScalar(push * 0.45 * h); v.addScaledVector(fwd, 0.5 * h); v.y = -0.9 * h; });
          for (const l of this.legs) S.setVelocity(l.kn, v.copy(fwd).multiplyScalar(1.5).add(carry));
          S.setVelocity(P.pelvis, v.copy(fwd).multiplyScalar(-0.3).setY(-1.2).add(carry));
        } else {
          // 拧着倒：肩膀被打得转起来，一条腿先软
          const spin = Math.random() < 0.5 ? 1 : -1;
          this.hold(this.legs[spin > 0 ? 0 : 1], rand(0.2, 0.32));
          this.hold(this.legs[spin > 0 ? 1 : 0], rand(0.03, 0.1));
          const center = P.chest.p;
          setAll((q, h) => {
            v.subVectors(q.p, center).setY(0);
            v.set(-v.z, 0, v.x).multiplyScalar(spin * 7 * h);
            v.addScaledVector(dir, push * 0.7 * h);
          });
        }
        // 中弹点附近额外挨一下，身体会被打得折一下
        for (const q of S.points) {
          const d2 = q.p.distanceToSquared(hitPoint);
          if (d2 < 0.2) {
            v.subVectors(q.p, q.o).divideScalar(STEP).addScaledVector(dir, 2.2 * f * Math.exp(-d2 / 0.08));
            S.setVelocity(q, v);
          }
        }
      }

      // 枪脱手：沿当前手的速度飞出去，再加一点随机
      for (const q of [this.gunPts.stock, this.gunPts.muzzle]) {
        v.subVectors(P.rHa.p, P.rHa.o).divideScalar(STEP).multiplyScalar(0.6);
        v.x += rand(-0.7, 0.7); v.y += rand(0.2, 1.4); v.z += rand(-0.7, 0.7);
        S.setVelocity(q, v);
      }

      // 找离中弹点最近的质点当"伤口"：血从这里流
      let best = P.chest, bestD = Infinity;
      const src = hit.part === 'head' ? P.head.p : hitPoint;
      for (const n of ['pelvis', 'chest', 'neck', 'head', 'lSh', 'rSh', 'lHip', 'rHip', 'lKn', 'rKn']) {
        const d = P[n].p.distanceToSquared(src);
        if (d < bestD) { bestD = d; best = P[n]; }
      }
      this.wound = best;
    }

    hold(leg, seconds) {
      leg.until = seconds;
      leg.stiff.on = true;
      leg.an.w = leg.to.w = 0;
    }

    update(dt) {
      if (!this.ok || this.sleeping) return;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 4) {
        this.acc -= STEP;
        steps++;
        this.time += STEP;
        for (const l of this.legs) {
          if (l.until > 0) {
            l.until -= STEP;
            if (l.until <= 0) { l.stiff.on = false; l.an.w = l.to.w = 1; }
          }
        }
        this.solver.step();
      }
      if (steps) this.pose();

      // 所有质点都几乎不动了就休眠，省 CPU
      let max = 0;
      for (const q of this.solver.points) max = Math.max(max, q.p.distanceToSquared(q.o));
      this.still = max < (0.05 * STEP) ** 2 * 4 ? this.still + dt : 0;
      if (this.time > 0.8 && this.still > 0.3) this.sleeping = true;
    }

    // 把质点位置换算回骨骼：每根骨头的世界旋转 = 变化量 × 初始旋转
    pose() {
      const P = this.P, q0 = this.q0, B = this.bone;
      const hipsD = new THREE.Quaternion(), chestD = new THREE.Quaternion(), headD = new THREE.Quaternion();
      const delta = (out, now, ref) => out.copy(now).multiply(_iq.copy(ref).invert());

      const up = new THREE.Vector3(), sd = new THREE.Vector3(), tmp = new THREE.Quaternion();
      frameQuat(up.subVectors(P.chest.p, P.pelvis.p), sd.subVectors(P.rHip.p, P.lHip.p), tmp);
      delta(hipsD, tmp, this.Q0.hips);
      frameQuat(up.subVectors(P.neck.p, P.chest.p), sd.subVectors(P.rSh.p, P.lSh.p), tmp);
      delta(chestD, tmp, this.Q0.chest);
      frameQuat(up.subVectors(P.head.p, P.neck.p), sd.subVectors(P.rSh.p, P.lSh.p), tmp);
      delta(headD, tmp, this.Q0.head);

      const W = {};   // 每根骨头这一帧的世界旋转
      const setWorld = (name, parentQ, world) => {
        W[name] = world;
        B[name].quaternion.copy(_pq.copy(parentQ).invert()).multiply(world);
      };
      const worldFrom = (d, n) => d.clone().multiply(q0[n]);

      setWorld('Hips', this.baseQ, worldFrom(hipsD, 'Hips'));
      setWorld('Spine', W.Hips, worldFrom(hipsD.clone().slerp(chestD, 0.33), 'Spine'));
      setWorld('Spine1', W.Spine, worldFrom(hipsD.clone().slerp(chestD, 0.66), 'Spine1'));
      setWorld('Spine2', W.Spine1, worldFrom(chestD, 'Spine2'));
      setWorld('Neck', W.Spine2, worldFrom(chestD.clone().slerp(headD, 0.5), 'Neck'));
      setWorld('Head', W.Neck, worldFrom(headD, 'Head'));
      setWorld('LeftShoulder', W.Spine2, worldFrom(chestD, 'LeftShoulder'));
      setWorld('RightShoulder', W.Spine2, worldFrom(chestD, 'RightShoulder'));

      const parents = {
        LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', RightArm: 'RightShoulder', RightForeArm: 'RightArm',
        LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg',
      };
      const limbD = {};
      for (const l of this.limbs) {
        _a.subVectors(l.b.p, l.a.p).normalize();
        const d = new THREE.Quaternion().setFromUnitVectors(l.dir0, _a);
        limbD[l.name] = d;
        setWorld(l.name, W[parents[l.name]], worldFrom(d, l.name));
      }
      setWorld('LeftHand', W.LeftForeArm, worldFrom(limbD.LeftForeArm, 'LeftHand'));
      setWorld('RightHand', W.RightForeArm, worldFrom(limbD.RightForeArm, 'RightHand'));
      setWorld('LeftToeBase', W.LeftFoot, worldFrom(limbD.LeftFoot, 'LeftToeBase'));
      setWorld('RightToeBase', W.RightFoot, worldFrom(limbD.RightFoot, 'RightToeBase'));

      // 根骨骼的位置跟骨盆走，其余骨头靠父子关系自然到位
      B.Hips.position.copy(P.pelvis.p);
      B.Hips.parent.worldToLocal(B.Hips.position);

      // 枪：挂在 root 下面，要把世界坐标换回局部
      const g = this.rifle.group, s = this.gunPts;
      _a.subVectors(s.muzzle.p, s.stock.p);
      g.position.copy(s.stock.p).addScaledVector(_a, 0.3 / 0.85);
      g.parent.worldToLocal(g.position);
      _a.normalize();
      _dq.setFromUnitVectors(s.dir0, _a);
      g.parent.getWorldQuaternion(_pq).invert();
      g.quaternion.copy(_pq).multiply(_dq).multiply(this.rifleQ0);
    }

    woundPos(out) { return out.copy(this.wound.p); }
    woundSpeed() { return this.wound.p.distanceTo(this.wound.o) / STEP; }
  }

  return { Solver, Soldier };
})();
