import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useThemeStore } from '../../stores/useThemeStore'

interface Props {
  panelId: string
  series: string[]
}

function createAxisLabel(
  text: string,
  position: THREE.Vector3,
  color: string,
): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = color
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
  })
  const sprite = new THREE.Sprite(spriteMaterial)
  sprite.position.copy(position)
  sprite.scale.set(0.4, 0.2, 1)
  return sprite
}

/** Binary search for nearest timestamp index */
function findNearestIndex(timestamps: Float64Array, target: number): number {
  let lo = 0
  let hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (timestamps[mid]! < target) lo = mid + 1
    else hi = mid
  }
  // Check neighbors for closest
  if (lo > 0 && Math.abs(timestamps[lo - 1]! - target) < Math.abs(timestamps[lo]! - target)) {
    return lo - 1
  }
  return lo
}

const RAD_TO_DEG = 180 / Math.PI

export default function AttitudeView({ panelId: _panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const axisGroupRef = useRef<THREE.Group | null>(null)
  const data = useDataStore((s) => s.data)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const cursorTs = useCursorStore((s) => s.timestamp)
  const theme = useThemeStore((s) => s.theme)

  const [euler, setEuler] = useState<{ roll: number; pitch: number; yaw: number } | null>(null)

  // Fetch missing field data on mount / series change
  useEffect(() => {
    const missing = series.filter((s) => !useDataStore.getState().data[s])
    if (missing.length > 0) {
      fetchFields(missing)
    }
  }, [series, fetchFields])

  // Build scene once when data/theme changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (series.length < 4) return

    // Check all 4 fields have data
    const fieldData = series.slice(0, 4).map((s) => data[s])
    if (fieldData.some((d) => !d)) return

    // Cleanup previous
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    // Read theme colors
    const cs = getComputedStyle(document.documentElement)
    const sceneBg = cs.getPropertyValue('--scene-bg').trim()

    // Setup scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(sceneBg)

    const camera = new THREE.PerspectiveCamera(
      50,
      el.clientWidth / el.clientHeight,
      0.1,
      100,
    )

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.enablePan = false

    // Ground grid (fixed reference)
    const gridHelper = new THREE.GridHelper(3, 12, 0x444466, 0x222244)
    const gridMat = gridHelper.material as THREE.Material | THREE.Material[]
    if (Array.isArray(gridMat)) {
      gridMat.forEach((m: THREE.Material) => { m.transparent = true; m.opacity = 0.4 })
    } else {
      gridMat.transparent = true
      gridMat.opacity = 0.4
    }
    scene.add(gridHelper)

    // Axis group that rotates with quaternion
    const axisGroup = new THREE.Group()
    scene.add(axisGroup)
    axisGroupRef.current = axisGroup

    const origin = new THREE.Vector3(0, 0, 0)
    const axisLength = 1.2

    // X axis (red) - forward
    const xArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), origin, axisLength, 0xff4444, 0.2, 0.1,
    )
    // Y axis (green) - right
    const yArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0), origin, axisLength, 0x44ff44, 0.2, 0.1,
    )
    // Z axis (blue) - down/up
    const zArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1), origin, axisLength, 0x4444ff, 0.2, 0.1,
    )

    axisGroup.add(xArrow, yArrow, zArrow)

    // Axis labels (attached to group so they rotate with the body)
    const labelOffset = axisLength + 0.15
    axisGroup.add(createAxisLabel('X', new THREE.Vector3(labelOffset, 0, 0), '#ff6666'))
    axisGroup.add(createAxisLabel('Y', new THREE.Vector3(0, labelOffset, 0), '#66ff66'))
    axisGroup.add(createAxisLabel('Z', new THREE.Vector3(0, 0, labelOffset), '#6666ff'))

    // Small origin sphere
    const originGeom = new THREE.SphereGeometry(0.04, 12, 12)
    const originMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
    axisGroup.add(new THREE.Mesh(originGeom, originMat))

    // Ambient light (for arrow helpers)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    // Camera position
    camera.position.set(2.5, 1.8, 2.5)
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
      originGeom.dispose()
      originMat.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
      axisGroupRef.current = null
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [series, data, theme])

  // Update quaternion when cursor timestamp changes
  useEffect(() => {
    const group = axisGroupRef.current
    if (!group) return
    if (series.length < 4) return

    const wData = data[series[0]!]
    const xData = data[series[1]!]
    const yData = data[series[2]!]
    const zData = data[series[3]!]
    if (!wData || !xData || !yData || !zData) return

    if (cursorTs == null) {
      // Reset to identity
      group.quaternion.set(0, 0, 0, 1)
      setEuler(null)
      return
    }

    // Find nearest values for each field
    const wIdx = findNearestIndex(wData.timestamps, cursorTs)
    const xIdx = findNearestIndex(xData.timestamps, cursorTs)
    const yIdx = findNearestIndex(yData.timestamps, cursorTs)
    const zIdx = findNearestIndex(zData.timestamps, cursorTs)

    const qw = wData.values[wIdx] ?? 1
    const qx = xData.values[xIdx] ?? 0
    const qy = yData.values[yIdx] ?? 0
    const qz = zData.values[zIdx] ?? 0

    // Three.js Quaternion constructor: (x, y, z, w)
    const q = new THREE.Quaternion(qx, qy, qz, qw)
    q.normalize()
    group.quaternion.copy(q)

    // Compute Euler angles for overlay
    const e = new THREE.Euler().setFromQuaternion(q, 'ZYX')
    setEuler({
      roll: e.x * RAD_TO_DEG,
      pitch: e.y * RAD_TO_DEG,
      yaw: e.z * RAD_TO_DEG,
    })
  }, [cursorTs, series, data])

  return (
    <div className="attitude-view">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {euler && (
        <div className="attitude-euler-overlay">
          Roll: {euler.roll.toFixed(1)}&deg; | Pitch: {euler.pitch.toFixed(1)}&deg; | Yaw: {euler.yaw.toFixed(1)}&deg;
        </div>
      )}
    </div>
  )
}
