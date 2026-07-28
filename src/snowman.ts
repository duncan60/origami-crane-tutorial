import { v2, type StepDef } from './fold'

/**
 * 雪人摺法（高級）
 *
 * 依 howorigami「雪人」圖解（15 步）改寫為 12 步。座標系：對角線長 2√2 的
 * 菱形紙，+y 是圖解中的「上方」。紙的白面朝上、有色面朝下——帽子與底座
 * 會在摺疊過程中翻出有色面。
 *
 * 全程只用單純對摺與蛇腹摺（兩個接續的鏡射摺），沒有花瓣摺或塞口袋。
 * 蛇腹摺的第二摺用 movedBy 選層器，把第一摺剛移動的整疊紙摺回來。
 */

const R = Math.SQRT2
const H = Math.SQRT1_2 // 0.7071

export const snowmanSteps: StepDef[] = [
  {
    title: '壓出十字摺痕',
    desc: '菱形擺放、白面朝上。先沿垂直軸對摺壓實再攤開，再沿水平軸對摺攤開。這兩條摺痕是之後對齊的基準。',
    ops: [
      {
        kind: 'fold',
        a: v2(0, -R),
        b: v2(0, R),
        move: v2(0.6, 0),
        dir: 'up',
        crease: 'valley',
        ref: 'cx',
        t0: 0,
        t1: 0.3,
      },
      { kind: 'unfold', ref: 'cx', t0: 0.32, t1: 0.46 },
      {
        kind: 'fold',
        a: v2(-R, 0),
        b: v2(R, 0),
        move: v2(0, 0.6),
        dir: 'up',
        crease: 'valley',
        ref: 'cy',
        t0: 0.52,
        t1: 0.82,
      },
      { kind: 'unfold', ref: 'cy', t0: 0.84, t1: 1 },
    ],
  },
  {
    title: '壓出對角摺痕',
    desc: '兩條斜對角線也各對摺一次、壓實攤開。摺痕交會的中心點，就是下一步帽尖要對齊的位置。',
    ops: [
      {
        kind: 'fold',
        a: v2(-H, -H),
        b: v2(H, H),
        move: v2(-0.5, 0.5),
        dir: 'up',
        crease: 'valley',
        ref: 'd1',
        t0: 0,
        t1: 0.3,
      },
      { kind: 'unfold', ref: 'd1', t0: 0.32, t1: 0.46 },
      {
        kind: 'fold',
        a: v2(-H, H),
        b: v2(H, -H),
        move: v2(0.5, 0.5),
        dir: 'up',
        crease: 'valley',
        ref: 'd2',
        t0: 0.52,
        t1: 0.82,
      },
      { kind: 'unfold', ref: 'd2', t0: 0.84, t1: 1 },
    ],
  },
  {
    title: '上角摺到中心點',
    desc: '把上角往下摺到摺痕的交會中心，壓平。翻下來的三角形露出紙的顏色——這會成為雪人的帽子。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, H),
        b: v2(1, H),
        move: v2(0, 1.1),
        dir: 'up',
        crease: 'valley',
        ref: 'hat',
      },
    ],
  },
  {
    title: '壓出帽子的半線',
    desc: '只拿剛才翻下來的這一片：把尖端往上摺到上緣、壓實，再攤開。這條摺痕是帽簷的基準。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, H / 2),
        b: v2(1, H / 2),
        move: v2(0, 0.1),
        layers: { movedBy: 'hat' },
        dir: 'up',
        crease: 'valley',
        ref: 'hatHalf',
        t0: 0,
        t1: 0.55,
      },
      { kind: 'unfold', ref: 'hatHalf', t0: 0.6, t1: 1 },
    ],
  },
  {
    title: '尖端往上小摺',
    desc: '把帽子這片的尖端沿一條靠近尖端的線往上摺一小段，白色的小三角形會露出來。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, 0.16),
        b: v2(1, 0.16),
        move: v2(0, 0.04),
        layers: { movedBy: 'hat' },
        dir: 'up',
        crease: 'valley',
      },
    ],
  },
  {
    title: '蛇腹摺出帽簷',
    desc: '把帽子這片沿半線往上翻，再沿稍高的線摺回來——一上一下的蛇腹摺會在帽子下緣露出一條白色的帽簷。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, 0.42),
        b: v2(1, 0.42),
        move: v2(0, 0.2),
        layers: { movedBy: 'hat' },
        dir: 'up',
        crease: 'valley',
        ref: 'pl1',
        t0: 0,
        t1: 0.5,
      },
      {
        kind: 'fold',
        a: v2(-1, 0.52),
        b: v2(1, 0.52),
        move: v2(0, 0.7),
        layers: { movedBy: 'pl1' },
        dir: 'down',
        crease: 'mountain',
        t0: 0.5,
        t1: 1,
      },
    ],
  },
  {
    title: '翻面',
    desc: '整個作品左右翻面。帽子在背面壓好了，接下來在這一面摺出雪人的身體。',
    ops: [{ kind: 'turn', about: 'vertical' }],
  },
  {
    title: '左右兩角摺到中下',
    desc: '把左右兩角沿「從上緣正中央出發」的斜線往內摺，角尖落在中線旁靠下的位置。摺完平頂消失、頂端變成尖點，帽子的兩側也被包到正面。',
    ops: [
      // 兩條摺線都通過上緣中點 (0, 0.7071)——這讓平頂的左右兩半整個被摺走，
      // 頂端收成尖點，背面帽子的外側同時包到正面（對照圖10→圖11）。
      {
        kind: 'fold',
        a: v2(0, H),
        b: v2(-0.565, -0.118),
        move: v2(-1.2, -0.05),
        dir: 'up',
        crease: 'valley',
        t0: 0,
        t1: 0.55,
      },
      {
        kind: 'fold',
        a: v2(0, H),
        b: v2(0.565, -0.118),
        move: v2(1.2, -0.05),
        dir: 'up',
        crease: 'valley',
        t0: 0.4,
        t1: 0.95,
      },
    ],
  },
  {
    title: '蛇腹摺分出頭和身體',
    desc: '沿中間偏上的兩條線做一次蛇腹摺：整疊往上翻、再摺回來。這道階梯把上半段變成頭、下半段變成身體。',
    ops: [
      {
        kind: 'fold',
        a: v2(-2, -0.1),
        b: v2(2, -0.1),
        move: v2(0, -0.6),
        dir: 'up',
        crease: 'valley',
        ref: 'body1',
        t0: 0,
        t1: 0.5,
      },
      {
        kind: 'fold',
        a: v2(-2, 0.06),
        b: v2(2, 0.06),
        move: v2(0, 0.8),
        layers: { movedBy: 'body1' },
        dir: 'up',
        crease: 'mountain',
        t0: 0.5,
        t1: 1,
      },
    ],
  },
  {
    title: '兩側往內摺，收出身形',
    desc: '沿兩條略斜的線把左右兩側往內摺：上窄下寬，收出頭的輪廓和微微展開的身體。',
    ops: [
      {
        kind: 'fold',
        a: v2(-0.33, 0.9),
        b: v2(-0.52, -1.2),
        move: v2(-1.0, -0.2),
        dir: 'up',
        crease: 'valley',
        t0: 0,
        t1: 0.55,
      },
      {
        kind: 'fold',
        a: v2(0.33, 0.9),
        b: v2(0.52, -1.2),
        move: v2(1.0, -0.2),
        dir: 'up',
        crease: 'valley',
        t0: 0.4,
        t1: 0.95,
      },
    ],
  },
  {
    title: '底角往上摺平',
    desc: '把最下面的尖角沿橫線往上翻摺，蓋住身體下緣——雪人的底就平了，也站得穩。',
    ops: [
      {
        kind: 'fold',
        a: v2(-1, -0.55),
        b: v2(1, -0.55),
        move: v2(0, -0.8),
        dir: 'up',
        crease: 'valley',
      },
    ],
  },
  {
    title: '翻回正面，完成',
    desc: '翻回正面——戴帽子的雪人完成了。可以畫上眼睛、紅蘿蔔鼻子和鈕扣。拖曳畫面可以旋轉觀看，進度條可以回看每一摺。',
    ops: [
      { kind: 'turn', about: 'vertical', t0: 0, t1: 0.5 },
      { kind: 'pose', axis: 'x', angle: 90, t0: 0.55, t1: 1 },
    ],
  },
]
