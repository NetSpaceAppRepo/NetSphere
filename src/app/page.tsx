'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { SearchHeader } from '@/components/netsphere/SearchHeader'
import { TracePanel } from '@/components/netsphere/TracePanel'
import { useTraceStore } from '@/lib/netsphere/traceStore'
import { Sun } from 'lucide-react'

// The Globe uses Three.js which requires the browser — disable SSR.
const Globe = dynamic(
  () => import('@/components/netsphere/Globe').then((m) => m.Globe),
  { ssr: false, loading: () => <GlobeLoader /> },
)

function GlobeLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="relative">
        <div className="h-16 w-16 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
        <div className="absolute inset-0 -z-10 rounded-full bg-cyan-400/20 blur-2xl" />
      </div>
    </div>
  )
}

// Live sun position indicator — shows where the sun is currently directly
// overhead on Earth, updating every minute. The yellow dot on the globe
// marks this spot, and the dark hemisphere shows the night side.
function SunPositionBadge() {
  const [sunInfo, setSunInfo] = useState<{ lat: number; lng: number; time: string } | null>(null)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60
      const lng = -((utcHours - 12) * 15)
      const start = Date.UTC(now.getUTCFullYear(), 0, 0)
      const diff = now.getTime() - start
      const dayOfYear = Math.floor(diff / 86400000)
      const lat = 23.44 * Math.sin(((360 / 365) * (dayOfYear - 81)) * (Math.PI / 180))
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setSunInfo({ lat, lng, time })
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  if (!sunInfo) return null
  const hemi = sunInfo.lat > 0 ? 'N' : 'S'
  const lngHemi = sunInfo.lng >= 0 ? 'E' : 'W'

  return (
    <div className="glass-panel hidden rounded-lg px-3 py-2 text-right md:block">
      <div className="flex items-center justify-end gap-1.5">
        <Sun className="h-3 w-3 text-amber-300" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sun overhead</p>
      </div>
      <p className="font-mono text-xs text-amber-300">
        {Math.abs(sunInfo.lat).toFixed(1)}°{hemi}, {Math.abs(sunInfo.lng).toFixed(1)}°{lngHemi}
      </p>
      <p className="text-[10px] text-muted-foreground">UTC {sunInfo.time}</p>
    </div>
  )
}

export default function HomePage() {
  const {
    connected,
    connectionError,
    isTracing,
    trace,
    statusMessage,
    userLocation,
    userLocationStatus,
    history,
    initSocket,
    disconnect,
    requestUserLocation,
    startTrace,
    replayFromHistory,
    clearHistory,
    exportTrace,
  } = useTraceStore()

  useEffect(() => {
    initSocket()
    requestUserLocation()
    return () => {
      disconnect()
    }
  }, [initSocket, disconnect, requestUserLocation])

  return (
    <main className="relative flex h-screen flex-col overflow-hidden">
      <SearchHeader
        isTracing={isTracing}
        isConnected={connected}
        connectionError={connectionError}
        userLocationStatus={userLocationStatus}
        userLocation={userLocation}
        onTrace={startTrace}
      />

      <section className="relative flex min-h-0 flex-1 gap-3 overflow-hidden p-3 md:p-4">
        {/* Globe canvas — fixed size, never affected by panel content */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/40 bg-card/30">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-2/3 w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
          </div>

          <Globe
            hops={trace?.hops ?? []}
            userLocation={userLocation}
          />

          {/* Overlay: status bottom-left, sun + origin bottom-right */}
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
            <div className="glass-panel max-w-md rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {trace ? 'Status' : 'Ready'}
              </p>
              <p className="font-mono text-sm text-foreground">
                {statusMessage}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <SunPositionBadge />
              {/* Your origin */}
              <div className="glass-panel hidden rounded-lg px-3 py-2 text-right md:block">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Your origin</p>
                <p className="font-mono text-sm text-cyan-300">
                  {userLocation.lat.toFixed(4)}°, {userLocation.lng.toFixed(4)}°
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {userLocation.city
                    ? `${userLocation.city}${userLocation.country ? ', ' + userLocation.country : ''}`
                    : userLocationStatus === 'requesting'
                      ? 'Locating…'
                      : 'Unknown'}
                </p>
              </div>
            </div>
          </div>

          {/* Target hostname top-right */}
          {trace && (
            <div className="pointer-events-none absolute right-4 top-4">
              <div className="glass-panel rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</p>
                <p className="font-mono text-sm text-glow-cyan">{trace.target}</p>
              </div>
            </div>
          )}
        </div>

        {/* Trace details panel — fixed width, scrolls internally, never affects globe */}
        <aside className="glass-panel flex w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl lg:w-[420px] max-md:hidden">
          <TracePanel
            trace={trace}
            userLocation={userLocation}
            history={history}
            onReplayHistory={replayFromHistory}
            onClearHistory={clearHistory}
            onExport={exportTrace}
          />
        </aside>

        {/* Mobile: panel below globe, capped at 40vh */}
        <aside className="glass-panel flex w-full shrink-0 flex-col overflow-hidden rounded-2xl md:hidden max-h-[35vh]">
          <TracePanel
            trace={trace}
            userLocation={userLocation}
            history={history}
            onReplayHistory={replayFromHistory}
            onClearHistory={clearHistory}
            onExport={exportTrace}
          />
        </aside>
      </section>

      {/* Footer */}
      <footer className="shrink-0 border-t border-border/40 bg-card/30 px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground">
          <span className="font-mono text-cyan-300">NetSphere</span> · Real DNS · TLS ·
          CDN · Traceroute · BGP ASN · Reverse DNS · IP geo via{' '}
          <a
            href="https://ip-api.com"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-cyan-300"
          >
            ip-api.com
          </a>
        </p>
      </footer>
    </main>
  )
}
