import { v2, type FoldOp, type StepDef, type Vec2 } from './fold'

/**
 * 紙鶴摺法
 *
 * 座標系：邊長 2 的正方形紙 [-1, 1]²，攤平座標的 +y 是圖解中的「上方」。
 *
 * 第 1、2 步沿兩條中線各對摺一次。這在數學上就等於「正方基本型」：
 * 紙的四個角全部落到同一點 (-1, -1)，紙的中心 (0, 0) 成為閉合的尖角。
 * 之後把座標轉 45°，讓閉合角朝上、四個開口角朝下，就是標準的擺放方向。
 */

const S = Math.SQRT1_2 // 0.7071，正方基本型左右兩角
const BOT = -Math.SQRT2 // -1.4142，四個開口角所在的下方尖端
const XC = Math.SQRT2 - 1 // 0.4142，花瓣摺橫向摺痕的高度

/** 正方基本型的四個頂點（轉正之後） */
const TIP = v2(0, 0) // 閉合的上尖角（紙張中心）
const OPEN = v2(0, BOT) // 開口的下尖角（紙張四角）
const LEFT = v2(-S, -S)
const RIGHT = v2(S, -S)
/** 花瓣摺橫向摺痕的兩端 */
const XL = v2(-XC, -XC)
const XR = v2(XC, -XC)

