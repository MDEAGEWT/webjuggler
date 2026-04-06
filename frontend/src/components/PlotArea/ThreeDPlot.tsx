import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'

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

export default function ThreeDPlot({ panelId: _panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  // Store refs for cursor sphere updates without re-creating the scene
  const cursorSphereRef = useRef<THREE.Mesh | null>(null)
  const normalizedPositionsRef = useRef<Float32Array | null>(null)
  const timestampsRef = useRef<Float64Array | null>(null)
  const data = useDataStore((s) => s.data)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const cursorTs = useCursorStore((s) => s.timestamp)

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

    // Setup scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#12122a')

    const camera = new THREE.PerspectiveCamera(
      60,
      el.clientWidth / el.clientHeight,
      0.1,
      1000,
    )

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1

    // Normalize data to [-1, 1] range
    let xMin = Infinity, xMax = -Infinity
    let yMin = Infinity, yMax = -Infinity
    let zMin = Infinity, zMax = -Infinity

    for (let i = 0; i < len; i++) {
      const xv = xData.values[i]!, yv = yData.values[i]!, zv = zData.values[i]!
      if (xv < xMin) xMin = xv; if (xv > xMax) xMax = xv
      if (yv < yMin) yMin = yv; if (yv > yMax) yMax = yv
      if (zv < zMin) zMin = zv; if (zv > zMax) zMax = zv
    }

    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1
    const zRange = zMax - zMin || 1

    const positions = new Float32Array(len * 3)
    for (let i = 0; i < len; i++) {
      positions[i * 3] = ((xData.values[i]! - xMin) / xRange) * 2 - 1
      positions[i * 3 + 1] = ((yData.values[i]! - yMin) / yRange) * 2 - 1
      positions[i * 3 + 2] = ((zData.values[i]! - zMin) / zRange) * 2 - 1
    }

    // Store for cursor updates
    normalizedPositionsRef.current = positions
    timestampsRef.current = xData.timestamps

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // Trajectory line
    const lineMaterial = new THREE.LineBasicMaterial({
      color: '#4fc3f7',
      opacity: 0.8,
      transparent: true,
    })
    const line = new THREE.Line(geometry, lineMaterial)
    scene.add(line)

    // Tiny points
    const material = new THREE.PointsMaterial({
      color: '#4fc3f7',
      size: 0.02,
      sizeAttenuation: true,
    })
    const points = new THREE.Points(geometry, material)
    scene.add(points)

    // Cursor sphere — follows synced timestamp
    const sphereGeom = new THREE.SphereGeometry(0.04, 16, 16)
    const sphereMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
    const cursorSphere = new THREE.Mesh(sphereGeom, sphereMat)
    cursorSphere.visible = false
    scene.add(cursorSphere)
    cursorSphereRef.current = cursorSphere

    // Axis lines
    const axisLen = 1.3
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1 + axisLen * 2, -1, -1), 0xff4444)
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1, -1 + axisLen * 2, -1), 0x44ff44)
    createAxisLine(scene, new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1, -1, -1 + axisLen * 2), 0x4444ff)

    // Axis labels
    const xLabel = xField.split('/').slice(-1)[0] ?? xField
    const yLabel = yField.split('/').slice(-1)[0] ?? yField
    const zLabel = zField.split('/').slice(-1)[0] ?? zField
    createAxisLabel(scene, xLabel, new THREE.Vector3(1.5, -1.2, -1), '#ff6666')
    createAxisLabel(scene, yLabel, new THREE.Vector3(-1.2, 1.5, -1), '#66ff66')
    createAxisLabel(scene, zLabel, new THREE.Vector3(-1.2, -1.2, 1.5), '#6666ff')

    // Grid
    const gridHelper = new THREE.GridHelper(2, 10, '#1a1a3e', '#1a1a2e')
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
  }, [series, data])

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

  return <div ref={containerRef} className="three-d-plot" />
}
