import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useDataStore } from '../../stores/useDataStore'

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
  const data = useDataStore((s) => s.data)

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

    // Cleanup previous renderer
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
    let xMin = Infinity,
      xMax = -Infinity
    let yMin = Infinity,
      yMax = -Infinity
    let zMin = Infinity,
      zMax = -Infinity

    for (let i = 0; i < len; i++) {
      const xv = xData.values[i]!
      const yv = yData.values[i]!
      const zv = zData.values[i]!
      if (xv < xMin) xMin = xv
      if (xv > xMax) xMax = xv
      if (yv < yMin) yMin = yv
      if (yv > yMax) yMax = yv
      if (zv < zMin) zMin = zv
      if (zv > zMax) zMax = zv
    }

    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1
    const zRange = zMax - zMin || 1

    // Create points
    const positions = new Float32Array(len * 3)
    for (let i = 0; i < len; i++) {
      positions[i * 3] = ((xData.values[i]! - xMin) / xRange) * 2 - 1
      positions[i * 3 + 1] = ((yData.values[i]! - yMin) / yRange) * 2 - 1
      positions[i * 3 + 2] = ((zData.values[i]! - zMin) / zRange) * 2 - 1
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: '#4fc3f7',
      size: 3,
      sizeAttenuation: true,
    })
    const points = new THREE.Points(geometry, material)
    scene.add(points)

    // Add axis lines
    const axisLen = 1.3
    createAxisLine(
      scene,
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(-1 + axisLen * 2, -1, -1),
      0xff4444,
    )
    createAxisLine(
      scene,
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(-1, -1 + axisLen * 2, -1),
      0x44ff44,
    )
    createAxisLine(
      scene,
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(-1, -1, -1 + axisLen * 2),
      0x4444ff,
    )

    // Add axis labels
    const xLabel = xField.split('/').slice(-1)[0] ?? xField
    const yLabel = yField.split('/').slice(-1)[0] ?? yField
    const zLabel = zField.split('/').slice(-1)[0] ?? zField

    createAxisLabel(scene, xLabel, new THREE.Vector3(1.5, -1.2, -1), '#ff6666')
    createAxisLabel(scene, yLabel, new THREE.Vector3(-1.2, 1.5, -1), '#66ff66')
    createAxisLabel(scene, zLabel, new THREE.Vector3(-1.2, -1.2, 1.5), '#6666ff')

    // Add grid helper (subtle)
    const gridHelper = new THREE.GridHelper(2, 10, '#1a1a3e', '#1a1a2e')
    gridHelper.position.y = -1
    scene.add(gridHelper)

    // Position camera
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

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        camera.aspect = el.clientWidth / el.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(el.clientWidth, el.clientHeight)
      }
    })
    resizeObserver.observe(el)

    // Store cleanup function
    cleanupRef.current = () => {
      cancelAnimationFrame(animFrameId)
      resizeObserver.disconnect()
      controls.dispose()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [series, data])

  return <div ref={containerRef} className="three-d-plot" />
}
