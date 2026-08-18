'use client'

import { useState, FormEvent } from 'react'
import { Search, Zap, Radio, Loader2, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function SearchHeader({
  isTracing,
  isConnected,
  connectionError,
  userLocationStatus,
  userLocation,
  onTrace,
}: {
  isTracing: boolean
  isConnected: boolean
  connectionError: string | null
  userLocationStatus: 'idle' | 'requesting' | 'granted' | 'denied' | 'fallback'
  userLocation: { city?: string; country?: string; lat: number; lng: number }
  onTrace: (target: string) => void
}) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim() || isTracing || !isConnected) return
    onTrace(value.trim())
  }

  const locationLabel = (() => {
    if (userLocationStatus === 'requesting') return 'Locating you…'
    if (userLocationStatus === 'denied') return 'Location denied'
    if (userLocationStatus === 'granted' && userLocation.city) {
      return `${userLocation.city}${userLocation.country ? ', ' + userLocation.country : ''}`
    }
    if (userLocationStatus === 'granted') {
      return `${userLocation.lat.toFixed(2)}°, ${userLocation.lng.toFixed(2)}°`
    }
    return 'Set location'
  })()

  return (
    <header className="relative z-20 border-b border-border/40 bg-card/40 backdrop-blur-xl">
      <div className="grid-overlay absolute inset-0 opacity-40" />
      <div className="relative mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-3 md:px-6">
        {/* Top row: brand + status badges */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 text-black shadow-[0_0_20px_rgba(34,211,238,0.5)]">
              <Radio className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-bold tracking-tight text-glow-cyan md:text-lg">
                NetSphere
              </h1>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Planet-Scale Internet Visualizer · Real Traceroute
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Location badge */}
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs',
                userLocationStatus === 'granted'
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                  : userLocationStatus === 'denied'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-border/40 bg-card/40 text-muted-foreground',
              )}
              title={
                userLocationStatus === 'granted'
                  ? `Your real location: ${userLocation.lat.toFixed(4)}°, ${userLocation.lng.toFixed(4)}°`
                  : userLocationStatus === 'denied'
                    ? 'Geolocation denied — using IP-based fallback'
                    : 'Requesting your location…'
              }
            >
              {userLocationStatus === 'requesting' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : userLocationStatus === 'granted' ? (
                <MapPin className="h-3 w-3" />
              ) : userLocationStatus === 'denied' ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <MapPin className="h-3 w-3" />
              )}
              <span className="max-w-[180px] truncate">{locationLabel}</span>
            </div>

            {/* Connection badge */}
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5',
                isConnected
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300',
              )}
              title={connectionError ?? (isConnected ? 'Connected to trace-service' : 'Disconnected')}
            >
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  isConnected ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse',
                )}
              />
              {isConnected ? 'Service online' : 'Offline'}
            </Badge>
          </div>
        </div>

        {/* Search row */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter a domain — e.g. cloudflare.com, wikipedia.org, github.com"
              disabled={isTracing || !isConnected}
              className="h-11 border-cyan-500/30 bg-background/60 pl-10 font-mono text-sm placeholder:font-sans focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            disabled={!value.trim() || isTracing || !isConnected}
            className="h-11 gap-2 bg-gradient-to-r from-cyan-500 to-purple-500 px-6 text-sm font-semibold text-black hover:from-cyan-400 hover:to-purple-400 hover:text-black"
          >
            {isTracing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Tracing…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Trace
              </>
            )}
          </Button>
        </form>

        {/* Help text */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Real DNS, real TLS handshake, real CDN detection, real <span className="font-mono text-cyan-300">tracert</span> — no simulated data.
          </p>
          <span className="hidden text-[10px] text-muted-foreground md:inline">
            Drag the globe to rotate · scroll to zoom
          </span>
        </div>

        {/* Connection error banner */}
        {connectionError && !isConnected && (
          <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Cannot reach trace-service</p>
              <p className="mt-0.5 text-rose-200/80">{connectionError}</p>
              <p className="mt-1 text-rose-200/60">
                Make sure the trace-service window is still open and shows{' '}
                <code className="rounded bg-rose-900/40 px-1">WebSocket server running on port 3003</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
