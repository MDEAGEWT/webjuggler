import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { useLayoutStore, selectActiveRoot } from '../../stores/useLayoutStore'
import { useFileStore } from '../../stores/useFileStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { PLOT_COLORS } from '../../constants'
import AxisControls from './AxisControls'
import type { LayoutNode, PlotNode } from '../../types'

const DEFAULT_NEGATE = [false, false, false] as boolean[]
const DEFAULT_MAPPING = [0, 1, 2] as number[]

function findPlotNode(node: LayoutNode, id: string): PlotNode | null {
  if (node.type === 'plot') return node.id === id ? node : null
  return findPlotNode(node.children[0], id) ?? findPlotNode(node.children[1], id)
}

interface Props {
  panelId: string
  series: string[]
}

function createAxisLine(
  scene: THREE.Scene,
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: number,
) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to])
  const material = new THREE.LineBasicMaterial({ color })
  scene.add(new THREE.Line(geometry, material))
}

function createAxisLabel(
  scene: THREE.Scene,
  text: string,
  position: THREE.Vector3,
  color: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = 'transparent'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color
  ctx.font = '28px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
  })
  const sprite = new THREE.Sprite(spriteMaterial)
  sprite.position.copy(position)
  sprite.scale.set(1.0, 0.25, 1)
  scene.add(sprite)
}

