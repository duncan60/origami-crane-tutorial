import { v2, type StepDef } from './fold'

/**
 * 狗臉摺法（入門）
 *
 * 座標系：對角線長 2√2 的菱形紙（正方形轉 45°），攤平座標的 +y 是圖解中的「上方」。
 * 三摺完成：對角對摺 → 兩隻耳朵 → 鼻子。最厚只有 4 層，適合當第一課。
 */

export const dogSteps: StepDef[] = [
  {
    title: '對角對摺成三角形',
    desc: '把正方形紙轉成菱形擺放、有顏色的一面朝下。上角往下摺到下角，對齊壓平，變成一個朝下的三角形。',
    ops: [
      {
        kind: 'fold',
        a: v2(-Math.SQRT2, 0),
        b: v2(Math.SQRT2, 0),
        move: v2(0, 0.7),
        dir: 'up',
        crease: 'valley',
      },
    ],
  },
  {
    title: '摺下兩隻耳朵',
    desc: '把左角沿斜線往下摺，讓角尖垂下來變成耳朵；右邊也一樣。耳朵的角度可以自己決定，斜一點就是垂耳狗。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1.132, -0.475),
        b: v2(-0.182, 0.089),
        move: v2(-1.35, -0.02),
        dir: 'up',
        crease: 'valley',
        t0: 0,
        t1: 0.55,
      },
      {
        kind: 'fold',
        a: v2(1.132, -0.475),
        b: v2(0.182, 0.089),
        move: v2(1.35, -0.02),
        dir: 'up',
        crease: 'valley',
        t0: 0.4,
        t1: 0.95,
      },
    ],
  },
  {
    title: '摺出鼻子，完成',
    desc: '把下方的尖角往上摺一小段，就是狗狗的鼻子。完成——可以在臉上畫眼睛和鼻頭。拖曳畫面可以旋轉觀看，進度條可以回看每一摺。',
    ops: [
      {
        kind: 'fold',
        a: v2(-0.8, -0.95),
        b: v2(0.8, -0.95),
        move: v2(0, -1.2),
        dir: 'up',
        crease: 'valley',
        t0: 0,
        t1: 0.55,
      },
      { kind: 'pose', axis: 'x', angle: 90, t0: 0.55, t1: 1 },
    ],
  },
]
