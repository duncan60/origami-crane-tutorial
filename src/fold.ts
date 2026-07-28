import { Matrix4, Vector3 } from 'three'

/**
 * 摺紙引擎
 *
 * 紙張以「攤平座標系」中的多邊形集合表示。每一摺都是把選定的面沿一條摺線做鏡射
 * （這是摺平狀態的精確模型），而 3D 顯示則把同一個鏡射改成「繞摺線旋轉 0→180 度」，
 * 因此動畫全程每個面都保持剛體，紙不會被拉伸。
 *
 * 關鍵不變量：在完全摺平的狀態下，一個面的 3D 位置等於它攤平座標的直接嵌入
 * （攤平 (x, y) → 世界 (x, 0, y)）。摺線的 3D 旋轉軸因此可以從任一片移動面的
 * 變換矩陣推得——即使該摺是接在同一步驟中前一個子摺之後發生的。
 */

// ---------------------------------------------------------------- 2D 基礎

export interface Vec2 {
  x: number
  y: number
}

/** 平面等距變換：p ↦ (a·x + b·y + e, c·x + d·y + f) */
export interface Iso {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const ISO_ID: Iso = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
const EPS = 1e-9

export const v2 = (x: number, y: number): Vec2 => ({ x, y })

function sub(p: Vec2, q: Vec2): Vec2 {
  return v2(p.x - q.x, p.y - q.y)
}

function norm(p: Vec2): Vec2 {
  const l = Math.hypot(p.x, p.y)
  return v2(p.x / l, p.y / l)
}

/** D × (p − P)：p 相對於有向直線 (P, D) 的帶號距離 */
function sideOf(P: Vec2, D: Vec2, p: Vec2): number {
  return D.x * (p.y - P.y) - D.y * (p.x - P.x)
}

function applyIso(m: Iso, p: Vec2): Vec2 {
  return v2(m.a * p.x + m.b * p.y + m.e, m.c * p.x + m.d * p.y + m.f)
}

/** 回傳 m ∘ n（先套用 n，再套用 m） */
function composeIso(m: Iso, n: Iso): Iso {
  return {
    a: m.a * n.a + m.b * n.c,
    b: m.a * n.b + m.b * n.d,
    c: m.c * n.a + m.d * n.c,
    d: m.c * n.b + m.d * n.d,
    e: m.a * n.e + m.b * n.f + m.e,
    f: m.c * n.e + m.d * n.f + m.f,
  }
}

function isoDet(m: Iso): number {
  return m.a * m.d - m.b * m.c
}

function invertIso(m: Iso): Iso {
  const det = isoDet(m)
  const a = m.d / det
  const b = -m.b / det
  const c = -m.c / det
  const d = m.a / det
  return { a, b, c, d, e: -(a * m.e + b * m.f), f: -(c * m.e + d * m.f) }
}

/** 沿通過 P、方向 D 的直線做鏡射 */
function reflectionIso(P: Vec2, D: Vec2): Iso {
  const n = v2(-D.y, D.x)
  const k = 2 * (P.x * n.x + P.y * n.y)
  return {
    a: 1 - 2 * n.x * n.x,
    b: -2 * n.x * n.y,
    c: -2 * n.x * n.y,
    d: 1 - 2 * n.y * n.y,
    e: k * n.x,
    f: k * n.y,
  }
}

/** 繞原點逆時針旋轉 deg 度 */
function rotationIso(deg: number): Iso {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { a: c, b: -s, c: s, d: c, e: 0, f: 0 }
}

export function centroid(poly: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  return v2(x / poly.length, y / poly.length)
}

function area2(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return Math.abs(s)
}

// ---------------------------------------------------------------- 多邊形切割

interface TaggedPoly {
  poly: Vec2[]
  /** tags[i] 是「頂點 i → 頂點 i+1」這條邊的來源摺痕 id；-1 代表紙張原始邊緣 */
  tags: number[]
}

/**
 * 用無限延伸的直線 (P, D) 把凸多邊形切成兩半，新產生的切邊標記為 newTag。
 * 直線沒穿過多邊形時，其中一側回傳 null。
 */
function splitPoly(
  src: TaggedPoly,
  P: Vec2,
  D: Vec2,
  newTag: number,
): { pos: TaggedPoly | null; neg: TaggedPoly | null } {
  const { poly, tags } = src
  const n = poly.length
  const s = poly.map((p) => sideOf(P, D, p))
  if (!s.some((v) => v > EPS)) return { pos: null, neg: src }
  if (!s.some((v) => v < -EPS)) return { pos: src, neg: null }

  const pos: TaggedPoly = { poly: [], tags: [] }
  const neg: TaggedPoly = { poly: [], tags: [] }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const si = s[i]
    const sj = s[j]
    if (si >= -EPS) {
      pos.poly.push(poly[i])
      pos.tags.push(tags[i])
    }
    if (si <= EPS) {
      neg.poly.push(poly[i])
      neg.tags.push(tags[i])
    }
    if ((si > EPS && sj < -EPS) || (si < -EPS && sj > EPS)) {
      const u = si / (si - sj)
      const q = v2(poly[i].x + u * (poly[j].x - poly[i].x), poly[i].y + u * (poly[j].y - poly[i].y))
      pos.poly.push(q)
      pos.tags.push(si > EPS ? newTag : tags[i])
      neg.poly.push(q)
      neg.tags.push(si < -EPS ? newTag : tags[i])
    }
  }

