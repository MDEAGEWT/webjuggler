import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { useLayoutStore } from '../../stores/useLayoutStore'
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
  const cursorSphereRef = useRef<THREE.Mesh | null>(null)
  const normalizedPositionsRef = useRef<Float32Array | null>(null)
  const timestampsRef = useRef<Float64Array | null>(null)
  const data = useDataStore((s) => s.data)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const cursorTs = useCursorStore((s) => s.timestamp)
  const theme = useThemeStore((s) => s.theme)
  const axisNegate = useLayoutStore((s) => {
    const plot = findPlotNode(s.root, panelId)
    return plot?.axisNegate ?? DEFAULT_NEGATE
  })

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

    const xField = series[0]
    const yField = series[1]
    const zField = series[2]
    if (!xField || !yField || !zField) return

    const xData = data[xField]
    const yData = data[yField]
    const zData = data[zField]
    if (!xData || !yData || !zData) return

    const len = Math.min(
      xData.values.length,
      yData.values.length,
      zData.values.length,
    )
    if (len === 0) return

    // Cleanup previous
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    // Read theme colors
    const cs = getComputedStyle(document.documentElement)
    const sceneBg = cs.getPropertyValue('--scene-bg').trim()
    const accentColor = cs.getPropertyValue('--accent').trim()
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // cap DPR to reduce GPU load

    // Handle WebGL context loss gracefully
    const canvas = renderer.domElement
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault() })
    canvas.addEventListener('webglcontextrestored', () => { renderer.setSize(el.clientWidth, el.clientHeight) })
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1

    // Normalize data to [-1, 1] range
    let xMin = Infinity, xMax = -Infinity
    let yMin = Infinity, yMax = -Infinity
    let zMin = Infinity, zMax = -Infinity

    const negX = axisNegate[0] ? -1 : 1
    const negY = axisNegate[1] ? -1 : 1
    const negZ = axisNegate[2] ? -1 : 1

    for (let i = 0; i < len; i++) {
      const xv = xData.values[i]! * negX, yv = yData.values[i]! * negY, zv = zData.values[i]! * negZ
      if (xv < xMin) xMin = xv; if (xv > xMax) xMax = xv
      if (yv < yMin) yMin = yv; if (yv > yMax) yMax = yv
      if (zv < zMin) zMin = zv; if (zv > zMax) zMax = zv
    }
    // Note: axis mapping below: data X→X, data Y→Z(depth), data Z→Y(up)

    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1
    const zRange = zMax - zMin || 1

    const positions = new Float32Array(len * 3)
    for (let i = 0; i < len; i++) {
      // Map data XYZ → Three.js: X→X, Y→Z, Z→Y (so Z-axis is vertical in Three.js Y-up)
      positions[i * 3]     = ((xData.values[i]! * negX - xMin) / xRange) * 2 - 1
      positions[i * 3 + 1] = ((zData.values[i]! * negZ - zMin) / zRange) * 2 - 1  // data Z → Three.js Y (up)
      positions[i * 3 + 2] = ((yData.values[i]! * negY - yMin) / yRange) * 2 - 1  // data Y → Three.js Z (depth)
    }

    // Store for cursor updates
    normalizedPositionsRef.current = positions
    timestampsRef.current = xData.timestamps

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // Trajectory line
    const lineMaterial = new THREE.LineBasicMaterial({
      color: accentColor,
      opacity: 0.8,
      transparent: true,
    })
    const line = new THREE.Line(geometry, lineMaterial)
    scene.add(line)

    // Tiny points
    const material = new THREE.PointsMaterial({
      color: accentColor,
      size: 0.02,
      sizeAttenuation: true,
    })
    const points = new THREE.Points(geometry, material)
    scene.add(points)

    // Cursor sphere — follows synced timestamp
    const sphereGeom = new THREE.SphereGeometry(0.04, 16, 16)
    const sphereMat = new THREE.MeshBasicMaterial({ color: cursorColor })
    const cursorSphere = new THREE.Mesh(sphereGeom, sphereMat)
    cursorSphere.visible = false
    scene.add(cursorSphere)
    cursorSphereRef.current = cursorSphere

    // Axis lines — mapped: Three.js X=data X, Three.js Y(up)=data Z, Three.js Z(depth)=data Y
    const axisLen = 1.3
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1 + axisLen * 2, -1, -1), 0xff4444)  // X axis (horizontal right)
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1, -1 + axisLen * 2, -1), 0x4444ff)  // Z axis (vertical up)
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1, -1, -1 + axisLen * 2), 0x44ff44)  // Y axis (depth)

    // Axis labels — simple X/Y/Z
    createAxisLabel(scene, 'X', new THREE.Vector3(1.5, -1.2, -1), '#ff6666')
    createAxisLabel(scene, 'Z', new THREE.Vector3(-1.2, 1.5, -1), '#6666ff')
    createAxisLabel(scene, 'Y', new THREE.Vector3(-1.2, -1.2, 1.5), '#66ff66')

    // Grid
    const gridHelper = new THREE.GridHelper(2, 10, gridMajor, gridMinor)
    gridHelper.position.y = -1
    scene.add(gridHelper)

    // Camera
    camera.position.set(2.5, 2, 2.5)
    camera.lookAt(0, 0, 0)

    // Animation loop
    let animFrameId: number
    function animate() {
      animFrameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Resize
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
      geometry.dispose()
      sphereGeom.dispose()
      sphereMat.dispose()
      lineMaterial.dispose()
      material.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
      cursorSphereRef.current = null
      normalizedPositionsRef.current = null
      timestampsRef.current = null
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [series, data, theme, axisNegate])

  // Update cursor sphere position when synced timestamp changes
  useEffect(() => {
    const sphere = cursorSphereRef.current
    const positions = normalizedPositionsRef.current
    const timestamps = timestampsRef.current
    if (!sphere || !positions || !timestamps) return

    if (cursorTs == null) {
      sphere.visible = false
      return
    }

    // Find nearest timestamp index
    let bestIdx = 0
    let bestDist = Math.abs(timestamps[0]! - cursorTs)
    for (let i = 1; i < timestamps.length; i++) {
      const d = Math.abs(timestamps[i]! - cursorTs)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }

    sphere.position.set(
      positions[bestIdx * 3]!,
      positions[bestIdx * 3 + 1]!,
      positions[bestIdx * 3 + 2]!,
    )
    sphere.visible = true
  }, [cursorTs])

  const xLabel = series[0]?.split('/').slice(-1)[0] ?? 'X'
  const yLabel = series[1]?.split('/').slice(-1)[0] ?? 'Y'
  const zLabel = series[2]?.split('/').slice(-1)[0] ?? 'Z'

  return (
    <div className="three-d-plot" style={{ position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
      <AxisControls panelId={panelId} axisLabels={[xLabel, yLabel, zLabel]} axisNegate={[!!axisNegate[0], !!axisNegate[1], !!axisNegate[2]]} />
    </div>
  )
}
