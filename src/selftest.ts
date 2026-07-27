import { convexOverlapArea, embed, matricesAt, type Built, type Vec2 } from './fold'

/**
 * 摺紙模型的不變量檢查。在主控台呼叫 `__selftest()` 執行。
 *
 * 這些檢查是實際用來定位破圖問題的工具：破圖的根因是厚度偏移用全域層號計算，
 * 讓層號大的部位被推離基準面太遠而穿過其他紙面。留在這裡，同類問題才不會悄悄回來。
 */

const area = (poly: Vec2[]): number => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return Math.abs(s) / 2
}

export function selftest(built: Built, paperArea: number): string {
  const lines: string[] = []
  let failed = 0
  const check = (ok: boolean, label: string): void => {
    if (!ok) failed++
    lines.push(`${ok ? '✓' : '✗'} ${label}`)
  }

  // 1. 摺紙不會讓紙消失：每一步所有面的面積總和都應等於紙的面積
  const areas = built.snapshots.map((snap) => snap.reduce((a, f) => a + area(f.poly), 0))
  check(
    areas.every((a) => Math.abs(a - paperArea) < 1e-6),
    `各步驟面積守恆（應為 ${paperArea}，實得 ${areas.map((a) => a.toFixed(4)).join(' ')}）`,
  )

  // 2. 摺平狀態下，3D 位置必須等於攤平座標的嵌入，也就是整個模型落在 y = 0 平面
  //    （最後一步有展示用的立體姿態，所以不列入）
  const flatness: number[] = []
  for (let s = 0; s < built.nSteps - 1; s++) {
    const mats = matricesAt(built, s, 1)
    let worst = 0
    built.faces.forEach((f, i) => {
      for (const p of f.poly) worst = Math.max(worst, Math.abs(embed(p).applyMatrix4(mats[i]).y))
    })
    flatness.push(worst)
  }
  check(flatness.every((v) => v < 1e-4), `前 ${built.nSteps - 1} 步摺平（最大偏離 ${Math.max(...flatness).toExponential(1)}）`)

  // 3. 同一層號的兩個面絕不能在投影上重疊。
  //    厚度偏移是層號的單調函數，所以「重疊 ⇒ 層號不同」就等於
  //    「重疊 ⇒ 偏移量不同」，遮蔽順序必定正確也不會 z-fighting。
  //    這是整個渲染正確性的支點。
  const collisions: string[] = []
  built.snapshots.forEach((snap, si) => {
    let n = 0
    for (let i = 0; i < snap.length; i++) {
      for (let j = i + 1; j < snap.length; j++) {
        if (snap[i].layer !== snap[j].layer) continue
        if (convexOverlapArea(snap[i].poly, snap[j].poly) > 1e-5) n++
      }
    }
    if (n > 0) collisions.push(`步驟 ${si + 1} 有 ${n} 對`)
  })
  check(
    collisions.length === 0,
    `同層號的面互不重疊（${collisions.length === 0 ? '無衝突' : collisions.join('、')}）`,
  )

  // 4. 最上層離基準面的距離要夠小，否則頸尾會浮離身體而看起來像穿模
  const maxLayer = Math.max(...built.faces.flatMap((f) => f.signedLayer.map(Math.abs)))
  const lift = Math.sqrt(maxLayer)
  check(lift <= 7, `最上層抬升 ${lift.toFixed(1)} 個紙厚（共 ${maxLayer} 層，取平方根壓縮）`)

  return `${failed === 0 ? '全部通過' : `${failed} 項未通過`}\n${lines.join('\n')}`
}