  // 兩端都落在切線上的邊，就是這一摺新造出來的摺痕。
  for (const part of [pos, neg]) {
    for (let i = 0; i < part.poly.length; i++) {
      const j = (i + 1) % part.poly.length
      if (
        Math.abs(sideOf(P, D, part.poly[i])) <= 1e-7 &&
        Math.abs(sideOf(P, D, part.poly[j])) <= 1e-7
      ) {
        part.tags[i] = newTag
      }
    }
  }

  return {
    pos: pos.poly.length >= 3 && area2(pos.poly) > 1e-8 ? pos : null,
    neg: neg.poly.length >= 3 && area2(neg.poly) > 1e-8 ? neg : null,
  }
}

function ccwOrder(poly: Vec2[]): Vec2[] {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return s > 0 ? poly : [...poly].reverse()
}

/** 兩個凸多邊形的交集面積（半平面裁剪） */
export function convexOverlapArea(A: Vec2[], B: Vec2[]): number {
  let r = ccwOrder(A)
  const b = ccwOrder(B)
  for (let i = 0; i < b.length && r.length >= 3; i++) {
    const p0 = b[i]
    const p1 = b[(i + 1) % b.length]
    const out: Vec2[] = []
    for (let k = 0; k < r.length; k++) {
      const c = r[k]
      const d = r[(k + 1) % r.length]
      const sc = (p1.x - p0.x) * (c.y - p0.y) - (p1.y - p0.y) * (c.x - p0.x)
      const sd = (p1.x - p0.x) * (d.y - p0.y) - (p1.y - p0.y) * (d.x - p0.x)
      if (sc >= -EPS) out.push(c)
      if ((sc > EPS && sd < -EPS) || (sc < -EPS && sd > EPS)) {
        const u = sc / (sc - sd)
        out.push(v2(c.x + u * (d.x - c.x), c.y + u * (d.y - c.y)))
      }
    }
    r = out
  }
  return r.length >= 3 ? area2(r) / 2 : 0
}

/** 直線 (P, D) 落在多邊形內的參數區間，量在 D 方向上 */
function clipLineToPoly(poly: Vec2[], P: Vec2, D: Vec2): [number, number] | null {
  const hits: number[] = []
  const at = (p: Vec2): number => (p.x - P.x) * D.x + (p.y - P.y) * D.y
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const sp = sideOf(P, D, p)
    const sq = sideOf(P, D, q)
    if (Math.abs(sp) <= 1e-7) hits.push(at(p))
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      const u = sp / (sp - sq)
      hits.push(at(v2(p.x + u * (q.x - p.x), p.y + u * (q.y - p.y))))
    }
  }
  if (hits.length < 2) return null
  return [Math.min(...hits), Math.max(...hits)]
}

