import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { PLOT_COLORS } from '../../constants'

interface Props {
  panelId: string
  series: string[]
}

export default function XYPlot({ panelId: _panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const data = useDataStore((s) => s.data)
  const setCursor = useCursorStore((s) => s.setCursor)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const xField = series[0]
    const yField = series[1]
    if (!xField || !yField) return

    const xData = data[xField]
    const yData = data[yField]
    if (!xData || !yData) return

    const xVals = Array.from(xData.values)
    const yVals = Array.from(yData.values)

    // Use minimum length if different sizes
    const len = Math.min(xVals.length, yVals.length)

    // Sort by X values for uPlot to render correctly
    const indices = Array.from({ length: len }, (_, i) => i)
    indices.sort((a, b) => xVals[a]! - xVals[b]!)
    const sortedX = indices.map((i) => xVals[i]!)
    const sortedY = indices.map((i) => yVals[i]!)

    const plotData: uPlot.AlignedData = [sortedX, sortedY]

    const xLabel = xField.split('/').slice(-1)[0] ?? xField
    const yLabel = yField.split('/').slice(-1)[0] ?? yField

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: el.clientHeight,
      cursor: {
        y: false,
        sync: {
          key: 'webjuggler',
          setSeries: false,
        },
      },
      hooks: {
        setCursor: [
          (u: uPlot) => {
            const idx = u.cursor.idx
            if (idx != null && u.data[0]) {
              // For X-Y plots, sync by index into the original timestamps
              const origIdx = indices[idx]
              if (origIdx != null) {
                const ts = xData.timestamps[origIdx]
                if (ts != null) {
                  setCursor(ts)
                }
              }
            }
          },
        ],
      },
      series: [
        { label: xLabel },
        {
          label: yLabel,
          stroke: PLOT_COLORS[0],
          width: 1.5,
          points: { show: true, size: 3, fill: PLOT_COLORS[0] },
        },
      ],
      axes: [
        {
          stroke: '#666',
          grid: { stroke: '#1a1a2e', width: 1 },
          ticks: { stroke: '#333', width: 1 },
          label: xLabel,
          labelSize: 16,
          labelFont: '11px -apple-system, BlinkMacSystemFont, sans-serif',
          font: '11px -apple-system, BlinkMacSystemFont, sans-serif',
        },
        {
          stroke: '#666',
          grid: { stroke: '#1a1a2e', width: 1 },
          ticks: { stroke: '#333', width: 1 },
          label: yLabel,
          labelSize: 16,
          labelFont: '11px -apple-system, BlinkMacSystemFont, sans-serif',
          font: '11px -apple-system, BlinkMacSystemFont, sans-serif',
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

  return <div ref={containerRef} className="xy-plot" />
}
