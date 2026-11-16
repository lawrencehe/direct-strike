// ============================================================
// NPC 寻路（#92）：把地图划成格子，用 A* 算路径
//
// 为什么要它：NPC 原来朝目标直线走，两个箱子夹出的凹角（比如卡车和集装箱拼成的 L 形）挡在中间时，
//   直线方向两边都是墙，往哪边"绕一下"都出不去，就卡死在角里。
//
// 格子：
//   每 nav.cell 米一个格点，格点上能不能站人按真实碰撞盒算（和 physics.js、tools/map-check.mjs 同一套规则）：
//   NPC 的脚放在这里，比脚底高不超过 stepHeight 的东西能直接踩上去（台阶、平台的楼梯），
//   再往上一个身高之内不能有东西。半径比 NPC 实际的大 nav.margin，路线离墙留一点余量，不贴着墙蹭。
//   同一个格点可以有几层（地面、平台顶上），所以一个"节点"是 (列, 行, 高度)。
//   只保留从地面能走到的节点（箱子顶上上不去的不算）。走下平台边缘是允许的（掉下去），爬上去只能走台阶。
//
// A*（A-star）：从起点往外一圈圈试，每次先展开"已走的路 + 到终点的直线估计"最小的那个格子，
//   碰到终点就停，沿记下的来路倒推回去就是最短路。估计值不会高估真实距离，所以找到的一定是最短的；
//   又因为优先往终点方向试，比漫无目的地往外扩快得多。
//
// 拉直：A* 的路是一格一格的锯齿，先去掉同方向的中间点，再从当前点往后找"直线走得过去"的最远的点，
//   最后剩下几个拐角，NPC 一个拐角一个拐角地走。
// ============================================================
Game.Nav = (function () {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // 二叉堆（A* 的待展开列表，按 f 值从小到大取）
  class Heap {
    constructor() { this.ids = []; this.keys = []; }
    get size() { return this.ids.length; }
    push(id, key) {
      const ids = this.ids, keys = this.keys;
      let i = ids.length;
      ids.push(id); keys.push(key);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p] <= key) break;
        ids[i] = ids[p]; keys[i] = keys[p]; i = p;
      }
      ids[i] = id; keys[i] = key;
    }
    pop() {
      const ids = this.ids, keys = this.keys;
      const top = ids[0], lastId = ids.pop(), lastKey = keys.pop();
      const n = ids.length;
      if (n) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && keys[c + 1] < keys[c]) c++;
          if (keys[c] >= lastKey) break;
          ids[i] = ids[c]; keys[i] = keys[c]; i = c;
        }
        ids[i] = lastId; keys[i] = lastKey;
      }
      return top;
    }
  }

  class Grid {
    // colliders：world.colliders（Box3 数组）；opts：{ cell, radius, height, step }
    constructor(colliders, { cell, radius, height, step }) {
      const t0 = performance.now();
      Object.assign(this, { cell, radius, height, step });
      // 地面本身（顶面在 0）不算障碍；范围取其余碰撞盒的外包，限制在 ±150 米内
      this.solid = colliders.filter((c) => c.max.y > 0.001).filter((c) => c.max.x - c.min.x < 300 && c.max.z - c.min.z < 300);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const c of this.solid) {
        x0 = Math.min(x0, c.min.x); x1 = Math.max(x1, c.max.x);
        z0 = Math.min(z0, c.min.z); z1 = Math.max(z1, c.max.z);
      }
      if (!this.solid.length) { x0 = z0 = -20; x1 = z1 = 20; }
      x0 = Math.max(x0, -150); z0 = Math.max(z0, -150); x1 = Math.min(x1, 150); z1 = Math.min(z1, 150);
      this.x0 = x0; this.z0 = z0;
      this.nx = Math.ceil((x1 - x0) / cell) + 1;
      this.nz = Math.ceil((z1 - z0) / cell) + 1;

      // 每个格点附近可能碰到的碰撞盒（外扩半径 + 一格），查询时只看这几个
      const reach = radius + cell;
      this.near = new Array(this.nx * this.nz);
      for (let k = 0; k < this.near.length; k++) this.near[k] = null;
      this.solid.forEach((c, idx) => {
        const i0 = Math.max(0, Math.floor((c.min.x - reach - x0) / cell)), i1 = Math.min(this.nx - 1, Math.ceil((c.max.x + reach - x0) / cell));
        const j0 = Math.max(0, Math.floor((c.min.z - reach - z0) / cell)), j1 = Math.min(this.nz - 1, Math.ceil((c.max.z + reach - z0) / cell));
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const k = j * this.nx + i;
          (this.near[k] || (this.near[k] = [])).push(idx);
        }
      });

      // 节点：(列, 行, 高度)。layers[列行] = 这一格的节点编号列表
      this.ni = []; this.nj = []; this.nh = [];
      this.layers = new Map();
      this.edges = [];   // edges[id] = [邻居 id, 代价, 邻居 id, 代价, ...]
      const stack = [];
      const visit = (i, j, y) => {
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
        const h = this.standAt(x0 + i * cell, z0 + j * cell, y);
        if (h === null) return -1;
        let id = this.nodeAt(i, j, h);
        if (id < 0) {
          id = this.ni.length;
          this.ni.push(i); this.nj.push(j); this.nh.push(h);
          const k = j * this.nx + i;
          const l = this.layers.get(k);
          if (l) l.push(id); else this.layers.set(k, [id]);
          stack.push(id);
        }
        return id;
      };
      // 种子：所有站得住的地面格点（地图里可能有几块互不相通的区域，各自都要有）
      for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.nz; j++) visit(i, j, 0);
      while (stack.length) {
        const id = stack.pop();
        const i = this.ni[id], j = this.nj[id], h = this.nh[id];
        const out = [];
        const ok = [];
        for (let d = 0; d < 8; d++) {
          const [di, dj] = DIRS[d];
          // 斜着走：两个直角方向都要走得通，不切墙角
          if (d >= 4 && !(ok[di > 0 ? 0 : 1] && ok[dj > 0 ? 2 : 3])) continue;
          const nb = visit(i + di, j + dj, h);
          ok[d] = nb >= 0;
          if (nb >= 0) out.push(nb, cell * (d >= 4 ? Math.SQRT2 : 1));
        }
        this.edges[id] = out;
      }
      this.count = this.ni.length;
      this.g = new Float32Array(this.count);
      this.from = new Int32Array(this.count);
      this.stamp = new Uint32Array(this.count);   // 第几次搜索碰过这个节点，省得每次清空数组
      this.closed = new Uint32Array(this.count);
      this.search = 0;
      this.buildMs = performance.now() - t0;
    }

    // 从高度 y 走到 (x, z) 后脚踩在多高；站不下（撞墙、头顶有东西）返回 null。
    // 比脚底高 step 以内的顶面能踩上去，所以台阶和平台楼梯算得出来
    standAt(x, z, y, radius = this.radius) {
      const i = Math.round((x - this.x0) / this.cell), j = Math.round((z - this.z0) / this.cell);
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return null;
      const list = this.near[j * this.nx + i];
      if (!list) return 0;
      const S = this.solid;
      let top = 0;
      for (const k of list) {
        const b = S[k];
        if (x + radius > b.min.x && x - radius < b.max.x && z + radius > b.min.z && z - radius < b.max.z &&
            b.max.y <= y + this.step + 0.01 && b.max.y > top) top = b.max.y;
      }
      for (const k of list) {
        const b = S[k];
        if (x + radius > b.min.x && x - radius < b.max.x && z + radius > b.min.z && z - radius < b.max.z &&
            b.max.y > top + 0.01 && b.min.y < top + this.height) return null;
      }
      return top;
    }

    nodeAt(i, j, h) {
      const l = this.layers.get(j * this.nx + i);
      if (l) for (const id of l) if (Math.abs(this.nh[id] - h) < 0.05) return id;
      return -1;
    }

    // 离 (x, y, z) 最近的节点（一圈圈往外找，最远 maxDist 米）；高度差大的（另一层）算远一点
    nearest(x, y, z, maxDist = 2) {
      const ci = Math.round((x - this.x0) / this.cell), cj = Math.round((z - this.z0) / this.cell);
      const R = Math.ceil(maxDist / this.cell);
      let best = -1, bestD = Infinity;
      for (let r = 0; r <= R; r++) {
        for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;   // 只看这一圈
          const l = this.layers.get(j * this.nx + i);
          if (!l || i < 0 || i >= this.nx) continue;
          for (const id of l) {
            const dx = this.x0 + i * this.cell - x, dz = this.z0 + j * this.cell - z;
            const d = Math.hypot(dx, dz) + Math.abs(this.nh[id] - y) * 3;
            if (d < bestD) { bestD = d; best = id; }
          }
        }
        if (best >= 0 && bestD <= r * this.cell) break;   // 再往外的一圈不会更近了
      }
      return best;
    }

    // 从 a 直线走到 b 走不走得通（脚从 a.y 开始，沿途按台阶规则上下）
    walkable(ax, ay, az, bx, bz) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
      let y = ay;
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        const h = this.standAt(ax + (bx - ax) * t, az + (bz - az) * t, y);
        if (h === null) return false;
        y = h;
      }
      return true;
    }

    // A*：从 from 到 to 的路径（拉直后的拐角点数组 [{x, y, z}, ...]，最后一个是终点）。走不到返回 null。
    // 终点不在可走的格子上（贴着箱子、在墙里）时，改去 snap 米内最近的可走点
    findPath(from, to, snap = 3) {
      const s = this.nearest(from.x, from.y || 0, from.z, 2);
      const e = this.nearest(to.x, to.y || 0, to.z, snap);
      if (s < 0 || e < 0) return null;
      const { ni, nj, nh, edges, g, from: prev, stamp, closed, cell } = this;
      const id = ++this.search;
      const ei = ni[e], ej = nj[e];
      const H = (n) => {   // 八方向的直线估计（不会高估）
        const dx = Math.abs(ni[n] - ei), dz = Math.abs(nj[n] - ej);
        return cell * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz));
      };
      const open = new Heap();
      g[s] = 0; prev[s] = -1; stamp[s] = id;
      open.push(s, H(s));
      let found = false;
      while (open.size) {
        const n = open.pop();
        if (closed[n] === id) continue;
        closed[n] = id;
        if (n === e) { found = true; break; }
        const out = edges[n];
        for (let k = 0; k < out.length; k += 2) {
          const m = out[k];
          if (closed[m] === id) continue;
          const ng = g[n] + out[k + 1];
          if (stamp[m] !== id || ng < g[m]) {
            stamp[m] = id; g[m] = ng; prev[m] = n;
            open.push(m, ng + H(m));
          }
        }
      }
      if (!found) return null;

      // 倒推出格点路径，去掉同方向的中间点只留拐角
      const raw = [];
      for (let n = e; n >= 0; n = prev[n]) raw.push(n);
      raw.reverse();
      const pt = (n) => ({ x: this.x0 + ni[n] * cell, y: nh[n], z: this.z0 + nj[n] * cell });
      const corners = [raw[0]];
      for (let k = 1; k < raw.length - 1; k++) {
        const a = raw[k - 1], b = raw[k], c = raw[k + 1];
        if (ni[b] - ni[a] !== ni[c] - ni[b] || nj[b] - nj[a] !== nj[c] - nj[b] || nh[b] !== nh[a]) corners.push(b);
      }
      if (raw.length > 1) corners.push(raw[raw.length - 1]);

      // 拉直：从当前点往后找直线走得通的最远拐角
      const pts = corners.map(pt);
      const out = [];
      let a = { x: from.x, y: from.y || 0, z: from.z };
      let k = 0;
      while (k < pts.length) {
        let far = k;
        for (let m = pts.length - 1; m > k; m--) {
          if (this.walkable(a.x, a.y, a.z, pts[m].x, pts[m].z)) { far = m; break; }
        }
        out.push(pts[far]);
        a = pts[far];
        k = far + 1;
      }
      return out;
    }
  }

  return { Grid };
})();