// ---------------------------------------------------------------- 步驟定義

export type LayerSel =
  | 'all'
  | { top: number }
  | { bottom: number }
  | { range: [number, number] }
  /**
   * 用「蓋住某個位置的紙層」來指定，比層號穩健得多。
   * 例如翅膀尖端只有兩層紙蓋著，就能明確指出前翅或後翅。
   */
  | { at: Vec2; pick: 'top' | 'bottom'; count?: number }
  /**
   * 選「某個先前的摺移動過的那疊紙」。蛇腹摺（pleat)的第二摺必須把
   * 第一摺剛翻過去的整疊再摺回來，那疊的層數會隨位置變化，
   * 用層號或取樣點都選不乾淨——用摺的 ref 直接指名最穩。
   */
  | { movedBy: string }

export interface FoldOp {
  kind: 'fold'
  /** 摺線上的兩點，座標系為「目前的攤平狀態」 */
  a: Vec2
  b: Vec2
  /** 位於「會移動」那一側的任一點（同為攤平狀態座標） */
  move: Vec2
  /** 在移動側的面之中，要摺動哪幾層。預設全部。 */
  layers?: LayerSel
  /** 移動的面最後疊在上方還是下方。預設 up。 */
  dir?: 'up' | 'down'
  /** 摺疊角度，預設 180（完全摺平） */
  angle?: number
  /** 圖解中的摺痕型式 */
  crease?: 'valley' | 'mountain'
  /** 在本步驟內的時間區間，用來把複合摺拆成數個接續的子摺 */
  t0?: number
  t1?: number
  /** 供後續 unfold 引用 */
  ref?: string
  /** 不在圖解中標示這條摺線（子摺的輔助線） */
  hideCrease?: boolean
}

export interface UnfoldOp {
  kind: 'unfold'
  /** 先前某個 fold 的 ref */
  ref: string
  t0?: number
  t1?: number
}

export interface SpinOp {
  kind: 'spin'
  /** 在桌面上原地轉動模型（逆時針，度） */
  angle: number
  t0?: number
  t1?: number
}

export interface TurnOp {
  kind: 'turn'
  /** 翻面時的翻轉軸 */
  about: 'vertical' | 'horizontal'
  t0?: number
  t1?: number
}

/**
 * 純粹的展示姿態：只轉動 3D 模型本身，不動攤平座標。
 * 因為攤平座標會因此失效，這個動作只能出現在最後一個步驟。
 */
export interface PoseOp {
  kind: 'pose'
  axis: 'x' | 'y' | 'z'
  angle: number
  t0?: number
  t1?: number
}

export type Op = FoldOp | UnfoldOp | SpinOp | TurnOp | PoseOp

export interface StepDef {
  title: string
  desc: string
  ops: Op[]
}

// ---------------------------------------------------------------- 建構結果

export interface BuiltFace {
  poly: Vec2[]
  tags: number[]
  /** 依序作用在這個面上的摺 id */
  chain: number[]
  /**
   * 每一摺之後的「局部厚度 × 正反面號誌」，索引 k 表示第 k−1 摺結束後的值，索引 0 為初始狀態。
   *
   * 局部厚度是「這個位置實際壓在它下面的紙層數」，不是全域層號。用全域層號會讓
   * 層號大的部位（例如紙鶴的頸子）被推離基準面太遠而穿過其他紙面。
   */
  signedLayer: number[]
}

