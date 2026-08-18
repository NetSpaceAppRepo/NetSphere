'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import type { Hop, GeoInfo } from '@/lib/netsphere/types'
import { latLngToVector3, hopColor } from '@/lib/netsphere/types'

const GLOBE_RADIUS = 2

// -------------------------------- Sun position calculation --------------------------------
// Calculates the sun's current subsolar point based on UTC time.
//   - Longitude: derived from UTC time (noon UTC = 0°, midnight = 180°)
//   - Latitude: solar declination (±23.44° based on day of year)
function subsolarPoint(date: Date): { lat: number; lng: number } {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const lng = -((utcHours - 12) * 15)
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const diff = date.getTime() - start
  const dayOfYear = Math.floor(diff / 86400000)
  const decl = 23.44 * Math.sin(((360 / 365) * (dayOfYear - 81)) * (Math.PI / 180))
  return { lat: decl, lng }
}

// Convert subsolar point to a 3D direction vector (normalized) in world space.
function sunDirection(): THREE.Vector3 {
  const sun = subsolarPoint(new Date())
  const [x, y, z] = latLngToVector3(sun.lat, sun.lng, 1)
  return new THREE.Vector3(x, y, z).normalize()
}

// -------------------------------- Realistic Earth sphere --------------------------------
// The globe stays still. OrbitControls moves the CAMERA around it.
// Day/night is achieved by:
//   1. A directional light positioned at the sun's current location (natural Phong shading)
//   2. A night-lights overlay shader that shows city lights on the dark side
function GlobeSphere({ sunLightRef }: { sunLightRef: React.MutableRefObject<THREE.DirectionalLight | null> }) {
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    return {
      map: loader.load('/textures/earth-blue-marble.jpg'),
      bumpMap: loader.load('/textures/earth-topology.png'),
      specularMap: loader.load('/textures/earth-water.png'),
      nightMap: loader.load('/textures/earth-night.jpg'),
    }
  }, [])

  useEffect(() => {
    Object.values(textures).forEach((t) => {
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 8
    })
  }, [textures])

  // Night-lights shader material: shows city lights only on the dark side.
  // Uses world-space normal dot sunDirection to determine day/night mix.
  const nightMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        nightTexture: { value: textures.nightMap },
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        void main() {
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        uniform sampler2D nightTexture;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        void main() {
          // intensity > 0 = day side, < 0 = night side
          float intensity = dot(vWorldNormal, normalize(sunDirection));
          // Smooth transition at the terminator (day/night boundary)
          float nightMix = smoothstep(0.15, -0.25, intensity);
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;
          // Brighten city lights slightly for visibility
          gl_FragColor = vec4(nightColor * 1.8, nightMix * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
  }, [textures.nightMap])

  // Update sun direction each frame and move the directional light
  useFrame(() => {
    const dir = sunDirection()
    nightMaterial.uniforms.sunDirection.value.copy(dir)
    if (sunLightRef.current) {
      // Place the light far away in the sun's direction
      sunLightRef.current.position.set(dir.x * 10, dir.y * 10, dir.z * 10)
      sunLightRef.current.target.position.set(0, 0, 0)
      sunLightRef.current.target.updateMatrixWorld()
    }
  })

  return (
    <group>
      {/* Day Earth — Blue Marble + bump + specular, lit by the sun directional light */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
        <meshPhongMaterial
          map={textures.map}
          bumpMap={textures.bumpMap}
          bumpScale={0.04}
          specularMap={textures.specularMap}
          specular={new THREE.Color('#22d3ee')}
          shininess={12}
          emissive={new THREE.Color('#0a1428')}
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Night-lights overlay — city lights visible on the dark side only */}
      <mesh scale={1.001}>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
        <primitive object={nightMaterial} attach="material" />
      </mesh>

      {/* Atmosphere glow — three layers for depth (all BackSide = inside-facing) */}
      <mesh scale={1.04}>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.1} side={THREE.BackSide} />
      </mesh>
      <mesh scale={1.12}>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>
      <mesh scale={1.22}>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.025} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

// A small bright marker showing where the sun is currently directly overhead.
function SunMarker() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    const sun = subsolarPoint(new Date())
    const [x, y, z] = latLngToVector3(sun.lat, sun.lng, GLOBE_RADIUS * 1.01)
    ref.current.position.set(x, y, z)
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.04, 12, 12]} />
      <meshBasicMaterial color="#fef08a" toneMapped={false} />
    </mesh>
  )
}

