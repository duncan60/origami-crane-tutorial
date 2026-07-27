import { v2, type FoldOp, type StepDef, type Vec2 } from './fold'

/**
 * 紙飛機（標準尖頭款）摺法
 *
 * 座標系：A4 比例的長方形紙，寬 2、高 2√2，也就是 x ∈ [-1, 1]、y ∈ [-√2, √2]。
 * 攤平座標的 +y 是圖解中的「上方」，機頭朝上。
 *
 * 這個作品的每一摺都是單純的對摺——沒有花瓣摺、沒有內翻摺、不需要撐開紙層，
 * 完全落在這個引擎能精確表達的範圍內。最厚處也只有 8 層，3D 裡一眼就看得出
 * 動的是哪一層。
 */

/** 紙張半高（A4 比例） */
const H = Math.SQRT2
/** 機頭頂點，前四摺都以它為軸心 */
const NOSE = v2(0, H)
/** 機翼摺線離龍骨的距離 */
const KEEL = 0.25
/**
 * 對摺之後，層序剛好乾淨地分成兩半：下半 4 層是一邊、上半 4 層是另一邊，
 * 每一半都是「底紙 + 兩片機頭摺角」，摺角落在外側。摺機翼時整半一起動。
 */
const HALF_LAYERS = 4

const ray = (from: Vec2, deg: number, len = 1): Vec2 =>
  v2(from.x + Math.cos((deg * Math.PI) / 180) * len, from.y + Math.sin((deg * Math.PI) / 180) * len)

/**
 * 以 hinge 為軸心，把 fromDeg 方向的那條邊摺到 toDeg 方向去。
 * 摺線就是兩個方向的角平分線；會移動的是夾在「邊」與「摺線」之間的那一塊。
 *
 * 角度要用數值上相鄰的值表達（例如右側用 360 而不是 0），否則平均值會落到反方向。
 */
const foldEdgeTo = (
  fromDeg: number,
  toDeg: number,
  t0: number,
  t1: number,
  ref?: string,
): FoldOp => ({
  kind: 'fold',
  a: NOSE,
  b: ray(NOSE, (fromDeg + toDeg) / 2),
  // 取在「邊」與「摺線」之間，確保落在會移動的那一側
  move: ray(NOSE, (fromDeg * 3 + toDeg) / 4, 0.6),
  dir: 'up',
  crease: 'valley',
  t0,
  t1,
  ref,
})

export const planeSteps: StepDef[] = [
  {
    title: '壓出中線',
    desc: '把長方形紙有顏色的一面朝下、直放。沿垂直中線對摺，壓實之後再攤開。這條中線是後面每一摺的對齊基準。',
    ops: [
      {
        kind: 'fold',
        a: v2(0, -H),
        b: v2(0, H),
        move: v2(0.5, 0),
        dir: 'up',
        crease: 'valley',
        ref: 'mid',
        t0: 0,
        t1: 0.55,
      },
      { kind: 'unfold', ref: 'mid', t0: 0.58, t1: 1 },
    ],
  },
  {
    title: '兩個上角摺向中線',
    desc: '把左上角往下翻摺，讓上緣貼齊中線；右上角也一樣。兩個角會在中線上碰頭，紙的上端變成一個尖角。',
    ops: [
      // 左：上緣（180°）摺到中線（270°）
      foldEdgeTo(180, 270, 0, 0.6),
      // 右：上緣（360°）摺到中線（270°）
      foldEdgeTo(360, 270, 0.35, 1),
    ],
  },
  {
    title: '再把兩條斜邊摺向中線',
    desc: '把剛才形成的兩條斜邊再一次摺到中線。這一摺會連同下面的紙一起帶動，機頭因此變得又長又尖。',
    ops: [
      // 左：斜邊（225°）摺到中線（270°）
      foldEdgeTo(225, 270, 0, 0.6),
      // 右：斜邊（315°）摺到中線（270°）
      foldEdgeTo(315, 270, 0.35, 1),
    ],
  },
  {
    title: '沿中線對摺，摺角朝外',
    desc: '沿中線把整張紙對摺。注意是往後摺，讓剛才那些摺角留在外側——這樣機翼才有東西可以撐住。摺完是一個長長的三角形。',
    ops: [
      {
        kind: 'fold',
        a: v2(0, -H),
        b: v2(0, H),
        move: v2(0.5, 0),
        dir: 'down',
        crease: 'mountain',
      },
    ],
  },
  {
    title: '摺出兩片機翼，完成',
    desc: '在離摺邊一小段的地方把兩片機翼分別往外摺下，留下中間一條窄窄的龍骨當握把。機翼稍微上翹會飛得比較穩。完成——拖曳畫面可以繞著它看，也可以拉動下方進度條回看任何一摺。',
    ops: [
      {
        kind: 'fold',
        a: v2(-KEEL, -H),
        b: v2(-KEEL, H),
        move: v2(-0.6, -0.8), // 機翼那一側（機身窄，取靠尾端才有紙）
        layers: { bottom: HALF_LAYERS },
        dir: 'down',
        angle: 85,
        crease: 'mountain',
        t0: 0,
        t1: 0.6,
      },
      {
        kind: 'fold',
        a: v2(-KEEL, -H),
        b: v2(-KEEL, H),
        move: v2(-0.6, -0.8),
        layers: { top: HALF_LAYERS },
        dir: 'up',
        angle: 85,
        crease: 'valley',
        t0: 0,
        t1: 0.6,
      },
      // 立成飛行姿態：先讓龍骨朝下、機翼水平，再把機頭轉向側面才看得出側影
      { kind: 'pose', axis: 'z', angle: -90, t0: 0.55, t1: 0.85 },
      { kind: 'pose', axis: 'y', angle: -90, t0: 0.78, t1: 1 },
    ],
  },
]

/** 紙張輪廓（逆時針） */
export const planePaper: Vec2[] = [v2(-1, -H), v2(1, -H), v2(1, H), v2(-1, H)]
