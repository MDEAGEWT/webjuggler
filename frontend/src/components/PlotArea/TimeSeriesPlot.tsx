import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useZoomStore } from '../../stores/useZoomStore'
import { PLOT_COLORS } from '../../constants'

interface Props {
  panelId: string
  series: string[]
}

function hashColorIndex(path: string): number {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 31 + path.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % PLOT_COLORS.length
}

export default function TimeSeriesPlot({ panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const data = useDataStore((s) => s.data)
  const setCursor = useCursorStore((s) => s.setCursor)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Gather aligned data: find common timestamps from first series
    const availableSeries = series.filter((s) => data[s])
    if (availableSeries.length === 0) return

    // Use first available series timestamps as x-axis
    const firstData = data[availableSeries[0]!]!
    const timestamps = new Float64Array(firstData.timestamps)

    // Build uPlot data: [timestamps, ...values]
    const plotData: uPlot.AlignedData = [
      Array.from(timestamps),
      ...availableSeries.map((s) => {
        const fd = data[s]
        if (!fd) return Array.from(new Float64Array(timestamps.length))
        // If same length, use directly; otherwise fill with nulls
        if (fd.timestamps.length === timestamps.length) {
          return Array.from(fd.values)
        }
        // Attempt alignment by matching timestamps
        const aligned = new Array<number | null>(timestamps.length).fill(null)
        let j = 0
        for (let i = 0; i < timestamps.length && j < fd.timestamps.length; i++) {
          if (timestamps[i] === fd.timestamps[j]) {
            aligned[i] = fd.values[j]!
            j++
          }
        }
        return aligned
      }),
    ]

    const seriesOpts: uPlot.Series[] = [
      { label: 'Time' },
      ...availableSeries.map((s) => ({
        label: s.split('/').slice(-1)[0] ?? s,
        stroke: PLOT_COLORS[hashColorIndex(s)],
        width: 1.5,
      })),
    ]

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: el.clientHeight,
      cursor: {
        // X cursor syncs across plots (vertical line on time axis)
        // Y cursor only shows on the active (hovered) plot
        y: false,
        sync: {
          key: 'webjuggler',
          setSeries: false, // don't highlight series on synced plots
        },
        focus: {
          prox: 30, // highlight nearest series within 30px on hovered plot
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
          stroke: '#666',
          grid: { stroke: '#1a1a2e', width: 1 },
          ticks: { stroke: '#333', width: 1 },
        },
        {
          stroke: '#666',
          grid: { stroke: '#1a1a2e', width: 1 },
          ticks: { stroke: '#333', width: 1 },
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
  }, [series, data, setCursor])

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

  return <div ref={containerRef} className="time-series-plot" />
}
