import type { Built, Vec2 } from './fold'

/**
 * 2D 摺紙圖解
 *
 * 這是真實摺紙書的呈現方式：畫出「這一步開始前」的攤平狀態，疊上這一步要摺的
 * 摺線（谷摺虛線、山摺點劃線）與方向箭頭。
 *
 * 引擎為每一步算出的攤平多邊形、摺線段、正反面號誌，剛好就是圖解需要的全部資料，
 * 所以這個模組只做投影與繪製，不含任何摺紙邏輯。
 *
 * 層數多、有包捲結構的作品在 3D 下呈現不好（見 README 的收錄標準），
 * 但在 2D 圖解裡完全沒有這個問題——因為圖解不需要表達厚度。
 */

const PAD = 26
const COLOR_VALLEY = '#2f86e6'
const COLOR_MOUNTAIN = '#e0456a'
const COLOR_ARROW = '#e8952f'
const COLOR_EDGE = '#211f1c'
const COLOR_CREASE = 'rgba(33,31,28,0.22)'

interface Projection {
  /** 攤平座標 → SVG 座標 */
  to: (p: Vec2) => { x: number; y: number }
  scale: number
}

/** 依步驟開始前的狀態決定投影，讓整個作品剛好填滿畫布 */
function projectionFor(polys: Vec2[][], w: number, h: number): Projection {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const poly of polys) {
    for (const p of poly) {
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y)
      y1 = Math.max(y1, p.y)
    }
  }
  const scale = Math.min((w - PAD * 2) / Math.max(x1 - x0, 1e-6), (h - PAD * 2) / Math.max(y1 - y0, 1e-6))
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return {
    scale,
    // 攤平座標的 +y 是「上」，SVG 的 +y 是「下」，所以 y 要反向
    to: (p) => ({ x: w / 2 + (p.x - cx) * scale, y: h / 2 - (p.y - cy) * scale }),
  }
}

/** 邊 a→b 是否落在摺痕線段 seg 上（共線且在範圍內） */
function onSegment(seg: [Vec2, Vec2], a: Vec2, b: Vec2): boolean {
  const sx = seg[1].x - seg[0].x
  const sy = seg[1].y - seg[0].y
  const len = Math.hypot(sx, sy)
  if (len < 1e-9) return false
  const ux = sx / len
  const uy = sy / len
  for (const p of [a, b]) {
    const dx = p.x - seg[0].x
    const dy = p.y - seg[0].y
    // 垂直距離要幾乎為零（共線），投影長度要落在線段範圍內
    if (Math.abs(dx * uy - dy * ux) > 0.02) return false
    const along = dx * ux + dy * uy
    if (along < -0.02 || along > len + 0.02) return false
  }
  return true
}

const path = (poly: Vec2[], pr: Projection): string =>
  poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${pr.to(p).x.toFixed(1)} ${pr.to(p).y.toFixed(1)}`).join(' ') + ' Z'

/** 圓弧箭頭：從 a 彎到 b，弧的鼓起方向垂直於 a→b */
function arrow(a: Vec2, b: Vec2, pr: Projection): string {
  const p = pr.to(a)
  const q = pr.to(b)
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.hypot(dx, dy)
  if (len < 6) return ''
  // 控制點推離弦的中點，形成摺紙圖解慣用的弧線
  const bow = Math.min(len * 0.42, 52)
  const mx = (p.x + q.x) / 2 - (dy / len) * bow
  const my = (p.y + q.y) / 2 + (dx / len) * bow
  // 箭頭方向取「控制點 → 終點」的切線
  const tx = q.x - mx
  const ty = q.y - my
  const tl = Math.hypot(tx, ty) || 1
  const ux = tx / tl
  const uy = ty / tl
  const head = 9
  const wing = 5
  const h1 = `${(q.x - ux * head - uy * wing).toFixed(1)} ${(q.y - uy * head + ux * wing).toFixed(1)}`
  const h2 = `${(q.x - ux * head + uy * wing).toFixed(1)} ${(q.y - uy * head - ux * wing).toFixed(1)}`
  return (
    `<path d="M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}"` +
    ` fill="none" stroke="${COLOR_ARROW}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M${q.x.toFixed(1)} ${q.y.toFixed(1)} L${h1} M${q.x.toFixed(1)} ${q.y.toFixed(1)} L${h2}"` +
    ` fill="none" stroke="${COLOR_ARROW}" stroke-width="2.4" stroke-linecap="round"/>`
  )
}

/**
 * 畫出某一步的圖解。
 *
 * 基底是「這一步開始前」的狀態（第一步就是整張紙），因為圖解要告訴使用者
 * 「現在手上這樣的紙，接下來要沿哪裡摺」。
 */
export function renderDiagram(
  built: Built,
  paper: Vec2[],
  step: number,
  colorHex: number,
  w: number,
  h: number,
): string {
  const before =
    step === 0
      ? [{ layer: 0, flip: 1, poly: paper, tags: paper.map(() => -1) }]
      : built.snapshots[step - 1]

  const pr = projectionFor(
    before.map((f) => f.poly),
    w,
    h,
  )
  const color = `#${colorHex.toString(16).padStart(6, '0')}`
  const out: string[] = []

  // 紙面：依層序由低到高疊畫（畫家演算法），上層自然蓋住下層。
  // flip 為 -1 的面露出的是紙的另一色。此處不描邊，邊線另外依類型繪製。
  for (const f of [...before].sort((a, b) => a.layer - b.layer)) {
    out.push(`<path d="${path(f.poly, pr)}" fill="${f.flip < 0 ? color : '#f4eee2'}"/>`)
  }

  // 邊線分兩種：紙張原始邊緣（tag −1）用實線，已摺出的摺痕用細淡線。
  //
  // 引擎為了記帳會用「無限延伸的直線」切開所有面，因此有些邊帶著摺痕標記，
  // 實際上那個位置並沒有被摺過。過濾方式：只有落在該摺真實摺痕範圍內
  // （creaseFlat 線段）的邊才畫成摺痕，其餘一概不畫。
  for (const f of before) {
    for (let i = 0; i < f.poly.length; i++) {
      const a = f.poly[i]
      const b = f.poly[(i + 1) % f.poly.length]
      const tag = f.tags[i]
      const pa = pr.to(a)
      const pb = pr.to(b)
      const line = (stroke: string, width: number): string =>
        `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"` +
        ` stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`
      if (tag < 0) {
        out.push(line(COLOR_EDGE, 1.4))
        continue
      }
      const fold = built.folds[tag]
      if (!fold || fold.step >= step || !fold.creaseFlat) continue
      if (onSegment(fold.creaseFlat, a, b)) out.push(line(COLOR_CREASE, 1))
    }
  }

  // 這一步的摺線與方向箭頭
  for (const fold of built.folds) {
    if (fold.step !== step || fold.kind !== 'fold' || !fold.showCrease || !fold.creaseFlat) continue
    const a = pr.to(fold.creaseFlat[0])
    const b = pr.to(fold.creaseFlat[1])
    const mountain = fold.creaseType === 'mountain'
    out.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"` +
        ` stroke="${mountain ? COLOR_MOUNTAIN : COLOR_VALLEY}" stroke-width="2.2" stroke-linecap="round"` +
        ` stroke-dasharray="${mountain ? '11 4 2 4' : '9 5'}"/>`,
    )
    if (fold.arrowFlat) out.push(arrow(fold.arrowFlat[0], fold.arrowFlat[1], pr))
  }

  return (
    `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">` +
    out.join('') +
    '</svg>'
  )
}
