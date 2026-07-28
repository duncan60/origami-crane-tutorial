import { v2, type StepDef } from './fold'

/**
 * 武士帽（兜）摺法（中級）
 *
 * 座標系：對角線長 2√2 的菱形紙，攤平座標的 +y 是圖解中的「上方」。
 *
 * 全部由單純對摺組成，最厚約 9 層。傳統摺法的最後一步是把後片「塞進帽子內側」，
 * 塞入口袋不是鏡射能表達的動作，這裡採用常見的簡化版：把後片往後翻摺。
 */

/** 對摺後小菱形的半寬（√2/2），也是多條摺線的基準 */
const K = Math.SQRT1_2

export const kabutoSteps: StepDef[] = [
  {
    title: '對角對摺',
    desc: '菱形擺放、有顏色的一面朝下。上角往下摺到下角，壓平成一個朝下的大三角形。',
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
    title: '左右兩角摺到下尖角',
    desc: '把左角沿斜線往下摺，讓角尖對齊下方的尖角；右角也一樣。摺完變成一個小菱形。',
    ops: [
      {
        kind: 'fold',
        a: v2(0, 0),
        b: v2(-K, -K),
        move: v2(-1.2, -0.1),
        dir: 'up',
        crease: 'valley',
        t0: 0,
        t1: 0.55,
      },
      {
        kind: 'fold',
        a: v2(0, 0),
        b: v2(K, -K),
        move: v2(1.2, -0.1),
        dir: 'up',
        crease: 'valley',
        t0: 0.4,
        t1: 0.95,
      },
    ],
  },
  {
    title: '前面兩片尖角往上摺',
    desc: '剛才摺下來的兩片，尖角都在最下面。只拿最上面這兩片，把尖角往上摺到頂點——左右各一次。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, -K),
        b: v2(1, -K),
        move: v2(-0.15, -1.0),
        layers: { at: v2(-0.15, -1.0), pick: 'top', count: 2 },
        dir: 'up',
        crease: 'valley',
        t0: 0,
        t1: 0.55,
      },
      {
        kind: 'fold',
        a: v2(-1, -K),
        b: v2(1, -K),
        move: v2(0.15, -1.0),
        layers: { at: v2(0.15, -1.0), pick: 'top', count: 2 },
        dir: 'up',
        crease: 'valley',
        t0: 0.4,
        t1: 0.95,
        hideCrease: true,
      },
    ],
  },
  {
    title: '往外斜摺出兩支角',
    desc: '把剛才摺上來的兩個尖角分別往左右斜摺出去：摺線從兩片的基部中央往上斜，尖端翻到帽身外側——這就是武士帽的兩支角。',
    ops: [
      // 摺線從兩片的基部中央 (0,-K) 斜向上到帽身邊緣的 (∓0.257,-0.257)，
      // 尖端 (0,0) 因此翻到 (∓0.61,-0.35)，伸出帽身邊緣約 0.28，形成星形的角；
      // 帽身頂點留在中央成為雙峰。座標由參考圖解（圖5→圖6）反推。
      {
        kind: 'fold',
        a: v2(0, -K),
        b: v2(-0.257, -0.257),
        move: v2(-0.06, -0.45),
        layers: { at: v2(-0.06, -0.45), pick: 'top', count: 2 },
        dir: 'up',
        crease: 'valley',
        t0: 0,
        t1: 0.55,
      },
      {
        kind: 'fold',
        a: v2(0, -K),
        b: v2(0.257, -0.257),
        move: v2(0.06, -0.45),
        layers: { at: v2(0.06, -0.45), pick: 'top', count: 2 },
        dir: 'up',
        crease: 'valley',
        t0: 0.4,
        t1: 0.95,
      },
    ],
  },
  {
    title: '前層尖角往上摺',
    desc: '下方的尖角有前後兩層。只拿最前面那一層往上摺——白色的三角形會露出來，成為帽子正面的裝飾。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, -0.9),
        b: v2(1, -0.9),
        move: v2(0, -1.15),
        layers: { at: v2(0, -1.15), pick: 'top', count: 1 },
        dir: 'up',
        crease: 'valley',
      },
    ],
  },
  {
    title: '下緣再往上摺一次，成為帽簷',
    desc: '沿著帽身最寬的那條線，把前面的下緣整條再往上翻摺一次，形成水平的帽簷帶。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, -K),
        b: v2(1, -K),
        move: v2(0, -0.8),
        layers: { at: v2(0, -0.8), pick: 'top', count: 2 },
        dir: 'up',
        crease: 'valley',
      },
    ],
  },
  {
    title: '後層往後收，完成',
    desc: '剩下的後層往後翻摺（傳統摺法是塞進帽子內側的口袋，這裡用常見的簡化版）。武士帽完成——戴在指尖上試試。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, -K),
        b: v2(1, -K),
        move: v2(0, -1.15),
        layers: { at: v2(0, -1.15), pick: 'bottom', count: 1 },
        dir: 'down',
        crease: 'mountain',
        t0: 0,
        t1: 0.5,
      },
      { kind: 'pose', axis: 'x', angle: 90, t0: 0.55, t1: 1 },
    ],
  },
]
