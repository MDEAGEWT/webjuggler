import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useZoomStore } from '../../stores/useZoomStore'
import { useLayoutStore, selectActiveRoot } from '../../stores/useLayoutStore'
import { useFileStore } from '../../stores/useFileStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { PLOT_COLORS } from '../../constants'
import PlotLegend from './PlotLegend'
import type { LayoutNode, PlotNode } from '../../types'

const DEFAULT_LINE_STYLE = 'lines' as const
const DEFAULT_LINE_WIDTH = 1.5

function findPlotNode(node: LayoutNode, id: string): PlotNode | null {
  if (node.type === 'plot') return node.id === id ? node : null
  return findPlotNode(node.children[0], id) ?? findPlotNode(node.children[1], id)
}

/** Extract a short display label from composite "fileId:topic/field" path */
function seriesLabel(compositeField: string): string {
  if (compositeField.startsWith('custom:')) {
    return '[fn] ' + compositeField.substring(7)
  }
  const files = useFileStore.getState().files
  const colonIdx = compositeField.indexOf(':')
  if (colonIdx === -1) {
    return compositeField.split('/').slice(-1)[0] ?? compositeField
  }
  const fileId = compositeField.substring(0, colonIdx)
  const fieldPath = compositeField.substring(colonIdx + 1)
  const shortField = fieldPath.split('/').slice(-1)[0] ?? fieldPath

  if (files.length <= 1) return shortField

  const file = files.find((f) => f.fileId === fileId)
  const prefix = file ? file.shortName : fileId.substring(0, 8)
  return `[${prefix}] ${shortField}`
}

/** Short name for cursor overlay (no file prefix, just the field leaf) */
function shortLabel(compositeField: string): string {
  if (compositeField.startsWith('custom:')) {
    return '[fn] ' + compositeField.substring(7)
  }
  const colonIdx = compositeField.indexOf(':')
  const path = colonIdx === -1 ? compositeField : compositeField.substring(colonIdx + 1)
  return path.split('/').slice(-1)[0] ?? path
}

interface Props {
  panelId: string
  series: string[]
}

/** Get color for a series by its index within the plot (not hash-based) */
function getSeriesColor(index: number): string {
  return PLOT_COLORS[index % PLOT_COLORS.length]!
}

/** Width estimate for the cursor overlay to decide flip direction */
const OVERLAY_EST_WIDTH = 160

