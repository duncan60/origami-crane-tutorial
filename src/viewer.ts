import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  anglesAt,
  centroid,
  embed,
  matricesAt,
  rotationAboutLine,
  sheetOffsetAt,
  type Built,
  type BuiltFold,
} from './fold'

/**
 * 紙張厚度，用來把重疊的層錯開避免 z-fighting。
 *
 * 紙鶴最厚處有 14 層，所以這個值會被放大 14 倍；取太大會讓厚的部位（頸、尾）
 * 浮離身體而露出破面。只要大於深度緩衝的解析度就夠了。
 */
const SHEET = 0.0022

const COLOR_FRONT = 0xd2603f
const COLOR_BACK = 0xf2ebdf
const COLOR_EDGE = 0x3d2117
const COLOR_CREASE = 0xa8866c
const COLOR_VALLEY = 0x3f9dff
const COLOR_MOUNTAIN = 0xff5f82
const COLOR_ARROW = 0xffc061

const ARC_SEGMENTS = 16
/** 標示用緞帶的三角形上限 */
const MAX_MARK_TRIS = 700

interface Frame {
  target: Vector3
  distance: number
  dir: Vector3
}

/**
 * 把摺線與方向箭頭畫成有寬度的緞帶。WebGL 的線寬在多數瀏覽器都固定 1px，
 * 在 3D 場景裡太細看不清楚，所以改用薄的三角形帶。
 */
class RibbonBuffer {
  readonly geometry = new BufferGeometry()
  private pos: Float32Array
  private col: Float32Array
  private n = 0

  constructor(maxTris: number) {
    this.pos = new Float32Array(maxTris * 9)
    this.col = new Float32Array(maxTris * 9)
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3))
    this.geometry.setAttribute('color', new BufferAttribute(this.col, 3))
  }

  reset(): void {
    this.n = 0
  }

  tri(a: Vector3, b: Vector3, c: Vector3, color: Color): void {
    if ((this.n + 1) * 9 > this.pos.length) return
    const o = this.n * 9
    this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], o)
    for (let i = 0; i < 3; i++) this.col.set([color.r, color.g, color.b], o + i * 3)
    this.n++
  }

  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color): void {
    this.tri(a, b, c, color)
    this.tri(a, c, d, color)
  }

  commit(): void {
    this.geometry.setDrawRange(0, this.n * 3)
    this.geometry.getAttribute('position').needsUpdate = true
    this.geometry.getAttribute('color').needsUpdate = true
  }
}

interface FaceSlots {
  /** 每個多邊形頂點在位置緩衝區中的所有落點 */
  slots: number[][]
}

export class Viewer {
  private renderer: WebGLRenderer
  private scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly controls: OrbitControls

  private geometry = new BufferGeometry()
  private positions: Float32Array
  private faceSlots: FaceSlots[] = []

  private paperEdges: LineSegments
  private paperEdgePairs: [number, number, number][] = []
  private creaseEdges: LineSegments
  private creaseEdgePairs: [number, number, number, number][] = []

  private creaseMarks = new RibbonBuffer(MAX_MARK_TRIS)
  private arrowMarks = new RibbonBuffer(MAX_MARK_TRIS)

  private step = 0
  private t = 1
  private frames: Frame[] = []
  private tween: { from: Frame; to: Frame; start: number } | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private built: Built,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // 近裁剪面盡量拉遠（軌道最近距離是 1），深度緩衝的精度才夠分辨薄薄的紙層
    this.camera = new PerspectiveCamera(38, 1, 0.5, 40)
    this.controls = new OrbitControls(this.camera, canvas)
    this.computeFrames()
    this.applyFrame(this.frames[0])
    // 使用者一旦自己操作視角，就取消自動過渡，把控制權交還給他
    this.controls.addEventListener('start', () => (this.tween = null))
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 1
    this.controls.maxDistance = 16
    this.controls.minPolarAngle = 0.04
    this.controls.maxPolarAngle = Math.PI - 0.04

    // 紙鶴立起來之後會有整片翅膀背光，所以環境光和補光都給足，
    // 避免任何一面暗到看不出形狀
    this.scene.add(new HemisphereLight(0xfff6e8, 0x5c6272, 1.05))
    const key = new DirectionalLight(0xffffff, 1.25)
    key.position.set(2.4, 4.2, 2.8)
    this.scene.add(key)
    const fill = new DirectionalLight(0xc9d8ff, 0.7)
    fill.position.set(-2.8, 2.2, -2.4)
    this.scene.add(fill)
    const under = new DirectionalLight(0xffe6c8, 0.35)
    under.position.set(-0.6, -3, 1.4)
    this.scene.add(under)