export interface BuiltFold {
  id: number
  step: number
  kind: 'fold' | 'spin' | 'turn' | 'pose'
  /** 目標角度（度），實際旋轉量為 angle × sign */
  angle: number
  sign: number
  t0: number
  t1: number
  /** kind === 'fold'：摺線兩端，座標系為代表面的紙張座標 */
  axisPaper?: [Vec2, Vec2]
  /** 同一條摺線在當時攤平座標中的位置，unfold 會沿用 */
  axisFlat?: [Vec2, Vec2]
  /** 代表面的 chain 前綴，用來在最終面陣列中定位代表面 */
  prefix: number[]
  repIndex: number
  /** 供圖解使用的摺痕線段（代表面的紙張座標） */
  creasePaper?: [Vec2, Vec2]
  creaseType?: 'valley' | 'mountain'
  showCrease: boolean
  /** kind === 'spin' | 'turn'：固定的世界座標旋轉軸 */
  worldAxis?: { origin: Vector3; dir: Vector3 }
  /** 最終面陣列中受此摺影響的索引 */
  affected: number[]
}

export interface Built {
  faces: BuiltFace[]
  folds: BuiltFold[]
  steps: { title: string; desc: string }[]
  nSteps: number
  /** 每個步驟結束時的攤平狀態，供編寫摺法時查座標、層序與局部厚度 */
  snapshots: { layer: number; depth: number; poly: Vec2[] }[][]
}

// ---------------------------------------------------------------- 建構

interface SimFace {
  poly: Vec2[]
  tags: number[]
  flat: Iso
  chain: number[]
  layer: number
  signedLayer: number[]
  out: number
}

/**
 * 攤平座標 → 世界座標。攤平座標的 +y（圖解中的「上」）對應世界 −z，
 * 這樣從上方俯視時，摺紙圖的上方才會出現在畫面上方。
 */
export function embed(p: Vec2): Vector3 {
  return new Vector3(p.x, 0, -p.y)
}

export function rotationAboutLine(A: Vector3, B: Vector3, deg: number): Matrix4 {
  const dir = new Vector3().subVectors(B, A).normalize()
  return new Matrix4()
    .makeTranslation(A.x, A.y, A.z)
    .multiply(new Matrix4().makeRotationAxis(dir, (deg * Math.PI) / 180))
    .multiply(new Matrix4().makeTranslation(-A.x, -A.y, -A.z))
}

function matchesPrefix(face: SimFace | BuiltFace, prefix: number[], foldId: number): boolean {
  return (
    face.chain.length > prefix.length &&
    face.chain[prefix.length] === foldId &&
    prefix.every((v, i) => face.chain[i] === v)
  )
}

function pickLayers(layers: number[], sel: LayerSel | undefined): Set<number> {
  const distinct = [...new Set(layers)].sort((p, q) => p - q)
  if (!sel || sel === 'all' || 'at' in sel || 'movedBy' in sel) return new Set(distinct)
  if ('top' in sel) return new Set(distinct.slice(Math.max(0, distinct.length - sel.top)))
  if ('bottom' in sel) return new Set(distinct.slice(0, sel.bottom))
  return new Set(distinct.slice(sel.range[0], sel.range[1] + 1))
}

/** 凸多邊形的點內測試（多邊形頂點為逆時針或順時針皆可） */
function pointInPoly(poly: Vec2[], p: Vec2): boolean {
  let pos = false
  let neg = false
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const s = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (s > 1e-7) pos = true
    if (s < -1e-7) neg = true
    if (pos && neg) return false
  }
  return true
}

/** 把層序壓成連續整數 0..k-1 */
function renumber(faces: SimFace[]): void {
  const distinct = [...new Set(faces.map((f) => f.layer))].sort((p, q) => p - q)
  const map = new Map(distinct.map((l, i) => [l, i]))
  for (const f of faces) f.layer = map.get(f.layer)!
}

