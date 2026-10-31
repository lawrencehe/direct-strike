// ============================================================
// 碰撞（玩家和 NPC 共用）
//
// 思路（AABB = 轴对齐包围盒）：
//   角色是一个竖着的长方体，所有墙和箱子也是长方体。
//   每帧把移动拆成 X、Z、Y 分别走，每走一步检查有没有撞进某个箱子，
//   撞进去了就把角色推回到箱子表面。分轴处理可以让角色贴着墙"滑"过去。
// ============================================================
Game.Physics = (function () {
  const box = new THREE.Box3();

  // 严格重叠判断：刚好贴着表面不算重叠
  // （否则站在箱子顶上时，左右走一步也会被当成"撞墙"）
  function overlaps(a, b) {
    const e = 1e-6;
    return a.min.x < b.max.x - e && a.max.x > b.min.x + e &&
           a.min.y < b.max.y - e && a.max.y > b.min.y + e &&
           a.min.z < b.max.z - e && a.max.z > b.min.z + e;
  }

  // 让脚底位于 pos、半宽 radius、高 height 的角色沿 axis 移动 delta。
  // lists 是若干个碰撞盒数组（比如 [墙和箱子, NPC 们]）。返回是否撞到了东西
  function moveAxis(pos, axis, delta, radius, height, lists) {
    if (delta === 0) return false;
    pos[axis] += delta;

    let hit = false;
    for (const list of lists) {
      for (const c of list) {
        box.min.set(pos.x - radius, pos.y, pos.z - radius);
        box.max.set(pos.x + radius, pos.y + height, pos.z + radius);
        if (!overlaps(box, c)) continue;
        hit = true;
        if (axis === 'y') {
          pos.y = delta > 0 ? c.min.y - height : c.max.y;
        } else {
          pos[axis] = delta > 0 ? c.min[axis] - radius : c.max[axis] + radius;
        }
      }
    }
    return hit;
  }

  return { overlaps, moveAxis };
})();
