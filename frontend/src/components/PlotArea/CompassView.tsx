import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { PLOT_COLORS } from '../../constants'

interface Props {
  panelId: string
  series: string[]
}

interface NeedleInfo {
  color: string
  label: string
  deg: number
}

/** Detect whether values are in radians (all |v| <= 2*PI) or degrees */
function isRadians(values: Float64Array): boolean {
  const TWO_PI = Math.PI * 2 + 0.01
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i]!) > TWO_PI) return false
  }
  return true
}

/** Find value at nearest timestamp via binary search */
function valueAtTime(
  timestamps: Float64Array,
  values: Float64Array,
  t: number,
): number | null {
  if (timestamps.length === 0) return null
  let lo = 0
  let hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (timestamps[mid]! < t) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(timestamps[lo - 1]! - t) < Math.abs(timestamps[lo]! - t)) {
    lo = lo - 1
  }
  return values[lo] ?? null
}

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function getSeriesColor(index: number): string {
  return PLOT_COLORS[index % PLOT_COLORS.length]!
}

export default function CompassView({ panelId: _panelId, series }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const needleDataRef = useRef<NeedleInfo[]>([])
  const theme = useThemeStore((s) => s.theme)
  const data = useDataStore((s) => s.data)
  const colorOverrides = useLayoutStore((s) => s.colorOverrides)
  const cursorTimestamp = useCursorStore((s) => s.timestamp)

  // Compute needle data for the overlay outside the draw callback
  const needleData = useMemo(() => {
    const result: NeedleInfo[] = []
    for (let si = 0; si < series.length; si++) {
      const fieldKey = series[si]!
      const fd = data[fieldKey]
      if (!fd) continue

      let rawValue: number | null = null
      if (cursorTimestamp != null) {
        rawValue = valueAtTime(fd.timestamps, fd.values, cursorTimestamp)
      } else if (fd.values.length > 0) {
        rawValue = fd.values[fd.values.length - 1]!
      }
      if (rawValue == null) continue

      const headingDeg = isRadians(fd.values) ? rawValue * (180 / Math.PI) : rawValue
      const normalized = ((headingDeg % 360) + 360) % 360
      const color = colorOverrides[fieldKey] ?? (si === 0 ? '#e53935' : getSeriesColor(si))

      const colonIdx2 = fieldKey.indexOf(':')
      const fullPath = colonIdx2 >= 0 ? fieldKey.substring(colonIdx2 + 1) : fieldKey
      result.push({ color, label: fullPath, deg: normalized })
    }
    needleDataRef.current = result
    return result
  }, [series, data, colorOverrides, cursorTimestamp])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const bgSecondary = getCSSVar('--bg-secondary')
    const borderColor = getCSSVar('--border')
    const textSecondary = getCSSVar('--text-secondary')

    // Clear
    ctx.fillStyle = bgSecondary
    ctx.fillRect(0, 0, w, h)

    // Compass geometry — smaller, leave room for overlay at bottom
    const padding = 24
    const radius = Math.min(w, h) / 2 - padding - 50
    if (radius <= 10) return
    const cx = w / 2
    const cy = h / 2 - 20  // shift up to leave room for overlay

    // Outer circle
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2
    ctx.stroke()

    // Tick marks and labels
    const cardinals: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = ((deg - 90) * Math.PI) / 180
      const isCardinal = deg % 90 === 0
      const isMajor = deg % 30 === 0
      const tickLen = isCardinal ? 14 : isMajor ? 10 : 5

      const outerX = cx + Math.cos(rad) * radius
      const outerY = cy + Math.sin(rad) * radius
      const innerX = cx + Math.cos(rad) * (radius - tickLen)
      const innerY = cy + Math.sin(rad) * (radius - tickLen)

      ctx.beginPath()
      ctx.moveTo(outerX, outerY)
      ctx.lineTo(innerX, innerY)
      ctx.strokeStyle = isMajor ? textSecondary : borderColor
      ctx.lineWidth = isCardinal ? 2 : 1
      ctx.stroke()

      if (cardinals[deg]) {
        const labelR = radius + 14
        const lx = cx + Math.cos(rad) * labelR
        const ly = cy + Math.sin(rad) * labelR
        ctx.font = 'bold 14px sans-serif'
        ctx.fillStyle = textSecondary
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(cardinals[deg]!, lx, ly)
      } else if (isMajor) {
        const labelR = radius + 14
        const lx = cx + Math.cos(rad) * labelR
        const ly = cy + Math.sin(rad) * labelR
        ctx.font = '10px sans-serif'
        ctx.fillStyle = textSecondary
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${deg}`, lx, ly)
      }
    }

    // Center dot
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fillStyle = textSecondary
    ctx.fill()

    // Draw needle for EACH series
    const nd = needleDataRef.current
    for (let si = 0; si < nd.length; si++) {
      const info = nd[si]!
      const needleRad = ((info.deg - 90) * Math.PI) / 180
      const color = info.color

      // Needle triangle
      const needleLen = radius * (si === 0 ? 0.75 : 0.65 - si * 0.05)
      const tipX = cx + Math.cos(needleRad) * needleLen
      const tipY = cy + Math.sin(needleRad) * needleLen

      const baseAngle1 = needleRad + Math.PI / 2
      const baseAngle2 = needleRad - Math.PI / 2
      const baseLen = si === 0 ? 6 : 4

      ctx.beginPath()
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(cx + Math.cos(baseAngle1) * baseLen, cy + Math.sin(baseAngle1) * baseLen)
      ctx.lineTo(cx + Math.cos(baseAngle2) * baseLen, cy + Math.sin(baseAngle2) * baseLen)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.globalAlpha = si === 0 ? 1.0 : 0.7
      ctx.fill()
      ctx.globalAlpha = 1.0

      // Thin tail
      const tailLen = radius * 0.25
      const tailX = cx - Math.cos(needleRad) * tailLen
      const tailY = cy - Math.sin(needleRad) * tailLen
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(tailX, tailY)
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.4
      ctx.stroke()
      ctx.globalAlpha = 1.0
    }
  }, [needleData, theme])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(el)
    return () => observer.disconnect()
  }, [draw])

  // Fetch missing data
  const fetchFields = useDataStore((s) => s.fetchFields)
  useEffect(() => {
    const missing = series.filter((s) => !data[s])
    if (missing.length > 0) fetchFields(missing)
  }, [series, data, fetchFields])

  return (
    <div ref={containerRef} className="compass-view">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      {needleData.length > 0 && (
        <div className="viz-overlay">
          {needleData.map((nd, i) => (
            <React.Fragment key={i}>
              <span className="viz-overlay-label" style={{ color: nd.color }}>{nd.label}</span>
              <span className="viz-overlay-value">{nd.deg.toFixed(1)}&deg;</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