export default function TimeSeriesPlot({ panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const data = useDataStore((s) => s.adjustedData)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const setCursor = useCursorStore((s) => s.setCursor)
  const removeSeries = useLayoutStore((s) => s.removeSeries)
  const colorOverrides = useLayoutStore((s) => s.colorOverrides)
  const root = useLayoutStore(selectActiveRoot)
  const lineStyle = (() => {
    const plot = findPlotNode(root, panelId)
    return plot?.lineStyle ?? DEFAULT_LINE_STYLE
  })()
  const lineWidth = (() => {
    const plot = findPlotNode(root, panelId)
    return plot?.lineWidth ?? DEFAULT_LINE_WIDTH
  })()
  const theme = useThemeStore((s) => s.theme)
  const cursorMode = useSettingsStore((s) => s.cursorMode)

  // On mount / series change, fetch any missing field data (e.g. after restore from localStorage)
  useEffect(() => {
    const missing = series.filter((s) => !useDataStore.getState().data[s])
    if (missing.length > 0) {
      fetchFields(missing)
    }
  }, [series, fetchFields])

  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())

  // Keep a ref for hiddenSeries so uPlot hooks can read current value
  const hiddenRef = useRef(hiddenSeries)
  hiddenRef.current = hiddenSeries

  // Keep a ref for available series so the setCursor hook can map indices
  const availableSeriesRef = useRef<string[]>([])

  const handleToggleVisibility = useCallback((field: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }, [])

  const handleRemoveSeries = useCallback(
    (field: string) => {
      removeSeries(panelId, field)
    },
    [panelId, removeSeries],
  )

  // When hiddenSeries changes, update uPlot series visibility without full rebuild
  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const avail = availableSeriesRef.current
    avail.forEach((field, i) => {
      const seriesIdx = i + 1 // series[0] is time
      const shouldShow = !hiddenSeries.has(field)
      if (plot.series[seriesIdx] && plot.series[seriesIdx].show !== shouldShow) {
        plot.setSeries(seriesIdx, { show: shouldShow })
      }
    })
  }, [hiddenSeries])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Gather available series
    const availableSeries = series.filter((s) => data[s])
    availableSeriesRef.current = availableSeries
    if (availableSeries.length === 0) return

    // Merge all timestamps into a unified sorted array (no interpolation)
    // Each series keeps its values only at its own timestamps, null elsewhere
    const tsSet = new Set<number>()
    for (const s of availableSeries) {
      const fd = data[s]!
      for (let i = 0; i < fd.timestamps.length; i++) {
        tsSet.add(fd.timestamps[i]!)
      }
    }
    const mergedTs = Array.from(tsSet).sort((a, b) => a - b)

    // For each series, place values at matching timestamps using merge-join
    const plotData: uPlot.AlignedData = [
      mergedTs,
      ...availableSeries.map((s) => {
        const fd = data[s]!
        const aligned = new Array<number | null>(mergedTs.length).fill(null)
        let j = 0
        for (let i = 0; i < mergedTs.length && j < fd.timestamps.length; i++) {
          if (mergedTs[i] === fd.timestamps[j]) {
            const v = fd.values[j]!
            aligned[i] = Number.isFinite(v) ? v : null
            j++
          }
        }
        return aligned
      }),
    ]

    const seriesOpts: uPlot.Series[] = [
      { label: 'Time' },
      ...availableSeries.map((s, i) => {
        const base: uPlot.Series = {
          label: seriesLabel(s),
          stroke: colorOverrides[s] ?? getSeriesColor(i),
          show: !hiddenRef.current.has(s),
          spanGaps: true,  // connect points across null gaps (different sample rates)
        }

        if (lineStyle === 'dots') {
          base.width = 0
          base.paths = () => null
          base.points = { show: true, size: 3 }
        } else if (lineStyle === 'lines-dots') {
          base.width = lineWidth
          base.points = { show: true, size: 3 }
        } else {
          // 'lines' (default)
          base.width = lineWidth
        }

        return base
      }),
    ]

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: el.clientHeight,
      legend: { show: false },
      cursor: {
        x: false,
        y: false,
        points: { show: false },
        drag: { x: true, y: true },  // 2D drag-to-zoom (always both axes)
        ...(cursorMode === 'time' ? {
          sync: { key: 'webjuggler', setSeries: false },
        } : {}),
      },
      hooks: {
        ...(cursorMode === 'time' ? { setCursor: [
          (u: uPlot) => {
            const idx = u.cursor.idx
            if (idx != null && u.data[0]) {
              const ts = u.data[0][idx]
              if (ts != null) setCursor(ts)
            }
          },
        ] } : {}),
        setScale: [
          (u: uPlot, scaleKey: string) => {
            if (scaleKey === 'x' && useSettingsStore.getState().syncZoom) {
              const min = u.scales.x?.min
              const max = u.scales.x?.max
              if (min != null && max != null) {
                useZoomStore.getState().setRange(min, max, panelId)
              }
            }
          },
        ],
        setSelect: [
          (u: uPlot) => {
            const sel = u.select
            if (sel.width > 2 && sel.height > 2) {
              const xMin = u.posToVal(sel.left, 'x')
              const xMax = u.posToVal(sel.left + sel.width, 'x')
              const yMax = u.posToVal(sel.top, 'y')
              const yMin = u.posToVal(sel.top + sel.height, 'y')
              u.setScale('x', { min: xMin, max: xMax })
              u.setScale('y', { min: yMin, max: yMax })
            }
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false)
          },
        ],
      },
      series: seriesOpts,
      axes: [
        {
          stroke: getComputedStyle(document.documentElement).getPropertyValue('--axis-text').trim(),
          grid: { stroke: getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim(), width: 1 },
          ticks: { stroke: getComputedStyle(document.documentElement).getPropertyValue('--grid-tick').trim(), width: 1 },
        },
        {
          stroke: getComputedStyle(document.documentElement).getPropertyValue('--axis-text').trim(),
          grid: { stroke: getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim(), width: 1 },
          ticks: { stroke: getComputedStyle(document.documentElement).getPropertyValue('--grid-tick').trim(), width: 1 },
        },
      ],
      scales: {
        x: { time: false },
        y: { auto: true },
      },
      select: {
        show: true,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      },
    }

    // Destroy previous
    if (plotRef.current) {
      plotRef.current.destroy()
      plotRef.current = null
    }

    const plot = new uPlot(opts, plotData, el)
    plotRef.current = plot

    return () => {
      plot.destroy()
      plotRef.current = null
    }
  }, [series, data, setCursor, theme, colorOverrides, cursorMode, lineStyle, lineWidth])

  // Handle resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      if (plotRef.current && el.clientWidth > 0 && el.clientHeight > 0) {
        plotRef.current.setSize({
          width: el.clientWidth,
          height: el.clientHeight,
        })
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Synchronized zoom: apply range changes from other plots
  useEffect(() => {
    const unsub = useZoomStore.subscribe((state) => {
      const plot = plotRef.current
      if (!plot) return
      if (state.sourceId === panelId) return
      if (!useSettingsStore.getState().syncZoom) return

      if (state.xMin != null && state.xMax != null) {
        plot.setScale('x', { min: state.xMin, max: state.xMax })
      } else if (plot.data[0] && plot.data[0].length > 0) {
        plot.setScale('x', {
          min: plot.data[0][0]!,
          max: plot.data[0][plot.data[0].length - 1]!,
        })
      }
    })
    return unsub
  }, [panelId])

  const cursorTs = useCursorStore((s) => s.timestamp)
  const showCursorValues = useSettingsStore((s) => s.showCursorValues)

  // "Show point in plot" mode — nearest point to mouse
  const [pointInfo, setPointInfo] = useState<{ x: number; y: number; label: string; value: number; time: number; color: string } | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (cursorMode !== 'point') { setPointInfo(null); return }
    const plot = plotRef.current
    const el = containerRef.current
    if (!plot || !el) return

    const rect = el.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const overEl = plot.over
    const oL = overEl?.offsetLeft ?? 0
    const oT = overEl?.offsetTop ?? 0

    // Convert mouse to plot coordinates
    const plotX = mx - oL
    const plotY = my - oT

    if (plotX < 0 || plotY < 0) { setPointInfo(null); return }

    const xVal = plot.posToVal(plotX, 'x')
    const xs = plot.data[0]
    if (!xs || xs.length === 0) { setPointInfo(null); return }

    // Find nearest x index
    let lo = 0, hi = xs.length - 1
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (xs[mid]! < xVal) lo = mid + 1; else hi = mid }
    if (lo > 0 && Math.abs(xs[lo - 1]! - xVal) < Math.abs(xs[lo]! - xVal)) lo--

    // Find nearest curve by pixel distance
    let bestDist = 40 * 40 // 40px max detection radius
    let bestInfo: typeof pointInfo = null
    const avail = availableSeriesRef.current

    avail.forEach((field, i) => {
      if (hiddenSeries.has(field)) return
      const d = plot.data[i + 1]
      let v = d ? (d[lo] ?? null) : null
      // Find nearest non-null
      if (v == null && d) {
        for (let delta = 1; delta < 20; delta++) {
          if (lo + delta < d.length && d[lo + delta] != null) { v = d[lo + delta]!; break }
          if (lo - delta >= 0 && d[lo - delta] != null) { v = d[lo - delta]!; break }
        }
      }
      if (v == null) return

      const py = plot.valToPos(v, 'y')
      const px = plot.valToPos(xs[lo]!, 'x')
      const dx = px - plotX, dy = py - plotY
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        bestInfo = {
          x: px + oL,
          y: py + oT,
          label: shortLabel(field),
          value: v,
          time: xs[lo]!,
          color: colorOverrides[field] ?? getSeriesColor(i),
        }
      }
    })

    setPointInfo(bestInfo)
  }, [cursorMode, hiddenSeries, colorOverrides, series, data])

  const handleMouseLeave = useCallback(() => { setPointInfo(null) }, [])

  // Compute cursor data for overlay + dots
  const cursorInfo = useMemo(() => {
    const plot = plotRef.current
    if (!plot || cursorTs == null) return null

    const xs = plot.data[0]
    if (!xs || xs.length === 0) return null

    // Find nearest index via binary search
    let lo = 0, hi = xs.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (xs[mid]! < cursorTs) lo = mid + 1
      else hi = mid
    }
    if (lo > 0 && Math.abs(xs[lo - 1]! - cursorTs) < Math.abs(xs[lo]! - cursorTs)) lo--

    // uPlot's valToPos returns position relative to the canvas,
    // but our overlay is relative to the container div.
    // The plot area has an offset from axes — use plot.over's position.
    const overEl = plot.over
    const offsetLeft = overEl ? overEl.offsetLeft : 0
    const offsetTop = overEl ? overEl.offsetTop : 0

    const rawX = plot.valToPos(cursorTs, 'x')
    if (!isFinite(rawX) || rawX < 0) return null
    const lineLeft = rawX + offsetLeft

    const points: { field: string; label: string; value: number; yPos: number; color: string }[] = []
    const avail = availableSeriesRef.current
    avail.forEach((field, i) => {
      if (hiddenSeries.has(field)) return
      const d = plot.data[i + 1]
      // Find nearest non-null value (PlotJuggler uses nearest-neighbor, not exact match)
      let v: number | null = d ? (d[lo] ?? null) : null
      if (v == null && d) {
        // Search outward from lo for nearest non-null
        for (let delta = 1; delta < 50 && delta < xs.length; delta++) {
          if (lo + delta < d.length && d[lo + delta] != null) { v = d[lo + delta]!; break }
          if (lo - delta >= 0 && d[lo - delta] != null) { v = d[lo - delta]!; break }
        }
      }
      if (v == null) return
      const rawY = plot.valToPos(v, 'y')
      if (!isFinite(rawY)) return
      points.push({
        field,
        label: shortLabel(field),
        value: v,
        yPos: rawY + offsetTop,
        color: colorOverrides[field] ?? getSeriesColor(i),
      })
    })

    // Keep original series order (same as legend)

    // Determine container width for flip logic
    const containerWidth = containerRef.current?.clientWidth ?? 800

    return { lineLeft, points, time: cursorTs, containerWidth }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorTs, hiddenSeries, colorOverrides, series, data])

  // Decide if the overlay should flip to the left side
  const overlayFlipped = cursorInfo
    ? cursorInfo.lineLeft + OVERLAY_EST_WIDTH + 12 > cursorInfo.containerWidth
    : false

  return (
    <>
      <div ref={containerRef} className="time-series-plot" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
      {cursorInfo && (
        <>
          {/* Vertical cursor line */}
          <div className="cursor-line" style={{ left: cursorInfo.lineLeft }} />

          {/* Dots + values overlay — always when cursor values enabled */}
          {showCursorValues && cursorInfo.points.length > 0 && (() => {
            // Dots at intersection points
            const dots = cursorInfo.points.map((p) => (
              <div
                key={p.field}
                className="cursor-dot"
                style={{
                  left: cursorInfo.lineLeft - 3,
                  top: p.yPos - 3,
                  background: p.color,
                }}
              />
            ))
            const minY = Math.min(...cursorInfo.points.map(p => p.yPos))
            const maxY = Math.max(...cursorInfo.points.map(p => p.yPos))
            const midY = (minY + maxY) / 2
            return (<>
            {dots}
            <div
              className="cursor-values-overlay"
              style={{
                top: midY,
                transform: 'translateY(-50%)',
                ...(overlayFlipped
                  ? { right: cursorInfo.containerWidth - cursorInfo.lineLeft + 8 }
                  : { left: cursorInfo.lineLeft + 8 }),
              }}
            >
              <div className="cursor-values-time">t={cursorInfo.time.toFixed(3)}s</div>
              {cursorInfo.points.map((p) => (
                <div key={p.field} className="cursor-values-row">
                  <span className="cursor-values-color" style={{ background: p.color }} />
                  <span className="cursor-values-label">{p.label}</span>
                  <span className="cursor-values-val">{formatCursorVal(p.value)}</span>
                </div>
              ))}
            </div>
          </>)})()}
        </>
      )}
      {pointInfo && (
        <>
          <div className="cursor-dot" style={{ left: pointInfo.x - 4, top: pointInfo.y - 4, width: 9, height: 9, background: '#000', border: `2px solid ${pointInfo.color}` }} />
          <div className="point-tooltip" style={{ left: pointInfo.x + 12, top: pointInfo.y - 20 }}>
            <div>name: <span style={{ color: pointInfo.color }}>{pointInfo.label}</span></div>
            <div>time: {pointInfo.time.toFixed(3)}</div>
            <div>value: {formatCursorVal(pointInfo.value)}</div>
          </div>
        </>
      )}
      <PlotLegend
        panelId={panelId}
        series={series}
        hiddenSeries={hiddenSeries}
        onToggleVisibility={handleToggleVisibility}
        onRemoveSeries={handleRemoveSeries}
      />
    </>
  )
}

function formatCursorVal(v: number): string {
  if (Number.isInteger(v)) return v.toString()
  return v.toFixed(3)
}
