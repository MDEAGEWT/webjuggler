import { useEffect, useRef, useCallback, useMemo } from 'react'
import { usePlaybackStore } from '../stores/usePlaybackStore'
import { useCursorStore } from '../stores/useCursorStore'
import { useDataStore } from '../stores/useDataStore'
import { useZoomStore } from '../stores/useZoomStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useFileStore } from '../stores/useFileStore'

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10]

export default function PlaybackBar() {
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const speed = usePlaybackStore((s) => s.speed)
  const timeRange = usePlaybackStore((s) => s.timeRange)
  const cursor = useCursorStore((s) => s.timestamp)
  const xMin = useZoomStore((s) => s.xMin)
  const xMax = useZoomStore((s) => s.xMax)
  const data = useDataStore((s) => s.adjustedData)
  const timeMode = useSettingsStore((s) => s.timeMode)
  const setTimeMode = useSettingsStore((s) => s.setTimeMode)
  const files = useFileStore((s) => s.files)
  const gpsAvailable = files.length > 0 && files.every((f) => f.gpsOffsetUs != null)

  const lastFrameRef = useRef<number | null>(null)
  const rafRef = useRef<number>(0)

  // Compute global time range from all loaded data
  useEffect(() => {
    const keys = Object.keys(data)
    if (keys.length === 0) {
      usePlaybackStore.getState().setTimeRange(0, 0)
      return
    }
    let gMin = Infinity
    let gMax = -Infinity
    for (const key of keys) {
      const fd = data[key]
      if (!fd || fd.timestamps.length === 0) continue
      const first = fd.timestamps[0]!
      const last = fd.timestamps[fd.timestamps.length - 1]!
      if (first < gMin) gMin = first
      if (last > gMax) gMax = last
    }
    if (gMin !== Infinity) {
      usePlaybackStore.getState().setTimeRange(gMin, gMax)
    }
  }, [data])

  // Effective range: zoomed range if set, otherwise full data range
  const effectiveRange = useMemo(() => {
    if (xMin != null && xMax != null) return { min: xMin, max: xMax }
    return timeRange
  }, [xMin, xMax, timeRange])

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !effectiveRange || effectiveRange.min >= effectiveRange.max) {
      lastFrameRef.current = null
      return
    }

    const tick = (now: number) => {
      if (lastFrameRef.current != null) {
        const dt = (now - lastFrameRef.current) / 1000 // seconds
        const advance = dt * speed
        const currentCursor = useCursorStore.getState().timestamp
        let next = (currentCursor ?? effectiveRange.min) + advance
        if (next > effectiveRange.max) {
          next = effectiveRange.min
        }
        useCursorStore.getState().setCursor(next)
      }
      lastFrameRef.current = now
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastFrameRef.current = null
    }
  }, [isPlaying, speed, effectiveRange])

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value)
      useCursorStore.getState().setCursor(val)
    },
    [],
  )

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      usePlaybackStore.getState().setSpeed(parseFloat(e.target.value))
    },
    [],
  )

  const handleStepBack = useCallback(() => {
    if (!effectiveRange) return
    const cur = useCursorStore.getState().timestamp ?? effectiveRange.min
    const duration = effectiveRange.max - effectiveRange.min
    const step = duration * 0.02
    useCursorStore.getState().setCursor(Math.max(effectiveRange.min, cur - step))
  }, [effectiveRange])

  const handleStepForward = useCallback(() => {
    if (!effectiveRange) return
    const cur = useCursorStore.getState().timestamp ?? effectiveRange.min
    const duration = effectiveRange.max - effectiveRange.min
    const step = duration * 0.02
    useCursorStore.getState().setCursor(Math.min(effectiveRange.max, cur + step))
  }, [effectiveRange])

  const sliderMin = effectiveRange?.min ?? 0
  const sliderMax = effectiveRange?.max ?? 1
  const sliderValue = cursor ?? sliderMin
  const duration = sliderMax - sliderMin
  const elapsed = sliderValue - sliderMin

  const formatTime = (t: number) => t.toFixed(1)

  return (
    <div className="playback-bar">
      <button className="playback-btn" onClick={handleStepBack} title="Step back">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="6,0 0,6 6,12"/><polygon points="12,0 6,6 12,12"/></svg>
      </button>
      <button
        className="playback-btn"
        onClick={() => usePlaybackStore.getState().togglePlay()}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,0 12,6 2,12"/></svg>
        )}
      </button>
      <button className="playback-btn" onClick={handleStepForward} title="Step forward">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 6,6 0,12"/><polygon points="6,0 12,6 6,12"/></svg>
      </button>
      <input
        type="range"
        className="playback-slider"
        min={sliderMin}
        max={sliderMax}
        step={(sliderMax - sliderMin) / 10000 || 0.001}
        value={sliderValue}
        onChange={handleSliderChange}
      />
      <span className="playback-time">
        {formatTime(elapsed)}s / {formatTime(duration)}s
      </span>
      <select
        className="playback-speed"
        value={speed}
        onChange={handleSpeedChange}
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
      <select
        className="playback-time-mode"
        value={timeMode}
        onChange={(e) => setTimeMode(e.target.value as 'boot' | 'gps')}
      >
        <option value="boot">Boot Time</option>
        <option value="gps" disabled={!gpsAvailable}>
          GPS Time{!gpsAvailable ? ' (no data)' : ''}
        </option>
      </select>
    </div>
  )
}