// -------------------------------- Pulse shockwave when a new hop arrives --------------------------------
// Each pulse is self-contained: it animates for 2 seconds, then calls
// onComplete so the parent removes it. This avoids setState-in-effect.
function HopPulse({ geo, color, onComplete }: { geo: GeoInfo; color: string; onComplete: () => void }) {
  const ringRef = useRef<THREE.Mesh>(null)
  const startTime = useRef<number | null>(null)
  const [x, y, z] = latLngToVector3(geo.lat, geo.lng, GLOBE_RADIUS * 1.005)

  const groupRef = useRef<THREE.Group>(null)
  useEffect(() => {
    if (groupRef.current) {
      const position = new THREE.Vector3(x, y, z)
      const outward = position.clone().normalize()
      const quaternion = new THREE.Quaternion()
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward)
      groupRef.current.quaternion.copy(quaternion)
    }
  }, [x, y, z])

  useFrame(({ clock }) => {
    if (!ringRef.current) return
    if (startTime.current === null) startTime.current = clock.getElapsedTime()
    const elapsed = clock.getElapsedTime() - startTime.current
    const duration = 2.0
    if (elapsed >= duration) {
      onComplete()
      return
    }
    const progress = elapsed / duration
    const scale = 1 + progress * 4
    ringRef.current.scale.setScalar(scale)
    const mat = ringRef.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.8 * (1 - progress)
  })

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <mesh ref={ringRef} rotation={[0, 0, 0]}>
        <ringGeometry args={[0.03, 0.05, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

// Self-managing pulse: renders once for 2s, then disappears.
// No state needed — just a timer + visibility flag.
function AutoPulse({ geo, color, hopKey }: { geo: GeoInfo; color: string; hopKey: string }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2000)
    return () => clearTimeout(timer)
  }, [])
  if (!visible) return null
  return <HopPulse geo={geo} color={color} onComplete={() => setVisible(false)} />
}

// Manages pulse shockwaves. Renders an AutoPulse for each geo-located hop.
// React reconciles by key — when a new hop appears, its AutoPulse mounts and
// pulses once for 2s, then renders null. On subsequent re-renders (geo
// enrichment), the same AutoPulse stays mounted (same key) and keeps
// rendering null. No parent state or refs needed — clean and lint-safe.
function PulseManager({ hops }: { hops: Hop[] }) {
  const geoHops = hops.filter((h) => h.geo && h.geo.lat !== 0 && h.geo.lng !== 0)
  return (
    <>
      {geoHops.map((hop) => {
        const key = `pulse-${hop.index}-${hop.ip}`
        const color = hopColor(hop.index - 1, Math.max(1, geoHops.length))
        return <AutoPulse key={key} geo={hop.geo!} color={color} />
      })}
    </>
  )
}

