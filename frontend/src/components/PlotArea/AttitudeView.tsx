import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useDataStore } from '../../stores/useDataStore'
import { useCursorStore } from '../../stores/useCursorStore'
import { useThemeStore } from '../../stores/useThemeStore'

interface Props {
  panelId: string
  series: string[]
}

function createTextSprite(text: string, color: string, scale = 0.35): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = color
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 64, 32)
  }
  const texture = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(scale, scale * 0.5, 1)
  return sprite
}

/** Create a colored rod (cylinder) + cone (tip) manually for reliable coloring */
function createAxis(
  dir: THREE.Vector3,
  rodColor: number,
  tipColor: number,
  length: number,
  opacity: number,
): THREE.Group {
  const group = new THREE.Group()

  // Rod: thin cylinder along dir
  const rodLen = length * 0.8
  const rodGeo = new THREE.CylinderGeometry(0.015, 0.015, rodLen, 8)
  const rodMat = new THREE.MeshBasicMaterial({ color: rodColor, transparent: true, opacity })
  const rod = new THREE.Mesh(rodGeo, rodMat)
  // Cylinder is along Y by default, rotate to align with dir
  rod.position.copy(dir.clone().multiplyScalar(rodLen / 2))
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  group.add(rod)

  // Tip: cone at the end
  const tipLen = length * 0.2
  const tipGeo = new THREE.ConeGeometry(0.05, tipLen, 12)
  const tipMat = new THREE.MeshBasicMaterial({ color: tipColor, transparent: true, opacity })
  const tip = new THREE.Mesh(tipGeo, tipMat)
  tip.position.copy(dir.clone().multiplyScalar(rodLen + tipLen / 2))
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  group.add(tip)

  return group
}

// Rod color per group (same color for all 3 axes within a group, warm vs cool)
const GROUP_ROD_COLORS = [0xff9933, 0x33ccdd, 0xcc66ff] // orange, cyan, violet
const AXIS_TIP_COLORS = [0xff4444, 0x44ff44, 0x4444ff]  // always R/G/B for X/Y/Z

function findNearestIndex(timestamps: Float64Array, target: number): number {
  let lo = 0, hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (timestamps[mid]! < target) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(timestamps[lo - 1]! - target) < Math.abs(timestamps[lo]! - target)) return lo - 1
  return lo
}

const RAD_TO_DEG = 180 / Math.PI

// PX4 NED → Three.js Y-up mapping:
// PX4 X (forward/North) → Three.js -Z
// PX4 Y (right/East)    → Three.js +X
// PX4 Z (down)           → Three.js -Y

