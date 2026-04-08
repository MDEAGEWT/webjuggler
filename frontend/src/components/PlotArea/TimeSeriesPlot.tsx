import { useCallback, useEffect, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useZoomStore } from '../../stores/useZoomStore'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useFileStore } from '../../stores/useFileStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { PLOT_COLORS } from '../../constants'
import PlotLegend from './PlotLegend'

/** Extract a short display label from composite "fileId:topic/field" path */
function seriesLabel(compositeField: string): string {
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

interface Props {
  panelId: string
  series: string[]
}

/** Get color for a series by its index within the plot (not hash-based) */
function getSeriesColor(index: number): string {
  return PLOT_COLORS[index % PLOT_COLORS.length]!
}

export default function TimeSeriesPlot({ panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const data = useDataStore((s) => s.data)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const setCursor = useCursorStore((s) => s.setCursor)
  const removeSeries = useLayoutStore((s) => s.removeSeries)
  const colorOverrides = useLayoutStore((s) => s.colorOverrides)
  const theme = useThemeStore((s) => s.theme)

  // On mount / series change, fetch any missing field data (e.g. after restore from localStorage)
  useEffect(() => {
    const missing = series.filter((s) => !useDataStore.getState().data[s])
    if (missing.length > 0) {
      fetchFields(missing)
    }
  }, [series, fetchFields])

  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())
  const [cursorValues, setCursorValues] = useState<Record<string, number | null>>({})

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
            aligned[i] = fd.values[j]!
            j++
          }
        }
        return aligned
      }),
    ]

    const seriesOpts: uPlot.Series[] = [
      { label: 'Time' },
      ...availableSeries.map((s, i) => ({
        label: seriesLabel(s),
        stroke: colorOverrides[s] ?? getSeriesColor(i),
        width: 1.5,
        show: !hiddenRef.current.has(s),
      })),
    ]

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: el.clientHeight,
      legend: { show: false },
      cursor: {
        y: false,
        sync: {
          key: 'webjuggler',
          setSeries: false,
        },
        focus: {
          prox: 30,
        },
      },
      hooks: {
        setCursor: [
          (u: uPlot) => {
            const idx = u.cursor.idx
            if (idx != null && u.data[0]) {
              const ts = u.data[0][idx]
              if (ts != null) {
                setCursor(ts)
              }
              // Update cursor values for legend
              const vals: Record<string, number | null> = {}
              const avail = availableSeriesRef.current
              avail.forEach((field, i) => {
                const seriesData = u.data[i + 1]
                const v = seriesData ? seriesData[idx] : null
                vals[field] = v ?? null
              })
              setCursorValues(vals)
            }
          },
        ],
        setScale: [
          (u: uPlot, scaleKey: string) => {
            if (scaleKey === 'x') {
              const min = u.scales.x?.min
              const max = u.scales.x?.max
              if (min != null && max != null) {
                useZoomStore.getState().setRange(min, max, panelId)
              }
            }
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
  }, [series, data, setCursor, theme, colorOverrides])

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

  return (
    <>
      <div ref={containerRef} className="time-series-plot" />
      <PlotLegend
        panelId={panelId}
        series={series}
        cursorValues={cursorValues}
        hiddenSeries={hiddenSeries}
        onToggleVisibility={handleToggleVisibility}
        onRemoveSeries={handleRemoveSeries}
      />
    </>
  )
}