export function buildModel(paper: Vec2[], steps: StepDef[]): Built {
  let faces: SimFace[] = [
    {
      poly: paper,
      tags: paper.map(() => -1),
      flat: ISO_ID,
      chain: [],
      layer: 0,
      signedLayer: [0],
      out: -1,
    },
  ]
  const folds: BuiltFold[] = []
  const refs = new Map<string, number>()
  /** 每一摺之前的層序快照，unfold 用來精確還原 */
  const layerSnapshots = new Map<number, Map<SimFace, number>>()

  function findRep(fold: BuiltFold): SimFace {
    return faces.find((f) => matchesPrefix(f, fold.prefix, fold.id))!
  }

  /**
   * 記錄每個面此刻的層序（乘上正反面號誌）。
   *
   * 層序是這個引擎維護的**權威堆疊順序**，任何一對重疊的面層序一定不同
   * （同層的面保證不重疊）。渲染時把它單調地映射成厚度偏移，遮蔽關係就一定正確，
   * 也不可能 z-fighting。
   *
   * 曾經試過用「局部厚度」來算偏移量，兩種做法都失敗：
   *   - 重疊關係上的最長鏈：鏈會在重疊圖上遊走（頸尖的面重疊翅膀、翅膀又重疊別處），
   *     頸尖算出 19 層而該處實際只有 4 層，整條頸子浮離身體。
   *   - 數有幾個面蓋住自己的重心：兩個重疊的面用不同取樣點，會產生大量順序反轉。
   * 正確的局部層序是已知的困難問題，原型不需要——單調壓縮層序就足夠了。
   *
   * 每一摺結束後都記一次，播放動畫時偏移量才能跟著造成它的那一摺變化，
   * 而不是整個步驟一起內插——否則子摺提早落下時，紙層會互相穿刺。
   */
  function recordLayers(): void {
    for (const f of faces) f.signedLayer.push(f.layer * Math.sign(isoDet(f.flat)))
  }

  /** 某一摺在目前狀態下的 3D 旋轉矩陣（先前各摺皆已完成） */
  function rotationOf(fold: BuiltFold, deg: number): Matrix4 {
    if (fold.kind === 'fold') {
      const m = matrixFor(findRep(fold), fold.id)
      const A = embed(fold.axisPaper![0]).applyMatrix4(m)
      const B = embed(fold.axisPaper![1]).applyMatrix4(m)
      return rotationAboutLine(A, B, deg)
    }
    const ax = fold.worldAxis!
    return rotationAboutLine(ax.origin, new Vector3().addVectors(ax.origin, ax.dir), deg)
  }

  /** 某個面在「第 upTo 摺尚未發生」時的 3D 變換 */
  function matrixFor(face: SimFace, upTo: number): Matrix4 {
    const m = new Matrix4()
    for (const fid of face.chain) {
      if (fid >= upTo) break
      m.premultiply(rotationOf(folds[fid], folds[fid].angle * folds[fid].sign))
    }
    return m
  }

  const applyFoldOp = (op: FoldOp, step: number): void => {
    const P = op.a
    const D = norm(sub(op.b, op.a))
    const foldId = folds.length
    const moveSign = Math.sign(sideOf(P, D, op.move))

    // 1. 沿摺線切開所有面（在各自紙張座標中運算，用攤平座標判斷歸屬哪一側）
    const pieces: { face: SimFace; moving: boolean }[] = []
    for (const face of faces) {
      const inv = invertIso(face.flat)
      const Pp = applyIso(inv, P)
      const Dp = norm(sub(applyIso(inv, op.b), Pp))
      const { pos, neg } = splitPoly({ poly: face.poly, tags: face.tags }, Pp, Dp, foldId)
      for (const part of [pos, neg]) {
        if (!part) continue
        const child: SimFace = {
          poly: part.poly,
          tags: part.tags,
          flat: face.flat,
          chain: [...face.chain],
          layer: face.layer,
          signedLayer: [...face.signedLayer],
          out: -1,
        }
        const flatCentroid = applyIso(face.flat, centroid(part.poly))
        pieces.push({ face: child, moving: Math.sign(sideOf(P, D, flatCentroid)) === moveSign })
      }
    }
    faces = pieces.map((p) => p.face)
    layerSnapshots.set(foldId, new Map(faces.map((f) => [f, f.layer] as const)))

    // 2. 在移動側挑出真正要摺的面
    const movingSide = pieces.filter((p) => p.moving)
    let group: SimFace[]
    if (op.layers && typeof op.layers === 'object' && 'movedBy' in op.layers) {
      // 直接指名「被某個先前的摺移動過」的面，不經過層號
      const refId = refs.get(op.layers.movedBy)
      if (refId === undefined) {
        throw new Error(`步驟 ${step + 1}：找不到 movedBy ref「${op.layers.movedBy}」`)
      }
      group = movingSide.filter((p) => p.face.chain.includes(refId)).map((p) => p.face)
    } else {
      let chosen: Set<number>
      if (op.layers && typeof op.layers === 'object' && 'at' in op.layers) {
        const sel = op.layers
        const covering = movingSide.filter((p) =>
          pointInPoly(
            p.face.poly.map((q) => applyIso(p.face.flat, q)),
            sel.at,
          ),
        )
        const distinct = [...new Set(covering.map((p) => p.face.layer))].sort((x, y) => x - y)
        const n = sel.count ?? 1
        chosen = new Set(sel.pick === 'top' ? distinct.slice(-n) : distinct.slice(0, n))
      } else {
        chosen = pickLayers(
          movingSide.map((p) => p.face.layer),
          op.layers,
        )
      }
      group = movingSide.filter((p) => chosen.has(p.face.layer)).map((p) => p.face)
    }
    if (group.length === 0) throw new Error(`步驟 ${step + 1}：這一摺沒有選到任何面`)

    // 3. 摺痕顯示線段：所有移動面在攤平座標中沿摺線的聯集範圍
    let lo = Infinity
    let hi = -Infinity
    for (const f of group) {
      const range = clipLineToPoly(
        f.poly.map((p) => applyIso(f.flat, p)),
        P,
        D,
      )
      if (!range) continue
      lo = Math.min(lo, range[0])
      hi = Math.max(hi, range[1])
    }
    if (!Number.isFinite(lo)) {
      lo = 0
      hi = 0
    }

    // 4. 登錄這一摺（軸與摺痕都換算成代表面的紙張座標）
    //
    // 代表面挑「本步驟裡還沒被其他子摺動過」的那一片。複合摺的子摺是接續播放的，
    // 若代表面的攤平座標已經含了前一個子摺的鏡射，在那個子摺播完之前，
    // 摺線就會被畫到錯誤的位置。
    const sameStep = new Set(folds.filter((f) => f.step === step).map((f) => f.id))
    const stepFoldCount = (f: SimFace): number =>
      f.chain.reduce((n, id) => n + (sameStep.has(id) ? 1 : 0), 0)
    const rep = group.reduce((best, f) => (stepFoldCount(f) < stepFoldCount(best) ? f : best))
    const repInv = invertIso(rep.flat)
    const fold: BuiltFold = {
      id: foldId,
      step,
      kind: 'fold',
      angle: op.angle ?? 180,
      sign: 1,
      t0: op.t0 ?? 0,
      t1: op.t1 ?? 1,
      axisPaper: [applyIso(repInv, P), applyIso(repInv, op.b)],
      axisFlat: [P, op.b],
      prefix: [...rep.chain],
      repIndex: -1,
      creasePaper: [
        applyIso(repInv, v2(P.x + D.x * lo, P.y + D.y * lo)),
        applyIso(repInv, v2(P.x + D.x * hi, P.y + D.y * hi)),
      ],
      creaseType: op.crease ?? 'valley',
      showCrease: !op.hideCrease,
      affected: [],
    }
    folds.push(fold)
    if (op.ref) refs.set(op.ref, foldId)

    // 5. 決定旋轉方向：讓移動的面依 dir 從上方或下方翻過去
    const sample = new Vector3()
    for (const f of group) sample.add(embed(centroid(f.poly)).applyMatrix4(matrixFor(f, foldId)))
    sample.divideScalar(group.length)
    for (const f of group) f.chain.push(foldId)
    const probe = sample.clone().applyMatrix4(rotationOf(fold, fold.angle * 0.5))
    fold.sign = ((op.dir ?? 'up') === 'up' ? probe.y >= 0 : probe.y <= 0) ? 1 : -1

    // 6. 更新攤平座標與層序
    const R = reflectionIso(P, D)
    for (const f of group) f.flat = composeIso(R, f.flat)

    const groupLayers = [...new Set(group.map((f) => f.layer))].sort((p, q) => p - q)
    const allLayers = faces.map((f) => f.layer)
    const base =
      (op.dir ?? 'up') === 'up'
        ? Math.max(...allLayers) + 1
        : Math.min(...allLayers) - groupLayers.length
    // 翻過去之後組內順序反轉
    const remap = new Map(
      groupLayers.map((l, i) => [l, base + (groupLayers.length - 1 - i)] as const),
    )
    const oldLayers = new Map(group.map((f) => [f, f.layer] as const))
    for (const f of group) f.layer = remap.get(oldLayers.get(f)!)!
    renumber(faces)
    recordLayers()
  }

  const applyUnfoldOp = (op: UnfoldOp, step: number): void => {
    const origId = refs.get(op.ref)
    if (origId === undefined) throw new Error(`步驟 ${step + 1}：找不到 ref「${op.ref}」`)
    const orig = folds[origId]
    const group = faces.filter((f) => f.chain.includes(origId))
    const rep = group.find((f) => matchesPrefix(f, orig.prefix, origId)) ?? group[0]

    const [A, B] = orig.axisFlat!
    const repInv = invertIso(rep.flat)
    folds.push({
      id: folds.length,
      step,
      kind: 'fold',
      angle: orig.angle,
      sign: -orig.sign,
      t0: op.t0 ?? 0,
      t1: op.t1 ?? 1,
      axisPaper: [applyIso(repInv, A), applyIso(repInv, B)],
      axisFlat: [A, B],
      prefix: [...rep.chain],
      repIndex: -1,
      creaseType: orig.creaseType,
      showCrease: false,
      affected: [],
    })
    const newId = folds.length - 1
    for (const f of group) f.chain.push(newId)

    const R = reflectionIso(A, norm(sub(B, A)))
    for (const f of group) f.flat = composeIso(R, f.flat)

    // 精確還原原摺之前的層序
    const snap = layerSnapshots.get(origId)!
    for (const f of faces) {
      const before = snap.get(f)
      if (before !== undefined) f.layer = before
    }
    renumber(faces)
    recordLayers()
  }

  const applyGlobalOp = (op: SpinOp | TurnOp | PoseOp, step: number): void => {
    let flat: Iso
    let axis: { origin: Vector3; dir: Vector3 }
    let angle: number
    let sign: number
    if (op.kind === 'pose') {
      flat = ISO_ID
      axis = {
        origin: new Vector3(0, 0, 0),
        dir: new Vector3(op.axis === 'x' ? 1 : 0, op.axis === 'y' ? 1 : 0, op.axis === 'z' ? 1 : 0),
      }
      angle = op.angle
      sign = 1
    } else if (op.kind === 'spin') {
      flat = rotationIso(op.angle)
      axis = { origin: new Vector3(0, 0, 0), dir: new Vector3(0, 1, 0) }
      angle = op.angle
      sign = 1
    } else {
      const vertical = op.about === 'vertical'
      flat = reflectionIso(v2(0, 0), vertical ? v2(0, 1) : v2(1, 0))
      axis = {
        origin: new Vector3(0, 0, 0),
        dir: vertical ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0),
      }
      angle = 180
      sign = 1
    }
    const id = folds.length
    folds.push({
      id,
      step,
      kind: op.kind,
      angle,
      sign,
      t0: op.t0 ?? 0,
      t1: op.t1 ?? 1,
      worldAxis: axis,
      prefix: [],
      repIndex: -1,
      showCrease: false,
      affected: [],
    })
    for (const f of faces) {
      f.chain.push(id)
      if (op.kind !== 'pose') f.flat = composeIso(flat, f.flat)
      if (op.kind === 'turn') f.layer = -f.layer
    }
    renumber(faces)
    recordLayers()
  }

  const snapshots: { layer: number; depth: number; poly: Vec2[] }[][] = []
  steps.forEach((step, si) => {
    for (const op of step.ops) {
      if (op.kind === 'fold') applyFoldOp(op, si)
      else if (op.kind === 'unfold') applyUnfoldOp(op, si)
      else applyGlobalOp(op, si)
    }
    snapshots.push(
      faces
        .map((f) => ({
          layer: f.layer,
          depth: Math.abs(f.signedLayer[f.signedLayer.length - 1]),
          poly: f.poly.map((p) => applyIso(f.flat, p)),
        }))
        .sort((a, b) => a.layer - b.layer),
    )
  })

  faces.forEach((f, i) => (f.out = i))
  for (const fold of folds) {
    fold.affected = faces.filter((f) => f.chain.includes(fold.id)).map((f) => f.out)
    fold.repIndex =
      fold.kind === 'fold' ? faces.find((f) => matchesPrefix(f, fold.prefix, fold.id))!.out : 0
  }

  return {
    faces: faces.map((f) => ({
      poly: f.poly,
      tags: f.tags,
      chain: f.chain,
      signedLayer: f.signedLayer,
    })),
    folds,
    steps: steps.map((s) => ({ title: s.title, desc: s.desc })),
    nSteps: steps.length,
    snapshots,
  }
}