export default function AttitudeView({ panelId: _panelId, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const axisGroupsRef = useRef<THREE.Group[]>([])
  const data = useDataStore((s) => s.data)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const cursorTs = useCursorStore((s) => s.timestamp)
  const theme = useThemeStore((s) => s.theme)

  const [eulers, setEulers] = useState<{ label: string; roll: number; pitch: number; yaw: number }[]>([])

  const quatGroupCount = Math.floor(series.length / 4)

  useEffect(() => {
    const missing = series.filter((s) => !useDataStore.getState().data[s])
    if (missing.length > 0) fetchFields(missing)
  }, [series, fetchFields])

  // Build scene
  useEffect(() => {
    const el = containerRef.current
    if (!el || quatGroupCount === 0) return

    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null }

    const cs = getComputedStyle(document.documentElement)
    const sceneBg = cs.getPropertyValue('--scene-bg').trim() || '#12122a'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(sceneBg)

    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const rCanvas = renderer.domElement
    rCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault() })
    rCanvas.addEventListener('webglcontextrestored', () => { renderer.setSize(el.clientWidth, el.clientHeight) })

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.enablePan = false

    // Fixed reference grid (horizon plane)
    const gridHelper = new THREE.GridHelper(3, 12, 0x444466, 0x222244)
    const gridMat = gridHelper.material as THREE.Material | THREE.Material[]
    if (Array.isArray(gridMat)) {
      gridMat.forEach((m) => { m.transparent = true; m.opacity = 0.3 })
    } else {
      gridMat.transparent = true; gridMat.opacity = 0.3
    }
    scene.add(gridHelper)

    // Fixed world frame reference axes (thin, dimmed)
    const worldAxes = new THREE.Group()
    // In Three.js Y-up: show X(right), Y(up), Z(toward camera) as faint lines
    const wLen = 1.8
    const wMat = (c: number) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.2 })
    const makeLine = (pts: THREE.Vector3[], c: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      return new THREE.Line(geo, wMat(c))
    }
    worldAxes.add(makeLine([new THREE.Vector3(0,0,0), new THREE.Vector3(wLen,0,0)], 0xff4444))
    worldAxes.add(makeLine([new THREE.Vector3(0,0,0), new THREE.Vector3(0,wLen,0)], 0x44ff44))
    worldAxes.add(makeLine([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,wLen)], 0x4444ff))
    // World labels
    const wlN = createTextSprite('N', '#ff666680', 0.25); wlN.position.set(0, 0, -wLen); worldAxes.add(wlN)
    const wlU = createTextSprite('Up', '#66ff6680', 0.25); wlU.position.set(0, wLen, 0); worldAxes.add(wlU)
    scene.add(worldAxes)

    // Create axis groups per quaternion set
    const groups: THREE.Group[] = []
    for (let g = 0; g < quatGroupCount; g++) {
      const rodColor = GROUP_ROD_COLORS[g % GROUP_ROD_COLORS.length]!
      const opacity = quatGroupCount === 1 ? 0.9 : 0.7
      const axisLen = g === 0 ? 1.2 : 1.0

      const axGroup = new THREE.Group()
      // All rods same color per group, tips are RGB for axis identification
      axGroup.add(createAxis(new THREE.Vector3(0, 0, -1), rodColor, AXIS_TIP_COLORS[0]!, axisLen, opacity))
      axGroup.add(createAxis(new THREE.Vector3(1, 0, 0), rodColor, AXIS_TIP_COLORS[1]!, axisLen, opacity))
      axGroup.add(createAxis(new THREE.Vector3(0, -1, 0), rodColor, AXIS_TIP_COLORS[2]!, axisLen, opacity))

      scene.add(axGroup)
      groups.push(axGroup)
    }
    axisGroupsRef.current = groups

    // Origin sphere
    const oGeo = new THREE.SphereGeometry(0.04, 12, 12)
    const oMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
    scene.add(new THREE.Mesh(oGeo, oMat))

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    camera.position.set(2.0, 1.5, 2.0)
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
      oGeo.dispose()
      oMat.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      axisGroupsRef.current = []
    }

    return () => { if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null } }
  }, [quatGroupCount, theme])

  // Update quaternions on cursor change
  useEffect(() => {
    const groups = axisGroupsRef.current
    if (groups.length === 0) return

    const newEulers: { label: string; roll: number; pitch: number; yaw: number }[] = []

    for (let g = 0; g < quatGroupCount; g++) {
      const group = groups[g]
      if (!group) continue

      const baseIdx = g * 4
      const wData = data[series[baseIdx]!]
      const xData = data[series[baseIdx + 1]!]
      const yData = data[series[baseIdx + 2]!]
      const zData = data[series[baseIdx + 3]!]

      if (!wData || !xData || !yData || !zData) {
        group.quaternion.set(0, 0, 0, 1)
        continue
      }

      if (cursorTs == null) {
        group.quaternion.set(0, 0, 0, 1)
        continue
      }

      const qw = wData.values[findNearestIndex(wData.timestamps, cursorTs)] ?? 1
      const qx = xData.values[findNearestIndex(xData.timestamps, cursorTs)] ?? 0
      const qy = yData.values[findNearestIndex(yData.timestamps, cursorTs)] ?? 0
      const qz = zData.values[findNearestIndex(zData.timestamps, cursorTs)] ?? 0

      // PX4 quaternion is NED frame rotation
      // Remap to Three.js Y-up: swap Y↔Z and negate as needed
      // NED quat (w, x, y, z) → Three.js: (w, y, -z, -x)
      // Actually: NED→Three.js: X→-Z, Y→X, Z→-Y
      // Quaternion transform: q_threejs = R * q_ned * R^-1 where R maps NED→ThreeJS
      // Simpler: just remap components
      // PX4 (w, x, y, z) in NED → Three.js (w, y, -z, -x)
      const q = new THREE.Quaternion(qy, -qz, -qx, qw).normalize()
      group.quaternion.copy(q)

      // Compute Euler for display (in PX4/NED convention)
      const px4q = new THREE.Quaternion(qx, qy, qz, qw).normalize()
      const e = new THREE.Euler().setFromQuaternion(px4q, 'ZYX')

      const fieldKey = series[baseIdx]!
      const colonIdx = fieldKey.indexOf(':')
      const topicField = colonIdx >= 0 ? fieldKey.substring(colonIdx + 1) : fieldKey
      const topicName = topicField.split('/')[0] ?? `Group ${g + 1}`

      newEulers.push({
        label: topicName,
        roll: e.x * RAD_TO_DEG,
        pitch: e.y * RAD_TO_DEG,
        yaw: e.z * RAD_TO_DEG,
      })
    }

    setEulers(newEulers)
  }, [cursorTs, series, data, quatGroupCount])

  return (
    <div className="attitude-view">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Axis color legend — bottom right */}
      <div className="attitude-axis-legend">
        <span style={{ color: '#ff4444' }}>X</span>
        <span style={{ color: '#44ff44' }}>Y</span>
        <span style={{ color: '#4444ff' }}>Z</span>
      </div>
      {eulers.length > 0 && (
        <div className="viz-overlay">
          {eulers.map((e, i) => {
            const rodColor = GROUP_ROD_COLORS[i % GROUP_ROD_COLORS.length]!
            const rodHex = `#${rodColor.toString(16).padStart(6, '0')}`
            return (
              <React.Fragment key={i}>
                <span className="viz-overlay-label" style={{ color: rodHex }}>{e.label}</span>
                <span className="viz-overlay-value">
                  <span className="viz-num">R:</span><span className="viz-fixed">{e.roll.toFixed(1)}&deg;</span>
                  <span className="viz-num"> P:</span><span className="viz-fixed">{e.pitch.toFixed(1)}&deg;</span>
                  <span className="viz-num"> Y:</span><span className="viz-fixed">{e.yaw.toFixed(1)}&deg;</span>
                </span>
              </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}