// -------------------------------- Realistic Network Node Marker --------------------------------
function NetworkNode({
  geo,
  color,
  index,
  isOrigin,
  isFinal,
  isPrivate,
}: {
  geo: GeoInfo
  color: string
  index: number
  isOrigin?: boolean
  isFinal?: boolean
  isPrivate?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const diamondRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const beamRef = useRef<THREE.Mesh>(null)
  const [x, y, z] = latLngToVector3(geo.lat, geo.lng, GLOBE_RADIUS * 1.001)

  const beamLength = isOrigin ? 0.32 : isFinal ? 0.36 : isPrivate ? 0.12 : 0.18
  const diamondSize = isOrigin ? 0.05 : isFinal ? 0.055 : isPrivate ? 0.022 : 0.032

  useEffect(() => {
    if (groupRef.current) {
      const position = new THREE.Vector3(x, y, z)
      const outward = position.clone().normalize()
      const quaternion = new THREE.Quaternion()
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward)
      groupRef.current.quaternion.copy(quaternion)
    }
  }, [x, y, z])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (diamondRef.current) {
      diamondRef.current.rotation.y = t * 0.6
      diamondRef.current.rotation.x = t * 0.3
      const pulse = isOrigin || isFinal ? 1 + Math.sin(t * 2.4) * 0.12 : 1
      diamondRef.current.scale.setScalar(pulse)
    }
    if (pulseRef.current && (isOrigin || isFinal)) {
      const cycle = (t * 0.8) % 1
      const s = 1 + cycle * 3
      pulseRef.current.scale.setScalar(s)
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, 0.6 * (1 - cycle))
    }
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.55 + Math.sin(t * 1.5 + index) * 0.15
    }
  })

  return (
    <group
      ref={groupRef}
      position={[x, y, z]}
    >
      <mesh ref={beamRef} position={[0, beamLength / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, beamLength, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.025, 0.04, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={diamondRef} position={[0, beamLength + diamondSize, 0]}>
        <octahedronGeometry args={[diamondSize, 0]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, beamLength + diamondSize, 0]}>
        <sphereGeometry args={[diamondSize * 2.2, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} depthWrite={false} />
      </mesh>
      {(isOrigin || isFinal) && (
        <mesh ref={pulseRef} position={[0, beamLength + diamondSize, 0]}>
          <ringGeometry args={[diamondSize * 1.5, diamondSize * 1.8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

// -------------------------------- Animated arc with packet + trail --------------------------------
function HopArc({
  from,
  to,
  color,
  delay = 0,
}: {
  from: GeoInfo
  to: GeoInfo
  color: string
  delay?: number
}) {
  // 3 packets traveling simultaneously, each at a different phase offset,
  // so the arc always has packets flowing along it — looks alive.
  const PACKET_COUNT = 3
  const packetRefs = useRef<THREE.Mesh[]>([])
  const packetLightRef = useRef<THREE.PointLight>(null)
  const trailRefs = useRef<THREE.Mesh[]>([])

  const { curve, lineGeometry } = useMemo(() => {
    const start = new THREE.Vector3(...latLngToVector3(from.lat, from.lng, GLOBE_RADIUS * 1.02))
    const end = new THREE.Vector3(...latLngToVector3(to.lat, to.lng, GLOBE_RADIUS * 1.02))
    const distance = start.distanceTo(end)
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    const liftFactor = 0.18 + distance * 0.22
    mid.normalize().multiplyScalar(GLOBE_RADIUS * (1 + liftFactor))
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    const points = curve.getPoints(72)
    const g = new THREE.BufferGeometry().setFromPoints(points)
    return { curve, lineGeometry: g }
  }, [from.lat, from.lng, to.lat, to.lng])

  useFrame(({ clock }) => {
    const cycleDuration = 2.4
    const time = clock.getElapsedTime() + delay

    // Animate each packet at a different phase
    for (let p = 0; p < PACKET_COUNT; p++) {
      const phaseOffset = (p / PACKET_COUNT) * cycleDuration
      const t = (time + phaseOffset) % cycleDuration
      const progress = t / cycleDuration
      const mesh = packetRefs.current[p]
      if (mesh) {
        const point = curve.getPoint(progress)
        mesh.position.copy(point)
        // Fade in at start, fade out at end
        const alpha = Math.sin(progress * Math.PI)
        mesh.scale.setScalar(0.5 + alpha * 0.8)
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.opacity = alpha
        mesh.visible = alpha > 0.05
      }
    }

    // The light follows the first packet (most prominent)
    if (packetLightRef.current) {
      const t = time % cycleDuration
      const progress = t / cycleDuration
      const p = curve.getPoint(progress)
      packetLightRef.current.position.copy(p)
      packetLightRef.current.intensity = Math.sin(progress * Math.PI) * 2.0
    }

    // Trail behind the first packet
    trailRefs.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = time % cycleDuration
      const mainProgress = t / cycleDuration
      const trailProgress = mainProgress - (i + 1) * 0.05
      if (trailProgress <= 0 || trailProgress >= 1) {
        mesh.visible = false
        return
      }
      mesh.visible = true
      const p = curve.getPoint(trailProgress)
      mesh.position.copy(p)
      const fade = 1 - (i + 1) / 4
      mesh.scale.setScalar(fade * 0.6)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = fade * 0.4
    })
  })

  return (
    <>
      <line>
        <primitive object={lineGeometry} attach="geometry" />
        <lineBasicMaterial color={color} transparent opacity={0.25} />
      </line>
      {/* 3 simultaneous packets at different phases */}
      {Array.from({ length: PACKET_COUNT }).map((_, i) => (
        <mesh
          key={`pkt-${i}`}
          ref={(el) => {
            if (el) packetRefs.current[i] = el
          }}
        >
          <sphereGeometry args={[0.03, 10, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
      <pointLight ref={packetLightRef} color={color} distance={1.8} intensity={0} />
      {[0, 1, 2].map((i) => (
        <mesh
          key={`trail-${i}`}
          ref={(el) => {
            if (el) trailRefs.current[i] = el
          }}
          visible={false}
        >
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}

// -------------------------------- Globe scene --------------------------------
function GlobeScene({
  hops,
  userLocation,
  sunLightRef,
}: {
  hops: Hop[]
  userLocation: GeoInfo
  sunLightRef: React.MutableRefObject<THREE.DirectionalLight | null>
}) {
  const { arcs, points } = useMemo(() => {
    const arcs: { from: GeoInfo; to: GeoInfo; color: string; delay: number; key: string }[] = []
    const points: { geo: GeoInfo; color: string; index: number; isOrigin: boolean; isFinal: boolean; isPrivate: boolean }[] = []

    points.push({
      geo: userLocation,
      color: '#22d3ee',
      index: 0,
      isOrigin: true,
      isFinal: false,
      isPrivate: false,
    })

    if (hops.length === 0) {
      return { arcs, points }
    }

    const geoHops = hops.filter((h) => h.geo && h.geo.lat !== 0 && h.geo.lng !== 0)
    if (geoHops.length === 0) return { arcs, points }

    const path: GeoInfo[] = [userLocation, ...geoHops.map((h) => h.geo!)]
    for (let i = 0; i < path.length; i++) {
      const geo = path[i]
      const isPrivate = geo.country === 'LAN'
      // Skip index 0 (user origin) — already added above. Also skip if this
      // point is identical to the previous one (same IP) to avoid duplicates.
      if (i === 0) continue
      // Skip duplicate points (same IP as the previous point)
      if (geo.ip === path[i - 1].ip) continue
      points.push({
        geo,
        color: hopColor(i - 1, Math.max(1, path.length - 1)),
        index: i,
        isOrigin: false,
        isFinal: i === path.length - 1,
        isPrivate,
      })
      const prevGeo = path[i - 1]
      if (prevGeo.country === 'LAN' && geo.country === 'LAN') continue
      arcs.push({
        from: prevGeo,
        to: geo,
        color: hopColor(i - 1, Math.max(1, path.length - 1)),
        delay: i * 0.18,
        key: `arc-${i}`,
      })
    }
    return { arcs, points }
  }, [hops, userLocation])

  return (
    <>
      <GlobeSphere sunLightRef={sunLightRef} />
      <SunMarker />
      <PulseManager hops={hops} />
      {points.map(({ geo, color, index, isOrigin, isFinal, isPrivate }) => (
        <NetworkNode
          key={`node-${index}-${geo.ip}-${isOrigin ? 'origin' : isFinal ? 'final' : 'hop'}`}
          geo={geo}
          color={color}
          index={index}
          isOrigin={isOrigin}
          isFinal={isFinal}
          isPrivate={isPrivate}
        />
      ))}
      {arcs.map((seg) => (
        <HopArc key={seg.key} from={seg.from} to={seg.to} color={seg.color} delay={seg.delay} />
      ))}
    </>
  )
}

// -------------------------------- Public Globe component --------------------------------
// The globe stays completely still unless the user drags/zooms manually.
// No auto-focus, no camera animation — search has zero effect on the camera.
// The Canvas has a stable key so it never re-mounts on state changes.
export function Globe({
  hops,
  userLocation,
}: {
  hops: Hop[]
  userLocation: GeoInfo
}) {
  const controlsRef = useRef<any>(null)
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null)

  return (
    <div className="relative h-full w-full">
      <Canvas
        key="netsphere-globe"
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.5} />
        {/* Sun directional light — position is updated each frame by GlobeSphere */}
        <directionalLight
          ref={sunLightRef}
          position={[5, 3, 5]}
          intensity={1.4}
          color="#ffffff"
        />
        {/* Soft cyan fill light from the opposite side (night-side ambient) */}
        <directionalLight position={[-5, -3, -5]} intensity={0.15} color="#22d3ee" />
        <GlobeScene hops={hops} userLocation={userLocation} sunLightRef={sunLightRef} />
        <Stars
          radius={50}
          depth={50}
          count={2500}
          factor={3}
          saturation={0}
          fade
          speed={0.4}
        />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan={false}
          enableZoom
          minDistance={3.2}
          maxDistance={10}
          autoRotate={false}
          rotateSpeed={0.5}
          zoomSpeed={0.7}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  )
}