export default function ThreeDPlot({ panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const cursorGroupsRef = useRef<{ sphere: THREE.Mesh; positions: Float32Array; timestamps: Float64Array }[]>([])
  const data = useDataStore((s) => s.adjustedData)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const cursorTs = useCursorStore((s) => s.timestamp)
  const theme = useThemeStore((s) => s.theme)
  const root = useLayoutStore(selectActiveRoot)
  const axisNegate = (() => {
    const plot = findPlotNode(root, panelId)
    return plot?.axisNegate ?? DEFAULT_NEGATE
  })()
  const axisMapping = (() => {
    const plot = findPlotNode(root, panelId)
    return plot?.axisMapping ?? DEFAULT_MAPPING
  })()
  const showLegend = useSettingsStore((s) => s.showLegend)
  const legendPosition = useSettingsStore((s) => s.legendPosition)

  // On mount / series change, fetch any missing field data (e.g. after restore from localStorage)
  useEffect(() => {
    const missing = series.filter((s) => !useDataStore.getState().data[s])
    if (missing.length > 0) {
      fetchFields(missing)
    }
  }, [series, fetchFields])

  // Build scene once when data changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Build trajectory groups: every 3 series = 1 trajectory
    const mapping = axisMapping
    const negX = axisNegate[0] ? -1 : 1
    const negY = axisNegate[1] ? -1 : 1
    const negZ = axisNegate[2] ? -1 : 1

    interface TrajectoryGroup {
      xData: { values: Float64Array; timestamps: Float64Array }
      yData: { values: Float64Array }
      zData: { values: Float64Array }
      len: number
      color: string
    }

    const groups: TrajectoryGroup[] = []
    for (let g = 0; g + 2 < series.length; g += 3) {
      const xField = series[g + mapping[0]!]
      const yField = series[g + mapping[1]!]
      const zField = series[g + mapping[2]!]
      if (!xField || !yField || !zField) continue
      const xd = data[xField], yd = data[yField], zd = data[zField]
      if (!xd || !yd || !zd) continue
      const len = Math.min(xd.values.length, yd.values.length, zd.values.length)
      if (len === 0) continue
      groups.push({
        xData: xd, yData: yd, zData: zd, len,
        color: PLOT_COLORS[g / 3 % PLOT_COLORS.length]!,
      })
    }
    if (groups.length === 0) return

    // Cleanup previous
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    // Read theme colors
    const cs = getComputedStyle(document.documentElement)
    const sceneBg = cs.getPropertyValue('--scene-bg').trim()
    const cursorColor = cs.getPropertyValue('--cursor-stroke').trim()
    const gridMajor = cs.getPropertyValue('--grid-3d-major').trim()
    const gridMinor = cs.getPropertyValue('--grid-3d-minor').trim()

    // Setup scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(sceneBg)

    const camera = new THREE.PerspectiveCamera(
      60,
      el.clientWidth / el.clientHeight,
      0.1,
      1000,
    )

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const canvas = renderer.domElement
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault() })
    canvas.addEventListener('webglcontextrestored', () => { renderer.setSize(el.clientWidth, el.clientHeight) })
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1

    // Compute bounds across ALL groups
    let xMin = Infinity, xMax = -Infinity
    let yMin = Infinity, yMax = -Infinity
    let zMin = Infinity, zMax = -Infinity

    for (const g of groups) {
      for (let i = 0; i < g.len; i++) {
        const xv = g.xData.values[i]! * negX
        const yv = g.yData.values[i]! * negY
        const zv = g.zData.values[i]! * negZ
        if (xv < xMin) xMin = xv; if (xv > xMax) xMax = xv
        if (yv < yMin) yMin = yv; if (yv > yMax) yMax = yv
        if (zv < zMin) zMin = zv; if (zv > zMax) zMax = zv
      }
    }

    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1
    const zRange = zMax - zMin || 1

    // Track disposables for cleanup
    const disposables: { dispose: () => void }[] = []
    const cursorGroups: { sphere: THREE.Mesh; positions: Float32Array; timestamps: Float64Array }[] = []

    // Render each trajectory group
    for (const g of groups) {
      const positions = new Float32Array(g.len * 3)
      for (let i = 0; i < g.len; i++) {
        positions[i * 3]     = ((g.xData.values[i]! * negX - xMin) / xRange) * 2 - 1
        positions[i * 3 + 1] = ((g.zData.values[i]! * negZ - zMin) / zRange) * 2 - 1
        positions[i * 3 + 2] = ((g.yData.values[i]! * negY - yMin) / yRange) * 2 - 1
      }

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      disposables.push(geometry)

      const lineMaterial = new THREE.LineBasicMaterial({
        color: g.color,
        opacity: 0.8,
        transparent: true,
      })
      disposables.push(lineMaterial)
      scene.add(new THREE.Line(geometry, lineMaterial))

      const ptMaterial = new THREE.PointsMaterial({
        color: g.color,
        size: 0.02,
        sizeAttenuation: true,
      })
      disposables.push(ptMaterial)
      scene.add(new THREE.Points(geometry, ptMaterial))

      // Cursor sphere per trajectory
      const sphereGeom = new THREE.SphereGeometry(0.018, 10, 10)
      const sphereMat = new THREE.MeshBasicMaterial({ color: cursorColor })
      const sphere = new THREE.Mesh(sphereGeom, sphereMat)
      sphere.visible = false
      scene.add(sphere)
      disposables.push(sphereGeom, sphereMat)
      cursorGroups.push({ sphere, positions, timestamps: g.xData.timestamps })
    }

    cursorGroupsRef.current = cursorGroups

    // Axis lines
    const axisLen = 1.3
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1 + axisLen * 2, -1, -1), 0xff4444)
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1, -1 + axisLen * 2, -1), 0x4444ff)
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1, -1, -1 + axisLen * 2), 0x44ff44)

    createAxisLabel(scene, 'X', new THREE.Vector3(1.5, -1.2, -1), '#ff6666')
    createAxisLabel(scene, 'Z', new THREE.Vector3(-1.2, 1.5, -1), '#6666ff')
    createAxisLabel(scene, 'Y', new THREE.Vector3(-1.2, -1.2, 1.5), '#66ff66')

    const gridHelper = new THREE.GridHelper(2, 10, gridMajor, gridMinor)
    gridHelper.position.y = -1
    scene.add(gridHelper)

    camera.position.set(2.5, 2, 2.5)
    camera.lookAt(0, 0, 0)

    let animFrameId: number
    function animate() {
      animFrameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        camera.aspect = el.clientWidth / el.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(el.clientWidth, el.clientHeight)
      }
    })
    resizeObserver.observe(el)

    cleanupRef.current = () => {
      cancelAnimationFrame(animFrameId)
      resizeObserver.disconnect()
      controls.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
      cursorGroupsRef.current = []
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [series, data, theme, axisNegate, axisMapping])

  // Update cursor sphere positions when synced timestamp changes
  useEffect(() => {
    const groups = cursorGroupsRef.current
    if (groups.length === 0) return

    if (cursorTs == null) {
      for (const g of groups) g.sphere.visible = false
      return
    }

    for (const g of groups) {
      let bestIdx = 0
      let bestDist = Math.abs(g.timestamps[0]! - cursorTs)
      for (let i = 1; i < g.timestamps.length; i++) {
        const d = Math.abs(g.timestamps[i]! - cursorTs)
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      g.sphere.position.set(
        g.positions[bestIdx * 3]!,
        g.positions[bestIdx * 3 + 1]!,
        g.positions[bestIdx * 3 + 2]!,
      )
      g.sphere.visible = true
    }
  }, [cursorTs])

  const mapping = axisMapping
  const xLabel = series[mapping[0]!]?.split('/').slice(-1)[0] ?? 'X'
  const yLabel = series[mapping[1]!]?.split('/').slice(-1)[0] ?? 'Y'
  const zLabel = series[mapping[2]!]?.split('/').slice(-1)[0] ?? 'Z'

  // Build legend entries (one per trajectory group)
  const files = useFileStore((s) => s.files)
  const legendEntries: { color: string; label: string }[] = []
  for (let g = 0; g + 2 < series.length; g += 3) {
    const stripFileId = (s: string) => { const i = s.indexOf(':'); return i >= 0 ? s.substring(i + 1) : s }
    const getFilePrefix = (s: string) => {
      if (files.length <= 1) return ''
      const colonIdx = s.indexOf(':')
      if (colonIdx < 0) return ''
      const fid = s.substring(0, colonIdx)
      const file = files.find((f) => f.fileId === fid)
      return `[${file ? file.shortName : fid.substring(0, 6)}] `
    }
    const fields = [series[g]!, series[g + 1]!, series[g + 2]!].map(stripFileId)
    const names = fields.map((f) => f.split('/').slice(-1)[0] ?? f)
    const topic = fields[0]!.split('/').slice(0, -1).join('/')
    const prefix = getFilePrefix(series[g]!)
    const label = topic ? `${prefix}${topic} (${names.join(', ')})` : `${prefix}${names.join(', ')}`
    legendEntries.push({ color: PLOT_COLORS[g / 3 % PLOT_COLORS.length]!, label })
  }

  return (
    <div className="three-d-plot" style={{ position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
      {legendEntries.length > 0 && showLegend && (
        <div className={`xy-legend xy-legend-${legendPosition}`}>
          {legendEntries.map((entry, i) => (
            <div key={i} className="xy-legend-item">
              <span className="xy-legend-color" style={{ background: entry.color }} />
              <span className="xy-legend-label">{entry.label}</span>
            </div>
          ))}
        </div>
      )}
      <AxisControls panelId={panelId} axisLabels={[xLabel, yLabel, zLabel]} axisNegate={[!!axisNegate[0], !!axisNegate[1], !!axisNegate[2]]} />
    </div>
  )
}
