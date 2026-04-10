import { useEffect, useRef, useCallback } from 'react'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { useLayoutStore, selectActiveRoot } from '../../stores/useLayoutStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { PLOT_COLORS } from '../../constants'
import AxisControls from './AxisControls'
import type { LayoutNode, PlotNode } from '../../types'

const DEFAULT_NEGATE = [false, false, false] as boolean[]

function findPlotNode(node: LayoutNode, id: string): PlotNode | null {
  if (node.type === 'plot') return node.id === id ? node : null
  return findPlotNode(node.children[0], id) ?? findPlotNode(node.children[1], id)
}

interface Props {
  panelId: string
  series: string[]
}

export default function XYPlot({ panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const data = useDataStore((s) => s.adjustedData)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const cursorTs = useCursorStore((s) => s.timestamp)
  const setCursor = useCursorStore((s) => s.setCursor)
  const theme = useThemeStore((s) => s.theme)
  const root = useLayoutStore(selectActiveRoot)
  const axisNegate = (() => {
    const plot = findPlotNode(root, panelId)
    return plot?.axisNegate ?? DEFAULT_NEGATE
  })()

  // On mount / series change, fetch any missing field data (e.g. after restore from localStorage)
  useEffect(() => {
    const missing = series.filter((s) => !useDataStore.getState().data[s])
    if (missing.length > 0) {
      fetchFields(missing)
    }
  }, [series, fetchFields])

  const draw = useCallback(() => {
    const el = containerRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return

    // Build curve pairs: every 2 series = 1 XY curve
    const curves: { xVals: Float64Array; yVals: Float64Array; timestamps: Float64Array; color: string }[] = []
    const negX = axisNegate[0] ? -1 : 1
    const negY = axisNegate[1] ? -1 : 1

    for (let c = 0; c + 1 < series.length; c += 2) {
      const xField = series[c]!
      const yField = series[c + 1]!
      const xData = data[xField]
      const yData = data[yField]
      if (!xData || !yData) continue
      const len = Math.min(xData.values.length, yData.values.length)
      if (len === 0) continue
      curves.push({
        xVals: negX === 1 ? xData.values : Float64Array.from(xData.values, v => v * -1),
        yVals: negY === 1 ? yData.values : Float64Array.from(yData.values, v => v * -1),
        timestamps: xData.timestamps,
        color: PLOT_COLORS[c / 2 % PLOT_COLORS.length]!,
      })
    }

    if (curves.length === 0) return

    const w = el.clientWidth
    const h = el.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Compute bounds across ALL curves
    let xMin = Infinity, xMax = -Infinity
    let yMin = Infinity, yMax = -Infinity
    for (const curve of curves) {
      const len = Math.min(curve.xVals.length, curve.yVals.length)
      for (let i = 0; i < len; i++) {
        const xv = curve.xVals[i]!, yv = curve.yVals[i]!
        if (Number.isFinite(xv)) { if (xv < xMin) xMin = xv; if (xv > xMax) xMax = xv }
        if (Number.isFinite(yv)) { if (yv < yMin) yMin = yv; if (yv > yMax) yMax = yv }
      }
    }
    // Add padding
    const xRange = (xMax - xMin) || 1
    const yRange = (yMax - yMin) || 1
    xMin -= xRange * 0.05
    xMax += xRange * 0.05
    yMin -= yRange * 0.05
    yMax += yRange * 0.05

    const margin = { top: 20, right: 20, bottom: 40, left: 60 }
    const plotW = w - margin.left - margin.right
    const plotH = h - margin.top - margin.bottom

    const toX = (v: number) => margin.left + ((v - xMin) / (xMax - xMin)) * plotW
    const toY = (v: number) => margin.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH

    // Read theme colors from CSS variables
    const cs = getComputedStyle(document.documentElement)
    const bgColor = cs.getPropertyValue('--bg-secondary').trim()
    const gridColor = cs.getPropertyValue('--grid-line').trim()
    const axisTextColor = cs.getPropertyValue('--axis-text').trim()
    const axisLabelColor = cs.getPropertyValue('--axis-label').trim()
    const cursorStroke = cs.getPropertyValue('--cursor-stroke').trim()

    // Clear
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, w, h)

    // Grid
    ctx.strokeStyle = gridColor
    ctx.lineWidth = 1
    const gridCountX = 8, gridCountY = 6
    for (let i = 0; i <= gridCountX; i++) {
      const x = margin.left + (i / gridCountX) * plotW
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + plotH); ctx.stroke()
    }
    for (let i = 0; i <= gridCountY; i++) {
      const y = margin.top + (i / gridCountY) * plotH
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + plotW, y); ctx.stroke()
    }

    // Axis tick labels
    ctx.fillStyle = axisTextColor
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i <= gridCountX; i++) {
      const v = xMin + (i / gridCountX) * (xMax - xMin)
      ctx.fillText(v.toFixed(2), margin.left + (i / gridCountX) * plotW, h - 8)
    }
    ctx.textAlign = 'right'
    for (let i = 0; i <= gridCountY; i++) {
      const v = yMin + (i / gridCountY) * (yMax - yMin)
      ctx.fillText(v.toFixed(2), margin.left - 6, margin.top + plotH - (i / gridCountY) * plotH + 4)
    }

    // Axis names (use first curve's fields)
    ctx.fillStyle = axisLabelColor
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    const xLabel = series[0]?.split('/').slice(-1)[0] ?? 'X'
    const yLabel = series[1]?.split('/').slice(-1)[0] ?? 'Y'
    ctx.fillText(xLabel, margin.left + plotW / 2, h - 2)
    ctx.save()
    ctx.translate(12, margin.top + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(yLabel, 0, 0)
    ctx.restore()

    // Draw each curve
    for (const curve of curves) {
      const len = Math.min(curve.xVals.length, curve.yVals.length)

      // Trajectory line
      ctx.strokeStyle = curve.color
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      for (let i = 0; i < len; i++) {
        const px = toX(curve.xVals[i]!), py = toY(curve.yVals[i]!)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.globalAlpha = 1.0

      // Points (downsample if too many)
      ctx.fillStyle = curve.color
      const step = len > 5000 ? Math.ceil(len / 5000) : 1
      for (let i = 0; i < len; i += step) {
        const px = toX(curve.xVals[i]!), py = toY(curve.yVals[i]!)
        ctx.beginPath()
        ctx.arc(px, py, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Cursor highlight
      if (cursorTs != null) {
        let bestIdx = 0
        let bestDist = Math.abs(curve.timestamps[0]! - cursorTs)
        for (let i = 1; i < len; i++) {
          const d = Math.abs(curve.timestamps[i]! - cursorTs)
          if (d < bestDist) { bestDist = d; bestIdx = i }
        }
        const cx = toX(curve.xVals[bestIdx]!), cy = toY(curve.yVals[bestIdx]!)
        ctx.strokeStyle = cursorStroke
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, 5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = curve.color
        ctx.beginPath()
        ctx.arc(cx, cy, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [series, data, cursorTs, theme, axisNegate])

  // Draw on data/cursor change
  useEffect(() => { draw() }, [draw])

  // Handle resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => draw())
    obs.observe(el)
    return () => obs.disconnect()
  }, [draw])

  // Mouse interaction — update cursor on hover (only in time mode)
  const cursorMode = useSettingsStore((s) => s.cursorMode)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (cursorMode !== 'time') return
    const el = containerRef.current
    if (!el) return

    // Use first curve pair for mouse interaction
    const xField = series[0], yField = series[1]
    if (!xField || !yField) return
    const xData = data[xField], yData = data[yField]
    if (!xData || !yData) return

    const rect = el.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const margin = { top: 20, right: 20, bottom: 40, left: 60 }
    const plotW = el.clientWidth - margin.left - margin.right
    const plotH = el.clientHeight - margin.top - margin.bottom

    // Compute bounds across all curves (same as draw)
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (let c = 0; c + 1 < series.length; c += 2) {
      const xd = data[series[c]!], yd = data[series[c + 1]!]
      if (!xd || !yd) continue
      const len = Math.min(xd.values.length, yd.values.length)
      for (let i = 0; i < len; i++) {
        const xv = xd.values[i]!, yv = yd.values[i]!
        if (Number.isFinite(xv)) { if (xv < xMin) xMin = xv; if (xv > xMax) xMax = xv }
        if (Number.isFinite(yv)) { if (yv < yMin) yMin = yv; if (yv > yMax) yMax = yv }
      }
    }
    const xRange = (xMax - xMin) || 1, yRange = (yMax - yMin) || 1
    xMin -= xRange * 0.05; xMax += xRange * 0.05
    yMin -= yRange * 0.05; yMax += yRange * 0.05

    const toX = (v: number) => margin.left + ((v - xMin) / (xMax - xMin)) * plotW
    const toY = (v: number) => margin.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH

    // Find nearest point across all curves
    let bestTs = 0, bestDist = Infinity
    for (let c = 0; c + 1 < series.length; c += 2) {
      const xd = data[series[c]!], yd = data[series[c + 1]!]
      if (!xd || !yd) continue
      const len = Math.min(xd.values.length, yd.values.length)
      for (let i = 0; i < len; i++) {
        const dx = toX(xd.values[i]!) - mx
        const dy = toY(yd.values[i]!) - my
        const d = dx * dx + dy * dy
        if (d < bestDist) { bestDist = d; bestTs = xd.timestamps[i]! }
      }
    }
    if (bestTs != null) setCursor(bestTs)
  }, [series, data, setCursor, cursorMode])

  const xLabel = series[0]?.split('/').slice(-1)[0] ?? 'X'
  const yLabel = series[1]?.split('/').slice(-1)[0] ?? 'Y'

  // Build legend entries (one per curve pair)
  const legendEntries: { color: string; label: string }[] = []
  for (let c = 0; c + 1 < series.length; c += 2) {
    // Strip fileId prefix (e.g. "uuid:topic/field" → "topic/field")
    const stripFileId = (s: string) => { const i = s.indexOf(':'); return i >= 0 ? s.substring(i + 1) : s }
    const xPath = stripFileId(series[c]!)   // e.g. "vehicle_local_position/x"
    const yPath = stripFileId(series[c + 1]!)
    const xName = xPath.split('/').slice(-1)[0] ?? xPath  // "x"
    const yName = yPath.split('/').slice(-1)[0] ?? yPath  // "y"
    const topic = xPath.split('/').slice(0, -1).join('/')  // "vehicle_local_position"
    const label = topic ? `${topic} (${xName}, ${yName})` : `${xName}, ${yName}`
    legendEntries.push({ color: PLOT_COLORS[c / 2 % PLOT_COLORS.length]!, label })
  }

  return (
    <div ref={containerRef} className="xy-plot" onMouseMove={handleMouseMove}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      {legendEntries.length > 0 && (
        <div className="xy-legend">
          {legendEntries.map((entry, i) => (
            <div key={i} className="xy-legend-item">
              <span className="xy-legend-color" style={{ background: entry.color }} />
              <span className="xy-legend-label">{entry.label}</span>
            </div>
          ))}
        </div>
      )}
      <AxisControls panelId={panelId} axisLabels={[xLabel, yLabel]} axisNegate={[!!axisNegate[0], !!axisNegate[1]]} />
    </div>
  )
}
