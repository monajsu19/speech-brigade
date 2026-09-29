// Adapted from /Users/mona/Projects/RandomTopicGenerator/spinner.js — original IIFE
// rewrapped as an ES module and themed for the site palette. Physics, drag,
// and audio behavior are unchanged.

const FRICTION = 0.985
const STOP_THRESHOLD = 1.5
const SPRING_DURATION_MS = 650
const MAX_ANGLE = 180
const DRAG_SENSITIVITY = 280
const MIN_PULL_VELOCITY = 20
const PULL_VELOCITY_RANGE = 35
const CLICK_VELOCITY = 30

const DEFAULTS = {
  itemHeight: 130,
  windowHeight: 390,
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: '1.75rem',
  color: '#1A3C34',
  accent: '#135248',
  knobColor: '#135248',
  showLever: false,
  showButton: false,
  buttonLabel: 'Spin!',
  sound: true,
}

let cssInjected = false
function injectCSS(accent) {
  if (cssInjected) return
  cssInjected = true
  const css = `
.spinner-root { display: flex; align-items: stretch; gap: 16px; font-family: inherit; width: 100%; }
.spinner-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }

.spinner-window {
  width: 100%;
  min-width: 0;
  position: relative;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%);
}

.spinner-strip {
  position: absolute;
  width: 100%;
  left: 0;
  top: 0;
  will-change: transform;
}

.spinner-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.2;
  padding: 0 1.25rem;
  user-select: none;
  overflow-wrap: break-word;
  word-wrap: break-word;
  transform-origin: center center;
  font-weight: 700;
}

.spinner-center-line {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 92%;
  border-top: 1px solid rgba(19, 82, 72, 0.15);
  border-bottom: 1px solid rgba(19, 82, 72, 0.15);
  pointer-events: none;
  z-index: 2;
}

.spinner-strip.settled .spinner-item {
  opacity: 0.25;
  transform: scale(1);
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.spinner-strip.settled .spinner-item.landed {
  opacity: 1;
  transform: scale(1.35);
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
  z-index: 5;
  position: relative;
}

.spinner-lever { width: 60px; flex-shrink: 0; position: relative; overflow: visible; }
.spinner-pivot {
  position: absolute; bottom: 173px; left: 50%; transform: translateX(-50%);
  width: 24px; height: 24px; border-radius: 50%;
  background: radial-gradient(circle at 40% 40%, ${accent}, ${accent});
  border: 2px solid ${accent};
  z-index: 4;
}
.spinner-arm {
  position: absolute; bottom: 185px; left: 50%; margin-left: -3px;
  width: 6px; height: 80px;
  transform-origin: center bottom;
  transform: rotate(0deg);
  z-index: 3;
}
.spinner-shaft {
  width: 6px; height: 100%; border-radius: 3px;
  background: ${accent};
}
.spinner-knob {
  position: absolute; top: -20px; left: 50%; transform: translateX(-50%);
  width: 44px; height: 44px; border-radius: 50%;
  border: 2px solid ${accent};
  cursor: grab; touch-action: none;
  display: flex; align-items: center; justify-content: center;
}
.spinner-arm.grabbing .spinner-knob { cursor: grabbing; }
.spinner-arm.disabled .spinner-knob { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.spinner-arm.spring-back { transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }

.spinner-btn { display: none; }
`
  const style = document.createElement('style')
  style.setAttribute('data-spinner', '')
  style.textContent = css
  document.head.appendChild(style)
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export class Spinner {
  constructor(opts) {
    if (!opts || !opts.container) throw new Error('Spinner: container required')
    if (!opts.items || !opts.items.length) throw new Error('Spinner: items required')

    this.opts = Object.assign({}, DEFAULTS, opts)
    this.items = this.opts.items.slice()
    this.onLand = opts.onLand || null
    this.lastIndex = -1
    this.isSpinning = false
    this.animFrameId = null
    this.audioCtx = null

    injectCSS(this.opts.accent)
    this._buildDOM()
    this._initLever()
    this._renderInitial()
  }

  _buildDOM() {
    const root = document.createElement('div')
    root.className = 'spinner-root'

    const col = document.createElement('div')
    col.className = 'spinner-col'

    const win = document.createElement('div')
    win.className = 'spinner-window'
    win.style.height = this.opts.windowHeight + 'px'

    const strip = document.createElement('div')
    strip.className = 'spinner-strip'

    const centerLine = document.createElement('div')
    centerLine.className = 'spinner-center-line'
    centerLine.style.height = this.opts.itemHeight + 'px'

    win.appendChild(strip)
    win.appendChild(centerLine)
    col.appendChild(win)

    root.appendChild(col)

    if (this.opts.showLever) {
      const lever = document.createElement('div')
      lever.className = 'spinner-lever'
      lever.innerHTML = `
        <div class="spinner-arm">
          <div class="spinner-knob" style="background: ${this.opts.knobColor};"></div>
          <div class="spinner-shaft"></div>
        </div>
        <div class="spinner-pivot"></div>
      `
      root.appendChild(lever)
      this.arm = lever.querySelector('.spinner-arm')
      this.knob = lever.querySelector('.spinner-knob')
    }

    this.opts.container.appendChild(root)
    this.root = root
    this.win = win
    this.strip = strip
  }

  setItems(items) {
    if (!items || !items.length) return
    this.items = items.slice()
    this.lastIndex = -1
    this._renderInitial()
  }

  getCurrentItem() {
    return this.currentItem || null
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId)
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root)
  }

  _renderInitial() {
    const picks = shuffle(this.items).slice(0, 3)
    while (picks.length < 3) picks.push(this.items[0])
    this.strip.innerHTML = ''
    picks.forEach((t) => this._appendItem(t))
    const middle = 1
    const offsetY = -(middle * this.opts.itemHeight + this.opts.itemHeight / 2 - this.opts.windowHeight / 2)
    this.strip.style.transform = 'translateY(' + offsetY + 'px)'
    this.strip.classList.add('settled')
    if (this.strip.children[middle]) this.strip.children[middle].classList.add('landed')
    this.currentItem = picks[middle]
  }

  _appendItem(text, isLanding) {
    const d = document.createElement('div')
    d.className = 'spinner-item'
    d.style.height = this.opts.itemHeight + 'px'
    d.style.fontFamily = this.opts.fontFamily
    d.style.fontSize = this.opts.fontSize
    d.style.color = this.opts.color

    const inner = document.createElement('span')
    inner.style.textAlign = 'center'
    inner.setAttribute('dir', 'auto')
    const words = text.split(/\s+/)
    if (words.length > 6) {
      const mid = Math.ceil(words.length / 2)
      inner.textContent = words.slice(0, mid).join(' ') + '\n' + words.slice(mid).join(' ')
      inner.style.whiteSpace = 'pre-line'
    } else {
      inner.textContent = text
    }
    d.appendChild(inner)

    if (isLanding) d.setAttribute('data-landing', 'true')
    this.strip.appendChild(d)
    return d
  }

  _randomIndex(exclude) {
    if (this.items.length <= 1) return 0
    let i
    do {
      i = Math.floor(Math.random() * this.items.length)
    } while (i === exclude)
    return i
  }

  // target: optional item to land on, so several reels can be given distinct results.
  spin(initialVelocity, target) {
    if (this.isSpinning) return
    if (!this.items.length) return
    this.isSpinning = true
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId)
    this._ensureAudio()

    if (this.arm) this.arm.classList.add('disabled')

    const ITEM_HEIGHT = this.opts.itemHeight
    const WINDOW_HEIGHT = this.opts.windowHeight
    const INITIAL_VELOCITY = initialVelocity || CLICK_VELOCITY

    let simVel = INITIAL_VELOCITY
    let simDist = 0
    while (simVel >= STOP_THRESHOLD) {
      simDist += simVel
      simVel *= FRICTION
    }
    const centerAtStop = simDist + WINDOW_HEIGHT / 2
    const naturalIndex = Math.round((centerAtStop - ITEM_HEIGHT / 2) / ITEM_HEIGHT)
    const LANDING_INDEX = naturalIndex + 1
    const REEL_COUNT = LANDING_INDEX + 3

    const targetIndex = target === undefined ? -1 : this.items.indexOf(target)
    const finalIndex = targetIndex >= 0 ? targetIndex : this._randomIndex(this.lastIndex)
    this.lastIndex = finalIndex
    const finalTopic = this.items[finalIndex]

    let reel = []
    while (reel.length < REEL_COUNT) reel = reel.concat(shuffle(this.items))
    reel = reel.slice(0, REEL_COUNT)
    reel[LANDING_INDEX] = finalTopic

    const TARGET_Y = -(LANDING_INDEX * ITEM_HEIGHT + ITEM_HEIGHT / 2 - WINDOW_HEIGHT / 2)

    this.strip.innerHTML = ''
    this.strip.classList.remove('settled')
    this.strip.style.transition = ''
    this.strip.style.transform = 'translateY(0px)'
    reel.forEach((t, i) => this._appendItem(t, i === LANDING_INDEX))

    const styleItems = (currentY) => {
      const viewportCenter = WINDOW_HEIGHT / 2
      const items = this.strip.children
      for (let i = 0; i < items.length; i++) {
        const itemCenter = i * ITEM_HEIGHT + ITEM_HEIGHT / 2 + currentY
        const dist = Math.abs(itemCenter - viewportCenter)
        const norm = Math.min(dist / ITEM_HEIGHT, 1)
        items[i].style.transform = 'scale(' + (1.35 - norm * 0.4) + ')'
        items[i].style.opacity = 1 - norm * 0.75
      }
    }

    let position = 0
    let velocity = INITIAL_VELOCITY
    let lastBoundary = 0
    let lastFrame = null

    const animate = (ts) => {
      if (lastFrame === null) lastFrame = ts
      const rawDt = (ts - lastFrame) / 16.667
      const dt = Math.min(rawDt, 3)
      lastFrame = ts
      if (dt === 0) {
        this.animFrameId = requestAnimationFrame(animate)
        return
      }

      position += velocity * dt
      velocity *= Math.pow(FRICTION, dt)
      this.strip.style.transform = 'translateY(' + -position + 'px)'
      styleItems(-position)

      const boundary = Math.floor(position / ITEM_HEIGHT)
      if (boundary > lastBoundary) {
        const progress = 1 - velocity / INITIAL_VELOCITY
        this._playTick(Math.min(progress, 0.95))
        lastBoundary = boundary
      }

      if (velocity < STOP_THRESHOLD) {
        snap()
        return
      }
      this.animFrameId = requestAnimationFrame(animate)
    }

    const snap = () => {
      const startY = -position
      const distance = TARGET_Y - startY
      const t0 = performance.now()
      const step = (now) => {
        const t = Math.min((now - t0) / SPRING_DURATION_MS, 1)
        const spring = 1 - Math.exp(-7 * t) * Math.cos(5 * t)
        const y = startY + distance * spring
        this.strip.style.transform = 'translateY(' + y + 'px)'
        styleItems(y)
        if (t < 1) {
          this.animFrameId = requestAnimationFrame(step)
        } else {
          this.strip.style.transform = 'translateY(' + TARGET_Y + 'px)'
          this._onSettle(finalTopic)
        }
      }
      this.animFrameId = requestAnimationFrame(step)
    }

    this.animFrameId = requestAnimationFrame(animate)
  }

  _onSettle(topic) {
    this.strip.classList.add('settled')
    const landing = this.strip.querySelector('[data-landing="true"]')
    if (landing) landing.classList.add('landed')
    this._playLand()
    if (this.arm) this.arm.classList.remove('disabled')
    this.isSpinning = false
    if (this.onLand) this.onLand(topic)
  }

  _ensureAudio() {
    if (!this.opts.sound) return
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      this.audioCtx = new Ctx()
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume()
  }

  _playTick(progress) {
    if (!this.opts.sound || !this.audioCtx) return
    const ctx = this.audioCtx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    const freq = 1800 - progress * 900
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + 0.04)
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(2500, now)
    filter.Q.setValueAtTime(2, now)
    const volume = 0.08 + (1 - progress) * 0.06
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.06)
  }

  _playLand() {
    if (!this.opts.sound || !this.audioCtx) return
    const ctx = this.audioCtx
    const now = ctx.currentTime
    const tones = [
      { freq: 880, start: 0, dur: 0.65, peak: 0.15, rampFrom: 0.15, rampAt: 0 },
      { freq: 1320, start: 0.06, dur: 0.55, peak: 0.1, rampFrom: 0, rampAt: 0.06 },
      { freq: 1760, start: 0.1, dur: 0.5, peak: 0.06, rampFrom: 0, rampAt: 0.1 },
    ]
    tones.forEach((t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(t.freq, now + t.start)
      gain.gain.setValueAtTime(t.rampFrom, now)
      if (t.rampAt > 0) gain.gain.linearRampToValueAtTime(t.peak, now + t.rampAt)
      gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur - 0.05)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + t.start + t.dur)
    })
  }

  _playClunk() {
    if (!this.opts.sound || !this.audioCtx) return
    const ctx = this.audioCtx
    const now = ctx.currentTime
    const bufferSize = ctx.sampleRate * 0.05
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(600, now)
    filter.Q.setValueAtTime(1, now)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + 0.06)
  }

  _initLever() {
    if (!this.arm || !this.knob) return
    const arm = this.arm
    const knob = this.knob

    let isDragging = false
    let startY = 0
    let currentAngle = 0
    let hasMoved = false

    knob.addEventListener('pointerdown', (e) => {
      if (this.isSpinning || arm.classList.contains('disabled')) return
      e.preventDefault()
      knob.setPointerCapture(e.pointerId)
      isDragging = true
      hasMoved = false
      arm.classList.add('grabbing')
      arm.classList.remove('spring-back')
      arm.style.transition = ''
      startY = e.clientY
      currentAngle = 0
      this._ensureAudio()
    })

    knob.addEventListener('pointermove', (e) => {
      if (!isDragging) return
      const deltaY = Math.max(0, e.clientY - startY)
      if (deltaY > 3) hasMoved = true
      currentAngle = Math.min(deltaY * (MAX_ANGLE / DRAG_SENSITIVITY), MAX_ANGLE)
      arm.style.transform = 'rotate(' + currentAngle + 'deg)'
    })

    const release = () => {
      if (!isDragging) return
      isDragging = false
      arm.classList.remove('grabbing')
      const normalizedPull = currentAngle / MAX_ANGLE
      arm.classList.add('spring-back')
      arm.style.transform = 'rotate(0deg)'
      setTimeout(() => arm.classList.remove('spring-back'), 600)
      this._playClunk()
      if (hasMoved || currentAngle > 0) {
        this.spin(MIN_PULL_VELOCITY + Math.min(normalizedPull, 1) * PULL_VELOCITY_RANGE)
      } else {
        this.spin(25)
      }
      currentAngle = 0
      hasMoved = false
    }

    knob.addEventListener('pointerup', release)
    knob.addEventListener('pointercancel', release)
    document.addEventListener('pointerup', () => {
      if (isDragging) release()
    })
  }
}