// ---------------------------------------------------------------- 執行期

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t))

/** 某一摺在本步驟進度 t 時已完成的比例 */
function progressOf(fold: BuiltFold, t: number): number {
  const local = fold.t1 <= fold.t0 ? 1 : (t - fold.t0) / (fold.t1 - fold.t0)
  return easeInOut(clamp01(local))
}

/** 各摺在 (step, t) 時刻的角度；t 是該步驟內 0→1 的進度 */
export function anglesAt(built: Built, step: number, t: number): number[] {
  return built.folds.map((f) => {
    if (f.step < step) return f.angle * f.sign
    if (f.step > step) return 0
    return f.angle * f.sign * progressOf(f, t)
  })
}

/** 各面在 (step, t) 時刻的 3D 變換矩陣 */
export function matricesAt(built: Built, step: number, t: number): Matrix4[] {
  const angles = anglesAt(built, step, t)
  const mats = built.faces.map(() => new Matrix4())
  for (const f of built.folds) {
    const deg = angles[f.id]
    if (Math.abs(deg) < 1e-7) continue
    let A: Vector3
    let B: Vector3
    if (f.kind === 'fold') {
      const m = mats[f.repIndex]
      A = embed(f.axisPaper![0]).applyMatrix4(m)
      B = embed(f.axisPaper![1]).applyMatrix4(m)
    } else {
      A = f.worldAxis!.origin
      B = new Vector3().addVectors(f.worldAxis!.origin, f.worldAxis!.dir)
    }
    const R = rotationAboutLine(A, B, deg)
    for (const idx of f.affected) mats[idx].premultiply(R)
  }
  return mats
}

/**
 * 紙張厚度造成的偏移量（帶號，單位為「紙厚」，沿面自身法線方向）。
 *
 * 用層序的**平方根**而不是層序本身。平方根是單調的，所以任何一對重疊的面
 * （層序必不同）遮蔽順序一定正確、也不可能 z-fighting；同時它會壓縮上層的距離，
 * 紙鶴有 30 幾層時最上層才不會浮離身體。相鄰低層仍分得開，看得出疊紙的厚度。
 *
 * 每一摺造成的層序變化，各自跟著那一摺的進度變化，而不是整個步驟一起內插。
 * 複合摺的子摺有各自的時間區間，若用步驟進度統一內插，先落下的紙層偏移量還沒到位，
 * 就會穿進下方的紙裡。
 */
export function sheetOffsetAt(built: Built, faceIdx: number, step: number, t: number): number {
  const hist = built.faces[faceIdx].signedLayer
  const ids = built.folds.filter((f) => f.step === step).map((f) => f.id)
  let v = ids.length === 0 ? hist[0] : hist[ids[0]]
  for (const id of ids) v += (hist[id + 1] - hist[id]) * progressOf(built.folds[id], t)
  return Math.sign(v) * Math.sqrt(Math.abs(v))
}

