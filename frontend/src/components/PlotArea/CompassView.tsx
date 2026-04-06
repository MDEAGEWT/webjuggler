import { useEffect, useRef, useCallback } from 'react'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'

interface Props {
  panelId: string
  series: string[] // single field
}

/** Detect whether values are in radians (all |v| <= 2*PI) or degrees */
function isRadians(values: Float64Array): boolean {
  const TWO_PI = Math.PI * 2 + 0.01 // small tolerance
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i]!) > TWO_PI) return false
  }
  return true
}

/** Find value at nearest timestamp */
function valueAtTime(
  timestamps: Float64Array,
  values: Float64Array,
  t: number,
): number | null {
  if (timestamps.length === 0) return null
  // Binary search for nearest
  let lo = 0
  let hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (timestamps[mid]! < t) lo = mid + 1
    else hi = mid
  }
  // Check neighbors for closest
  if (lo > 0 && Math.abs(timestamps[lo - 1]! - t) < Math.abs(timestamps[lo]! - t)) {
    lo = lo - 1
  }
  return values[lo] ?? null
}

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export default function CompassView({ panelId: _panelId, series }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fieldKey = series[0]
  const fieldData = useDataStore((s) => (fieldKey ? s.data[fieldKey] : undefined))
  const cursorTimestamp = useCursorStore((s) => s.timestamp)

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

    // Colors from CSS vars
    const bgSecondary = getCSSVar('--bg-secondary')
    const borderColor = getCSSVar('--border')
    const accent = getCSSVar('--accent')
    const textPrimary = getCSSVar('--text-primary')
    const textSecondary = getCSSVar('--text-secondary')

    // Clear
    ctx.fillStyle = bgSecondary
    ctx.fillRect(0, 0, w, h)

    // Compass geometry
    const padding = 24
    const radius = Math.min(w, h) / 2 - padding
    if (radius <= 10) return
    const cx = w / 2
    const cy = h / 2 - 12 // leave room for value text below

    // Draw outer circle
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw tick marks every 30 degrees and labels
    const cardinals: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = ((deg - 90) * Math.PI) / 180 // -90 so 0 deg = North (up)
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

      // Cardinal labels
      if (cardinals[deg]) {
        const labelR = radius + 14
        const lx = cx + Math.cos(rad) * labelR
        const ly = cy + Math.sin(rad) * labelR
        ctx.font = 'bold 14px sans-serif'
        ctx.fillStyle = textSecondary
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(cardinals[deg]!, lx, ly)
      }

      // Degree labels at 30-degree intervals (not cardinals)
      if (isMajor && !isCardinal) {
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

    // Get current heading value
    let headingDeg: number | null = null
    if (fieldData && cursorTimestamp != null) {
      const rawValue = valueAtTime(fieldData.timestamps, fieldData.values, cursorTimestamp)
      if (rawValue != null) {
        headingDeg = isRadians(fieldData.values) ? rawValue * (180 / Math.PI) : rawValue
      }
    } else if (fieldData && fieldData.values.length > 0) {
      // No cursor, show last value
      const raw = fieldData.values[fieldData.values.length - 1]!
      headingDeg = isRadians(fieldData.values) ? raw * (180 / Math.PI) : raw
    }

    if (headingDeg != null) {
      // Normalize to 0-360
      const normalized = ((headingDeg % 360) + 360) % 360
      const needleRad = ((normalized - 90) * Math.PI) / 180

      // Draw needle (main direction)
      const needleLen = radius * 0.75
      const tipX = cx + Math.cos(needleRad) * needleLen
      const tipY = cy + Math.sin(needleRad) * needleLen

      // Needle triangle
      const baseAngle1 = needleRad + Math.PI / 2
      const baseAngle2 = needleRad - Math.PI / 2
      const baseLen = 6

      ctx.beginPath()
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(cx + Math.cos(baseAngle1) * baseLen, cy + Math.sin(baseAngle1) * baseLen)
      ctx.lineTo(cx + Math.cos(baseAngle2) * baseLen, cy + Math.sin(baseAngle2) * baseLen)
      ctx.closePath()
      ctx.fillStyle = accent
      ctx.fill()

      // Thin tail opposite
      const tailLen = radius * 0.3
      const tailX = cx - Math.cos(needleRad) * tailLen
      const tailY = cy - Math.sin(needleRad) * tailLen
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(tailX, tailY)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.globalAlpha = 1

      // Center dot
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.fillStyle = accent
      ctx.fill()

      // Value text below compass
      ctx.font = 'bold 18px monospace'
      ctx.fillStyle = accent
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`${normalized.toFixed(1)}\u00B0`, cx, cy + radius + 20)
    } else {
      // No data
      ctx.font = '14px sans-serif'
      ctx.fillStyle = textPrimary
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('No data', cx, cy + radius + 20)
    }

    // Field name at top
    if (fieldKey) {
      const shortName = fieldKey.split('/').slice(-1)[0] ?? fieldKey
      ctx.font = '11px sans-serif'
      ctx.fillStyle = textSecondary
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(shortName, cx, 4)
    }
  }, [fieldKey, fieldData, cursorTimestamp])

  // Draw on every relevant change
  useEffect(() => {
    draw()
  }, [draw])

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      draw()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [draw])

  // Fetch data if missing
  const fetchFields = useDataStore((s) => s.fetchFields)
  useEffect(() => {
    if (fieldKey && !fieldData) {
      fetchFields([fieldKey])
    }
  }, [fieldKey, fieldData, fetchFields])

  return (
    <div ref={containerRef} className="compass-view">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