    // ---- 紙面：起始時有顏色的一面朝下，所以朝上那面是白色紙背 ----
    this.positions = this.buildGeometry()
    this.scene.add(
      new Mesh(
        this.geometry,
        new MeshStandardMaterial({
          color: new Color(COLOR_BACK),
          roughness: 0.9,
          side: 0,
          flatShading: true,
        }),
      ),
      new Mesh(
        this.geometry,
        new MeshStandardMaterial({
          color: new Color(COLOR_FRONT),
          roughness: 0.82,
          side: 1,
          flatShading: true,
        }),
      ),
    )

    // ---- 紙張邊緣與已摺出的摺痕 ----
    this.paperEdges = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: COLOR_EDGE }),
    )
    this.creaseEdges = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: COLOR_CREASE, transparent: true, opacity: 0.5 }),
    )
    this.collectEdges()
    this.scene.add(this.paperEdges, this.creaseEdges)

    // ---- 本步驟的摺線標示（貼在紙面上）----
    const creaseMesh = new Mesh(
      this.creaseMarks.geometry,
      new MeshBasicMaterial({ vertexColors: true, side: 2 }),
    )
    creaseMesh.frustumCulled = false
    creaseMesh.renderOrder = 5
    this.scene.add(creaseMesh)

    // ---- 方向箭頭（永遠畫在最上層，不被紙擋住）----
    const arrowMesh = new Mesh(
      this.arrowMarks.geometry,
      new MeshBasicMaterial({ vertexColors: true, side: 2, depthTest: false, depthWrite: false }),
    )
    arrowMesh.frustumCulled = false
    arrowMesh.renderOrder = 10
    this.scene.add(arrowMesh)

    window.addEventListener('resize', this.resize)
    this.resize()
    this.renderer.setAnimationLoop(this.tick)
  }

  // -------------------------------------------------------------- 鏡頭框景

  /**
   * 每個步驟算一組框景。作品越接近攤平就越接近俯視（看摺線最清楚），
   * 立體起來之後自動降低仰角，完成的紙鶴便以接近側面的角度呈現。
   */
  private computeFrames(): void {
    for (let s = 0; s < this.built.nSteps; s++) {
      // 只取步驟的起點與終點這兩個靜止狀態。動畫中途紙片會短暫豎起來，
      // 若把那一瞬間也算進去，攤平的步驟會被誤判成立體的，仰角就會不必要地壓低。
      const box = new Box3()
      for (const t of [0, 1]) {
        const mats = matricesAt(this.built, s, t)
        this.built.faces.forEach((f, i) => {
          for (const p of f.poly) box.expandByPoint(embed(p).applyMatrix4(mats[i]))
        })
      }
      const size = box.getSize(new Vector3())
      const radius = Math.max(size.x, size.y, size.z, 0.6) / 2
      const upright = Math.min(1, size.y / (Math.max(size.x, size.z) * 0.6))
      const el = ((62 - 42 * upright) * Math.PI) / 180
      const az = (20 * Math.PI) / 180
      this.frames.push({
        target: box.getCenter(new Vector3()),
        distance: (radius / Math.tan(((this.camera.fov / 2) * Math.PI) / 180)) * 1.5,
        dir: new Vector3(
          Math.sin(az) * Math.cos(el),
          Math.sin(el),
          Math.cos(az) * Math.cos(el),
        ).normalize(),
      })
    }
  }

  private applyFrame(f: Frame): void {
    this.controls.target.copy(f.target)
    this.camera.position.copy(f.target).add(f.dir.clone().multiplyScalar(f.distance))
  }

  private currentFrame(): Frame {
    const offset = new Vector3().subVectors(this.camera.position, this.controls.target)
    return {
      target: this.controls.target.clone(),
      distance: offset.length(),
      dir: offset.normalize(),
    }
  }

  /** 用時間戳推進，掉幀（例如分頁在背景）也不會讓過渡卡住 */
  private advanceTween(): void {
    if (!this.tween) return
    const k = Math.min(1, (performance.now() - this.tween.start) / 550)
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    const { from, to } = this.tween
    this.applyFrame({
      target: from.target.clone().lerp(to.target, e),
      distance: from.distance + (to.distance - from.distance) * e,
      dir: from.dir.clone().lerp(to.dir, e).normalize(),
    })
    if (k >= 1) this.tween = null
  }

  // -------------------------------------------------------------- 建立幾何

  private buildGeometry(): Float32Array {
    let triVerts = 0
    for (const f of this.built.faces) triVerts += (f.poly.length - 2) * 3
    const positions = new Float32Array(triVerts * 3)

    let slot = 0
    for (const face of this.built.faces) {
      const slots: number[][] = face.poly.map(() => [])
      for (let i = 1; i + 1 < face.poly.length; i++) {
        for (const v of [0, i, i + 1]) {
          slots[v].push(slot)
          slot++
        }
      }
      this.faceSlots.push({ slots })
    }

    this.geometry.setAttribute('position', new BufferAttribute(positions, 3))
    this.geometry.computeVertexNormals()
    return positions
  }

  private collectEdges(): void {
    this.built.faces.forEach((face, fi) => {
      for (let i = 0; i < face.poly.length; i++) {
        const j = (i + 1) % face.poly.length
        const tag = face.tags[i]
        if (tag < 0) this.paperEdgePairs.push([fi, i, j])
        else this.creaseEdgePairs.push([fi, i, j, tag])
      }
    })
    const alloc = (n: number): BufferGeometry => {
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 6), 3))
      return g
    }
    this.paperEdges.geometry = alloc(this.paperEdgePairs.length)
    this.paperEdges.frustumCulled = false
    this.creaseEdges.geometry = alloc(this.creaseEdgePairs.length)
    this.creaseEdges.frustumCulled = false
  }

  // -------------------------------------------------------------- 每幀更新

  setState(step: number, t: number): void {
    if (step !== this.step) {
      this.tween = { from: this.currentFrame(), to: this.frames[step], start: performance.now() }
    }
    this.step = step
    this.t = t
    this.advanceTween()
    this.update()
  }

  private update(): void {
    const { built, step, t } = this
    const mats = matricesAt(built, step, t)
    const angles = anglesAt(built, step, t)

    // 各面的頂點位置（含層間厚度偏移）
    const worldVerts: Vector3[][] = []
    built.faces.forEach((face, fi) => {
      const m = mats[fi]
      const off = new Vector3(0, 1, 0)
        .transformDirection(m)
        .multiplyScalar(SHEET * sheetOffsetAt(built, fi, step, t))
      const verts = face.poly.map((p) => embed(p).applyMatrix4(m).add(off))
      worldVerts.push(verts)
      const slots = this.faceSlots[fi].slots
      for (let v = 0; v < verts.length; v++) {
        for (const s of slots[v]) {
          this.positions[s * 3] = verts[v].x
          this.positions[s * 3 + 1] = verts[v].y
          this.positions[s * 3 + 2] = verts[v].z
        }
      }
    })
    this.geometry.getAttribute('position').needsUpdate = true
    this.geometry.computeVertexNormals()

    const writePairs = (
      target: LineSegments,
      pairs: [number, number, number, number?][],
      visible: (tag: number | undefined) => boolean,
    ): void => {
      const attr = target.geometry.getAttribute('position') as BufferAttribute
      const arr = attr.array as Float32Array
      pairs.forEach(([fi, i, j, tag], k) => {
        const a = worldVerts[fi][i]
        const b = visible(tag) ? worldVerts[fi][j] : a
        arr.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6)
      })
      attr.needsUpdate = true
    }
    writePairs(this.paperEdges, this.paperEdgePairs, () => true)
    writePairs(this.creaseEdges, this.creaseEdgePairs, (tag) => {
      const f = built.folds[tag!]
      return f !== undefined && (f.step < step || (f.step === step && angles[f.id] !== 0))
    })

    // 本步驟尚未完成的摺線，以及下一個動作的箭頭
    const pending = built.folds.filter(
      (f) => f.step === step && f.showCrease && f.kind === 'fold' && t < f.t1 - 1e-6,
    )
    this.creaseMarks.reset()
    for (const f of pending) this.drawCrease(f, mats)
    this.creaseMarks.commit()

    const next = pending.reduce<BuiltFold | null>(
      (best, f) => (best === null || f.t0 < best.t0 ? f : best),
      null,
    )
    this.arrowMarks.reset()
    if (next) this.drawArrow(next, mats, angles)
    this.arrowMarks.commit()
  }

  /** 摺線畫成貼在紙面上的虛線：谷摺長虛線，山摺點線 */
  private drawCrease(fold: BuiltFold, mats: Matrix4[]): void {
    const m = mats[fold.repIndex]
    const n = new Vector3(0, 1, 0).transformDirection(m)
    // 代表面本身因為紙張厚度已經被推離基準面，標示要跟著推同樣的量才不會被紙面蓋住
    const sheet = n
      .clone()
      .multiplyScalar(SHEET * sheetOffsetAt(this.built, fold.repIndex, this.step, this.t))
    const a = embed(fold.creasePaper![0]).applyMatrix4(m).add(sheet)
    const b = embed(fold.creasePaper![1]).applyMatrix4(m).add(sheet)
    const dir = new Vector3().subVectors(b, a)
    const len = dir.length()
    if (len < 1e-6) return
    dir.normalize()

    const mountain = fold.creaseType === 'mountain'
    const color = new Color(mountain ? COLOR_MOUNTAIN : COLOR_VALLEY)
    const dash = mountain ? 0.022 : 0.062
    const gap = mountain ? 0.032 : 0.042
    const side = new Vector3().crossVectors(n, dir).normalize().multiplyScalar(0.011)
    // 兩面都抬離紙面，從正反面看都不會被紙面吃掉
    const lift = n.clone().multiplyScalar(0.006)

    for (let s = 0; s < len - 1e-6; s += dash + gap) {
      const e = Math.min(len, s + dash)
      for (const l of [lift, lift.clone().negate()]) {
        const p0 = a.clone().addScaledVector(dir, s).add(l)
        const p1 = a.clone().addScaledVector(dir, e).add(l)
        this.creaseMarks.quad(
          p0.clone().add(side),
          p1.clone().add(side),
          p1.clone().sub(side),
          p0.clone().sub(side),
          color,
        )
      }
    }
  }

  /** 沿實際旋轉軸掃出一段弧線，末端加箭頭，顯示這一摺還要轉多少 */
  private drawArrow(fold: BuiltFold, mats: Matrix4[], angles: number[]): void {
    const remaining = fold.angle * fold.sign - angles[fold.id]
    if (Math.abs(remaining) < 5) return

    const m = mats[fold.repIndex]
    const A = embed(fold.axisPaper![0]).applyMatrix4(m)
    const B = embed(fold.axisPaper![1]).applyMatrix4(m)
    const start = new Vector3()
    for (const idx of fold.affected) {
      start.add(embed(centroid(this.built.faces[idx].poly)).applyMatrix4(mats[idx]))
    }
    start.divideScalar(fold.affected.length)

    const pts: Vector3[] = []
    for (let k = 0; k <= ARC_SEGMENTS; k++) {
      pts.push(start.clone().applyMatrix4(rotationAboutLine(A, B, (remaining * k) / ARC_SEGMENTS)))
    }

    const color = new Color(COLOR_ARROW)
    const width = 0.014
    const sideAt = (i: number): Vector3 => {
      const tangent = new Vector3().subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])
      const view = new Vector3().subVectors(this.camera.position, pts[i])
      return new Vector3().crossVectors(tangent, view).normalize().multiplyScalar(width)
    }
    // 弧線本體留一小段給箭頭
    const bodyEnd = pts.length - 3
    for (let i = 0; i < bodyEnd; i++) {
      const s0 = sideAt(i)
      const s1 = sideAt(i + 1)
      this.arrowMarks.quad(
        pts[i].clone().add(s0),
        pts[i + 1].clone().add(s1),
        pts[i + 1].clone().sub(s1),
        pts[i].clone().sub(s0),
        color,
      )
    }
    const tip = pts[pts.length - 1]
    const base = pts[bodyEnd]
    const headSide = sideAt(bodyEnd).multiplyScalar(3.4)
    this.arrowMarks.tri(tip, base.clone().add(headSide), base.clone().sub(headSide), color)
  }

  // -------------------------------------------------------------- 生命週期

  private resize = (): void => {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private tick = (): void => {
    this.advanceTween()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