const mid3 = (a: Vec2, b: Vec2, c: Vec2): Vec2 =>
  v2((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3)

/** 把左下緣摺到中線（角平分線落在開口角與側邊之間） */
const creaseLeftToCenter = (t0: number, t1: number, ref?: string): FoldOp => ({
  kind: 'fold',
  a: OPEN,
  b: XL,
  move: mid3(OPEN, LEFT, XL),
  layers: { top: 1 },
  dir: 'up',
  crease: 'valley',
  t0,
  t1,
  ref,
})

/** 把右下緣摺到中線 */
const creaseRightToCenter = (t0: number, t1: number, ref?: string): FoldOp => ({
  kind: 'fold',
  a: OPEN,
  b: XR,
  move: mid3(OPEN, RIGHT, XR),
  layers: { top: 1 },
  dir: 'up',
  crease: 'valley',
  t0,
  t1,
  ref,
})

/** 把上尖角沿橫線往下摺 */
const creaseTopDown = (t0: number, t1: number, ref?: string): FoldOp => ({
  kind: 'fold',
  a: XL,
  b: XR,
  move: mid3(TIP, XL, XR),
  layers: { top: 1 },
  dir: 'up',
  crease: 'valley',
  t0,
  t1,
  ref,
})

/** 壓出花瓣摺所需的三條摺痕，每摺完就攤開 */
const precreaseOps = (): StepDef['ops'] => [
  creaseLeftToCenter(0, 0.26, 'pcL'),
  { kind: 'unfold', ref: 'pcL', t0: 0.26, t1: 0.36 },
  creaseRightToCenter(0.36, 0.62, 'pcR'),
  { kind: 'unfold', ref: 'pcR', t0: 0.62, t1: 0.72 },
  creaseTopDown(0.72, 0.88, 'pcT'),
  { kind: 'unfold', ref: 'pcT', t0: 0.88, t1: 1 },
]

/**
 * 花瓣摺：左右兩片摺向中線，然後把橫線以下的整疊往上翻。
 * 下尖角因此被拉到上方 (0, 0.5858)，形成鳥基本型細長的尖角。
 */
const petalFoldOps = (): StepDef['ops'] => [
  creaseLeftToCenter(0, 0.5),
  creaseRightToCenter(0, 0.5),
  {
    kind: 'fold',
    a: XL,
    b: XR,
    move: v2(0, -0.9),
    layers: { top: 3 },
    dir: 'up',
    crease: 'mountain',
    t0: 0.32,
    t1: 1,
  },
]

// ---------------------------------------------------------------- 鳥基本型之後

/** 鳥基本型上兩個細尖角的頂點（第 7 步轉半圈後朝下） */
const APEX = v2(0, -(2 - Math.SQRT2)) // (0, -0.5858)
/** 從某點沿指定角度（度）取一段方向 */
const ray = (from: Vec2, deg: number, len = 1): Vec2 =>
  v2(from.x + Math.cos((deg * Math.PI) / 180) * len, from.y + Math.sin((deg * Math.PI) / 180) * len)

/**
 * 把細尖角的一邊摺到中線。尖角兩邊與中線的夾角是 22.5°，所以角平分線
 * 落在 90° ± 11.25°。兩層（花瓣摺造成的兩層）要一起摺。
 */
const narrowPoint = (side: 'left' | 'right', t0: number, t1: number): FoldOp => ({
  kind: 'fold',
  a: APEX,
  b: ray(APEX, side === 'left' ? 101.25 : 78.75),
  // 沿尖角自身的邊取一點，確保落在會移動的那一側
  move: ray(APEX, side === 'left' ? 112.5 : 67.5, 0.3),
  layers: { top: 2 },
  dir: 'up',
  crease: 'valley',
  t0,
  t1,
})

/**
 * 內翻摺：把尖角沿一條斜線整疊反摺過去。斜線角度 α 會把原本朝下（270°）的
 * 尖角轉到 2α − 270°，所以頸子要朝左上 135° 就取 α = 22.5°，尾巴朝右上 45° 取 α = 157.5°。
 */
// 轉折點放在細尖角接近根部處（根部在 y = 0.414），頸與尾才會明顯伸出翅膀輪廓之外
const REVERSE_Q = v2(0, 0.38)
/** 每個細尖角的紙層數：主三角形 + 花瓣摺 2 片 + 收窄 4 片 */
const POINT_LAYERS = 7

const reverseFold = (
  deg: number,
  layers: FoldOp['layers'],
  dir: 'up' | 'down',
  t0: number,
  t1: number,
): FoldOp => ({
  kind: 'fold',
  a: REVERSE_Q,
  b: ray(REVERSE_Q, deg),
  move: v2(0, -0.2), // 尖角那一側
  layers,
  dir,
  crease: 'mountain',
  t0,
  t1,
})

/** 翅膀的摺線高度：略高於細尖角根部，摺線以上就是翅膀 */
const WING_HINGE = 0.44

/** 頸子反摺後的頂端，用來定位頭部那一摺 */
const NECK_LEN = REVERSE_Q.y - APEX.y
const NECK_TIP = ray(REVERSE_Q, 135, NECK_LEN)
const HEAD_Q = ray(REVERSE_Q, 135, NECK_LEN * 0.72)

export const craneSteps: StepDef[] = [
  {
    title: '沿垂直中線對摺',
    desc: '把正方形紙有顏色的一面朝下。將右半邊往左翻摺，兩邊邊緣對齊，壓平成長方形。',
    ops: [
      { kind: 'fold', a: v2(0, -1), b: v2(0, 1), move: v2(0.5, 0), dir: 'up', crease: 'valley' },
    ],
  },
  {
    title: '再對摺成正方基本型',
    desc: '把上半邊往下翻摺，得到四層的小正方形。此時紙的四個角都疊在同一個尖端上，這就是「正方基本型」。最後把它轉正，閉合的尖角朝上、開口朝下。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, 0),
        b: v2(0, 0),
        move: v2(-0.5, 0.5),
        dir: 'up',
        crease: 'valley',
        t0: 0,
        t1: 0.62,
      },
      { kind: 'spin', angle: 45, t0: 0.68, t1: 1 },
    ],
  },
  {
    title: '壓出花瓣摺的摺痕',
    desc: '只摺最上面一層。先把左下緣、再把右下緣摺到中線，最後把上尖角往下摺，每摺一次都壓實再攤開。這三條摺痕是下一步花瓣摺的依據。',
    ops: precreaseOps(),
  },
  {
    title: '花瓣摺（前側）',
    desc: '沿剛才的摺痕，把左右兩片同時摺向中線，並順勢把下尖角往上翻起。摺完會出現一個細長的尖角，超出原本的上尖端。',
    ops: petalFoldOps(),
  },
  {
    title: '翻面',
    desc: '把整個作品左右翻面，準備在背面重複同樣的動作。',
    ops: [{ kind: 'turn', about: 'vertical' }],
  },
  {
    title: '背面也壓出摺痕',
    desc: '和第 3 步完全相同：把左下緣、右下緣摺到中線，再把上尖角往下摺，逐一攤開。',
    ops: precreaseOps(),
  },
  {
    title: '花瓣摺（背側）→ 鳥基本型',
    desc: '背面也做一次花瓣摺。完成後兩個細長尖角朝上、兩片寬的翅膀朝下，這是摺鶴、摺鷺等許多作品共用的「鳥基本型」。最後轉半圈，讓細尖角朝下。',
    ops: [...petalFoldOps(), { kind: 'spin', angle: 180, t0: 0.82, t1: 1 }],
  },
  {
    title: '收窄下方尖角（前側）',
    desc: '把朝下細尖角的左右兩邊都摺到中線，讓它變得更細。這一摺會同時帶動兩層紙，摺好之後就是頸子或尾巴的粗細。',
    ops: [narrowPoint('left', 0, 0.6), narrowPoint('right', 0.35, 1)],
  },
  {
    title: '收窄下方尖角（背側）',
    desc: '翻到背面，對另一個細尖角做完全相同的兩摺，然後翻回正面。兩個尖角現在一樣細，一個要變成頸子、一個變成尾巴。',
    ops: [
      { kind: 'turn', about: 'vertical', t0: 0, t1: 0.26 },
      narrowPoint('left', 0.3, 0.68),
      narrowPoint('right', 0.3, 0.68),
      { kind: 'turn', about: 'vertical', t0: 0.74, t1: 1 },
    ],
  },
  {
    title: '內翻摺：頸子與尾巴',
    desc: '把前面那個細尖角沿斜線往左上反摺成頸子，另一個往右上反摺成尾巴。兩個尖角原本重疊在一起，反摺到不同方向就分開了。',
    ops: [
      reverseFold(22.5, { top: POINT_LAYERS }, 'up', 0, 0.55),
      reverseFold(157.5, { bottom: POINT_LAYERS }, 'down', 0.42, 1),
    ],
  },
  {
    title: '摺出頭部',
    desc: '在頸子接近頂端的地方再做一次小的內翻摺，把尖端往前下方壓出鶴的頭與嘴。',
    ops: [
      {
        kind: 'fold',
        a: HEAD_Q,
        b: ray(HEAD_Q, 162.5),
        move: NECK_TIP,
        layers: { top: POINT_LAYERS },
        dir: 'up',
        crease: 'mountain',
      },
    ],
  },
  {
    title: '展開翅膀，完成',
    desc: '最後把兩片翅膀分別往前後拉開，讓身體立起來。紙鶴完成——拖曳畫面可以繞著它看，也可以拉動下方的進度條回看任何一摺。',
    ops: [
      // 用「蓋住翅膀尖端的紙層」指定前後翅，比用層號穩健
      {
        kind: 'fold',
        a: v2(-0.8, WING_HINGE),
        b: v2(0.8, WING_HINGE),
        move: v2(0, 1.2),
        layers: { at: v2(0, 1.2), pick: 'bottom' },
        dir: 'down',
        angle: 74,
        crease: 'mountain',
        t0: 0,
        t1: 0.55,
      },
      {
        kind: 'fold',
        a: v2(-0.8, WING_HINGE),
        b: v2(0.8, WING_HINGE),
        move: v2(0, 1.2),
        layers: { at: v2(0, 1.2), pick: 'top' },
        dir: 'up',
        angle: 74,
        crease: 'valley',
        t0: 0,
        t1: 0.55,
      },
      // 身體轉成直立，翅膀就會呈水平展開
      { kind: 'pose', axis: 'x', angle: 90, t0: 0.5, t1: 1 },
    ],
  },
]
