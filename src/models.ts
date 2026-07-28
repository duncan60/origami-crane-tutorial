import { v2, type StepDef, type Vec2 } from './fold'
import { dogSteps } from './dog'
import { planePaper, planeSteps } from './plane'
import { kabutoSteps } from './kabuto'
import { snowmanSteps } from './snowman'

export interface ModelDef {
  id: string
  name: string
  difficulty: '入門' | '初級' | '中級' | '高級'
  paper: Vec2[]
  steps: StepDef[]
}

/** 正方形轉 45° 的菱形紙，對角線長 2√2（面積 4） */
const diamond: Vec2[] = [
  v2(0, -Math.SQRT2),
  v2(Math.SQRT2, 0),
  v2(0, Math.SQRT2),
  v2(-Math.SQRT2, 0),
]

export const models: ModelDef[] = [
  { id: 'dog', name: '狗臉', difficulty: '入門', paper: diamond, steps: dogSteps },
  { id: 'plane', name: '紙飛機', difficulty: '初級', paper: planePaper, steps: planeSteps },
  { id: 'kabuto', name: '武士帽', difficulty: '中級', paper: diamond, steps: kabutoSteps },
  { id: 'snowman', name: '雪人', difficulty: '高級', paper: diamond, steps: snowmanSteps },
]

/** 色盤：紙張有顏色那一面的選項（紙背固定為米白） */
export const paperColors: { name: string; hex: number }[] = [
  { name: '柿橘', hex: 0xd2603f },
  { name: '緋紅', hex: 0xc94f5c },
  { name: '湖藍', hex: 0x3f7fb8 },
  { name: '松綠', hex: 0x4f9d6b },
  { name: '紫藤', hex: 0x8a6fc9 },
  { name: '金黃', hex: 0xd9a13b },
  { name: '墨灰', hex: 0x4a505c },
]
