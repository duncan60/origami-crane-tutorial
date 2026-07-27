import './style.css'
import { buildModel, embed, matricesAt, v2, type Built } from './fold'
import { craneSteps } from './crane'
import { Viewer } from './viewer'

// 這支程式在 module 層建立 Viewer 並綁定事件，熱更新會疊出第二份實例，
// 所以任何改動都直接整頁重載。
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())

const PAPER = [v2(-1, -1), v2(1, -1), v2(1, 1), v2(-1, 1)]

const built: Built = buildModel(PAPER, craneSteps)

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const canvas = el<HTMLCanvasElement>('canvas')
const scrub = el<HTMLInputElement>('scrub')
const scrubLabel = el('scrub-label')
const stepCounter = el('step-counter')
const stepTitle = el('step-title')
const stepDesc = el('step-desc')
const stepList = el('step-list')
const btnPrev = el<HTMLButtonElement>('btn-prev')
const btnNext = el<HTMLButtonElement>('btn-next')
const btnPlay = el<HTMLButtonElement>('btn-play')
const btnReplay = el<HTMLButtonElement>('btn-replay')

const viewer = new Viewer(canvas, built)

/** 每個步驟的動畫長度：子摺越多就播久一點 */
const durations = built.steps.map((_, i) => {
  const n = built.folds.filter((f) => f.step === i).length
  return 1100 + 520 * Math.max(0, n - 1)
})

let step = 0
let t = 1
let playing = false
let lastFrame = 0

// ---------------------------------------------------------------- 步驟列表

built.steps.forEach((s, i) => {
  const btn = document.createElement('button')
  btn.className = 'step-item'
  btn.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span>${s.title}</span>`
  btn.addEventListener('click', () => goTo(i))
  stepList.append(btn)
})

// ---------------------------------------------------------------- 狀態同步

function render(): void {
  viewer.setState(step, t)
  scrub.value = String(Math.round(t * 1000))
  scrubLabel.textContent = `${Math.round(t * 100)}%`
}

function syncChrome(): void {
  stepCounter.textContent = `步驟 ${step + 1} / ${built.nSteps}`
  stepTitle.textContent = built.steps[step].title
  stepDesc.textContent = built.steps[step].desc
  stepList.querySelectorAll('.step-item').forEach((node, i) => {
    node.classList.toggle('active', i === step)
    node.classList.toggle('done', i < step)
  })
  btnPrev.disabled = step === 0
  btnNext.disabled = step === built.nSteps - 1
  btnPlay.textContent = playing ? '❚❚ 暫停' : '▶ 播放'
}

function goTo(next: number, autoplay = true): void {
  step = Math.min(built.nSteps - 1, Math.max(0, next))
  t = autoplay ? 0 : 1
  playing = autoplay
  lastFrame = performance.now()
  syncChrome()
  render()
}

// ---------------------------------------------------------------- 播放迴圈

function frame(now: number): void {
  requestAnimationFrame(frame)
  if (!playing) return
  const dt = now - lastFrame
  lastFrame = now
  t = Math.min(1, t + dt / durations[step])
  if (t >= 1) {
    playing = false
    syncChrome()
  }
  render()
}
requestAnimationFrame(frame)

// ---------------------------------------------------------------- 互動

btnPrev.addEventListener('click', () => goTo(step - 1))
btnNext.addEventListener('click', () => goTo(step + 1))
btnReplay.addEventListener('click', () => {
  t = 0
  playing = true
  lastFrame = performance.now()
  syncChrome()
  render()
})
btnPlay.addEventListener('click', () => {
  if (playing) {
    playing = false
  } else {
    if (t >= 1) t = 0
    playing = true
    lastFrame = performance.now()
  }
  syncChrome()
})
scrub.addEventListener('input', () => {
  playing = false
  t = Number(scrub.value) / 1000
  syncChrome()
  render()
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') goTo(step + 1)
  else if (e.key === 'ArrowLeft') goTo(step - 1)
  else if (e.key === ' ') {
    e.preventDefault()
    btnPlay.click()
  }
})

goTo(0)

// 編寫摺法時用來查座標與層序：在主控台呼叫 __dump(步驟編號)
;(window as unknown as Record<string, unknown>).__dump = (s: number): string =>
  built.snapshots[s]
    .map(
      (f) =>
        `L${f.layer}  ${f.poly.map((p) => `(${p.x.toFixed(3)},${p.y.toFixed(3)})`).join(' ')}`,
    )
    .join('\n')
;(window as unknown as Record<string, unknown>).__built = built
;(window as unknown as Record<string, unknown>).__viewer = viewer

// 檢查某個時刻的 3D 幾何是否確實攤平（摺平狀態下 y 應該全為 0）
;(window as unknown as Record<string, unknown>).__probe = (s: number, tt: number): string => {
  const mats = matricesAt(built, s, tt)
  let lo = Infinity
  let hi = -Infinity
  const bad: string[] = []
  built.faces.forEach((f, i) => {
    for (const p of f.poly) {
      const q = embed(p).applyMatrix4(mats[i])
      lo = Math.min(lo, q.y)
      hi = Math.max(hi, q.y)
      if (Math.abs(q.y) > 1e-4 && bad.length < 12) {
        bad.push(`face ${i} chain[${f.chain}] → y=${q.y.toFixed(3)}`)
      }
    }
  })
  return `y ∈ [${lo.toFixed(4)}, ${hi.toFixed(4)}]\n${bad.join('\n')}`
}
