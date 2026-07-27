import './style.css'
import { buildModel, embed, matricesAt, type Built } from './fold'
import { models, paperColors, type ModelDef } from './models'
import { selftest } from './selftest'
import { Viewer } from './viewer'

// 這支程式在 module 層建立 Viewer 並綁定事件，熱更新會疊出第二份實例，
// 所以任何改動都直接整頁重載。
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
let canvas = el<HTMLCanvasElement>('canvas')
const scrub = el<HTMLInputElement>('scrub')
const scrubLabel = el('scrub-label')
const stepCounter = el('step-counter')
const stepTitle = el('step-title')
const stepDesc = el('step-desc')
const stepList = el('step-list')
const modelTabs = el('model-tabs')
const modelName = el('model-name')
const palette = el('palette')
const btnPrev = el<HTMLButtonElement>('btn-prev')
const btnNext = el<HTMLButtonElement>('btn-next')
const btnPlay = el<HTMLButtonElement>('btn-play')
const btnReplay = el<HTMLButtonElement>('btn-replay')

let model: ModelDef = models[0]
let built: Built
let viewer: Viewer | null = null
let durations: number[] = []
let step = 0
let t = 1
let playing = false
let lastFrame = 0

const COLOR_KEY = 'origami-paper-color'

function savedColor(): number {
  const raw = Number(localStorage.getItem(COLOR_KEY))
  return paperColors.some((c) => c.hex === raw) ? raw : paperColors[0].hex
}

// ---------------------------------------------------------------- 狀態同步

function render(): void {
  viewer?.setState(step, t)
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

// ---------------------------------------------------------------- 載入作品

function loadModel(m: ModelDef): void {
  model = m
  built = buildModel(m.paper, m.steps)

  // 換一塊全新的 canvas，避免舊的 WebGL context 殘留狀態
  viewer?.dispose()
  const fresh = canvas.cloneNode(false) as HTMLCanvasElement
  canvas.replaceWith(fresh)
  canvas = fresh
  viewer = new Viewer(canvas, built)
  viewer.setPaperColor(savedColor())

  // 子摺越多的步驟播放時間越長
  durations = built.steps.map((_, i) => {
    const n = built.folds.filter((f) => f.step === i).length
    return 1100 + 520 * Math.max(0, n - 1)
  })

  modelName.textContent = m.name
  document.title = `${m.name}摺紙教學 · 3D 互動`
  modelTabs.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.id === m.id)
  })

  stepList.innerHTML = ''
  built.steps.forEach((s, i) => {
    const btn = document.createElement('button')
    btn.className = 'step-item'
    btn.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span>${s.title}</span>`
    btn.addEventListener('click', () => goTo(i))
    stepList.append(btn)
  })

  exposeDebug()
  goTo(0)
}

// ---------------------------------------------------------------- 作品切換器

models.forEach((m) => {
  const btn = document.createElement('button')
  btn.dataset.id = m.id
  btn.innerHTML = `${m.name}<span class="diff">${m.difficulty}</span>`
  btn.addEventListener('click', () => {
    if (model.id === m.id) return
    history.replaceState(null, '', `#${m.id}`)
    loadModel(m)
  })
  modelTabs.append(btn)
})

window.addEventListener('hashchange', () => {
  const m = models.find((x) => x.id === location.hash.slice(1))
  if (m && m.id !== model.id) loadModel(m)
})

// ---------------------------------------------------------------- 色盤

paperColors.forEach((c) => {
  const btn = document.createElement('button')
  btn.className = 'swatch-btn'
  btn.title = c.name
  btn.setAttribute('aria-label', `紙色：${c.name}`)
  btn.style.background = `#${c.hex.toString(16).padStart(6, '0')}`
  btn.addEventListener('click', () => {
    localStorage.setItem(COLOR_KEY, String(c.hex))
    viewer?.setPaperColor(c.hex)
    palette.querySelectorAll('.swatch-btn').forEach((b) => b.classList.toggle('active', b === btn))
  })
  palette.append(btn)
})
palette.querySelectorAll('.swatch-btn').forEach((b, i) => {
  b.classList.toggle('active', paperColors[i].hex === savedColor())
})

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
  // 焦點在進度條上時，方向鍵留給滑桿本身，否則會同時跳步驟
  if (e.target === scrub) return
  if (e.key === 'ArrowRight') goTo(step + 1)
  else if (e.key === 'ArrowLeft') goTo(step - 1)
  else if (e.key === ' ') {
    e.preventDefault()
    btnPlay.click()
  }
})

// ---------------------------------------------------------------- 除錯介面

function exposeDebug(): void {
  const w = window as unknown as Record<string, unknown>
  w.__built = built
  w.__viewer = viewer

  // 編寫摺法時用來查座標與層序
  w.__dump = (s: number): string =>
    built.snapshots[s]
      .map(
        (f) =>
          `L${f.layer}  ${f.poly.map((p) => `(${p.x.toFixed(3)},${p.y.toFixed(3)})`).join(' ')}`,
      )
      .join('\n')

  // 檢查某個時刻的 3D 幾何是否確實攤平（摺平狀態下 y 應該全為 0）
  w.__probe = (s: number, tt: number): string => {
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

  // 一次跑完所有幾何不變量檢查
  w.__selftest = (): string => {
    const paperArea =
      Math.abs(
        model.paper.reduce((s, p, i) => {
          const q = model.paper[(i + 1) % model.paper.length]
          return s + p.x * q.y - q.x * p.y
        }, 0),
      ) / 2
    return selftest(built, paperArea)
  }
}

// ---------------------------------------------------------------- 啟動

loadModel(models.find((m) => m.id === location.hash.slice(1)) ?? models[1])
