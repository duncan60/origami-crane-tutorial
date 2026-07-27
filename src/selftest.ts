import { embed, matricesAt, type Built, type Vec2 } from './fold'

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

const ccw = (poly: Vec2[]): Vec2[] => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return s > 0 ? poly : [...poly].reverse()
}

/** 用半平面裁剪求兩個凸多邊形的交集面積 */
const overlapArea = (A: Vec2[], B: Vec2[]): number => {
  let r = ccw(A)
  const b = ccw(B)
  for (let i = 0; i < b.length && r.length >= 3; i++) {
    const p0 = b[i]
    const p1 = b[(i + 1) % b.length]
    const side = (p: Vec2): number => (p1.x - p0.x) * (p.y - p0.y) - (p1.y - p0.y) * (p.x - p0.x)
    const out: Vec2[] = []
    for (let k = 0; k < r.length; k++) {
      const c = r[k]
      const d = r[(k + 1) % r.length]
      const sc = side(c)
      const sd = side(d)
      if (sc >= -1e-9) out.push(c)
      if ((sc > 1e-9 && sd < -1e-9) || (sc < -1e-9 && sd > 1e-9)) {
        const u = sc / (sc - sd)
        out.push({ x: c.x + u * (d.x - c.x), y: c.y + u * (d.y - c.y) })
      }
    }
    r = out
  }
  return r.length >= 3 ? area(r) : 0
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

  // 3. 同一層號的兩個面不能在投影上重疊——它們會拿到相同的厚度偏移而互相 z-fighting
  let overlaps = 0
  for (const snap of built.snapshots) {
    const byLayer = new Map<number, Vec2[][]>()
    for (const f of snap) {
      const g = byLayer.get(f.layer) ?? []
      g.push(f.poly)
      byLayer.set(f.layer, g)
    }
    for (const g of byLayer.values()) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) if (overlapArea(g[i], g[j]) > 1e-4) overlaps++
      }
    }
  }
  check(overlaps === 0, `同層無重疊（發現 ${overlaps} 對）`)

  // 4. 局部厚度就是該處實際壓著的紙層數，數值應該接近真實紙鶴的層數而非全域層號
  const maxDepth = Math.max(...built.faces.flatMap((f) => f.signedDepth.map(Math.abs)))
  check(maxDepth <= 20, `最厚處 ${maxDepth} 層（過大會讓厚的部位浮離而穿面）`)

  return `${failed === 0 ? '全部通過' : `${failed} 項未通過`}\n${lines.join('\n')}`
}
