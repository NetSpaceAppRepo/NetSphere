'use client'

import {
  Leaf,
  Zap,
  Gauge,
  BookOpen,
  Lightbulb,
  Clock,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plane,
  Server,
  Network,
  Globe2,
  Route,
  Activity,
  Sparkles,
  Stamp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeoInfo, Hop, TraceResult } from '@/lib/netsphere/types'
import { haversineKm, totalPathDistance, formatDistance } from '@/lib/netsphere/types'

// =====================================================================
// 1. CARBON FOOTPRINT
// =====================================================================
// Estimates energy consumption and CO2 emissions based on the distance
// packets traveled. Uses rough industry estimates for network energy intensity.
//
// Sources (approximate):
//   - Network energy intensity: ~0.02 kWh per GB transferred (data center + network)
//   - But for a tiny request (~2 KB), energy is microscopic.
//   - We estimate based on distance × packets × energy-per-km-per-bit
//   - Internet energy: ~0.1 µWh per km per GB (very rough)
//   - CO2: ~0.4 g CO2 per Wh (global grid average)
//
// This is educational/humorous — not a precise measurement.

export function CarbonFootprintPanel({
  trace,
  userLocation,
}: {
  trace: TraceResult
  userLocation: GeoInfo
}) {
  const distance = totalPathDistance(userLocation, trace.hops)
  if (distance < 1) return null

  // Estimate: a typical HTTPS request + response ≈ 50 KB total transfer
  // Energy per km per GB: ~0.1 µWh (very rough internet average)
  // So per 50 KB: 50KB / 1GB = 5e-8 GB → 5e-8 × 0.1 µWh/km × distance km
  const transferKB = 50
  const transferGB = transferKB / 1024 / 1024
  const energyPerKmPerGB = 0.1e-6 // µWh → convert to Wh: 0.1e-6 Wh
  const energyWh = transferGB * energyPerKmPerGB * distance * 1000000 // scale up for visibility

  // CO2: 0.4 g per Wh (global grid average, including renewables)
  const co2Grams = energyWh * 0.4

  // Equivalent: how far could you drive a car?
  // Car: ~120 g CO2 per km → equivalent meters = co2Grams / 120 * 1000
  const carMeters = (co2Grams / 120) * 1000

  // Equivalent: LED bulb time (10W LED = 0.01 kW → 10 Wh/hour)
  const ledSeconds = (energyWh / 10) * 3600

  return (
    <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Leaf className="h-4 w-4 text-emerald-400" />
        Carbon Footprint
        <span className="ml-auto text-[10px] text-muted-foreground">educational estimate</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border/30 bg-card/30 px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            <Route className="h-2.5 w-2.5" />
            Distance
          </div>
          <p className="mt-0.5 font-mono text-sm text-cyan-300">{formatDistance(distance)}</p>
        </div>
        <div className="rounded-md border border-border/30 bg-card/30 px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            <Zap className="h-2.5 w-2.5" />
            Energy
          </div>
          <p className="mt-0.5 font-mono text-sm text-amber-300">
            {energyWh < 0.001 ? `${(energyWh * 1000000).toFixed(1)} µWh` : `${energyWh.toFixed(4)} Wh`}
          </p>
        </div>
        <div className="rounded-md border border-border/30 bg-card/30 px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            <Leaf className="h-2.5 w-2.5" />
            CO₂
          </div>
          <p className="mt-0.5 font-mono text-sm text-emerald-300">
            {co2Grams < 0.001 ? `${(co2Grams * 1000).toFixed(2)} mg` : `${co2Grams.toFixed(4)} g`}
          </p>
        </div>
      </div>

      <div className="space-y-1 text-[10px] text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Plane className="h-2.5 w-2.5 text-cyan-400" />
          Equivalent to driving <span className="font-mono text-cyan-300">{carMeters < 1 ? '<1 m' : `${carMeters.toFixed(1)} m`}</span> in a car
        </p>
        <p className="flex items-center gap-1.5">
          <Sparkles className="h-2.5 w-2.5 text-amber-400" />
          Equivalent to a 10W LED on for <span className="font-mono text-amber-300">{ledSeconds < 1 ? '<1s' : ledSeconds < 60 ? `${ledSeconds.toFixed(1)}s` : `${(ledSeconds / 60).toFixed(1)}min`}</span>
        </p>
      </div>
    </div>
  )
}

// =====================================================================
// 2. INTERNET HEALTH DASHBOARD
// =====================================================================
// Calculates an overall health score (0-100) based on multiple factors.

export function HealthDashboard({ trace }: { trace: TraceResult }) {
  const sec = trace.security
  const hops = trace.hops
  const timeoutHops = hops.filter((h) => h.ip === '*').length
  const packetLoss = hops.length > 0 ? (timeoutHops / hops.length) * 100 : 0

  // Scoring factors
  const factors: { label: string; value: string; score: number; icon: React.ReactNode }[] = []

  // Latency score (0-25)
  const rtt = trace.finalPing ?? 0
  let latencyScore = 25
  if (rtt > 200) latencyScore = 5
  else if (rtt > 150) latencyScore = 10
  else if (rtt > 100) latencyScore = 15
  else if (rtt > 50) latencyScore = 20
  factors.push({
    label: 'Latency',
    value: `${rtt} ms`,
    score: latencyScore,
    icon: <Clock className="h-3 w-3" />,
  })

  // Packet loss score (0-25)
  const lossScore = Math.round(Math.max(0, 25 - packetLoss * 0.5))
  factors.push({
    label: 'Packet Loss',
    value: `${packetLoss.toFixed(0)}%`,
    score: lossScore,
    icon: <Activity className="h-3 w-3" />,
  })

  // TLS score (0-20)
  let tlsScore = 0
  if (trace.ssl) {
    if (trace.ssl.protocol === 'TLSv1.3') tlsScore = 20
    else if (trace.ssl.protocol === 'TLSv1.2') tlsScore = 15
    else tlsScore = 5
  }
  factors.push({
    label: 'TLS',
    value: trace.ssl?.protocol ?? 'None',
    score: tlsScore,
    icon: <CheckCircle2 className="h-3 w-3" />,
  })

  // Security score (0-15) — HSTS + HTTP/2 + IPv6
  let secScore = 0
  if (sec?.hsts) secScore += 5
  if (sec?.http2) secScore += 5
  if (sec?.ipv6) secScore += 5
  factors.push({
    label: 'Security',
    value: `${secScore}/15`,
    score: secScore,
    icon: <Gauge className="h-3 w-3" />,
  })

  // Route stability score (0-15) — based on hop count + timeouts
  const hopCount = hops.length
  let stabilityScore = 15
  if (hopCount > 20) stabilityScore = 5
  else if (hopCount > 15) stabilityScore = 8
  else if (hopCount > 10) stabilityScore = 12
  if (packetLoss > 30) stabilityScore = Math.min(stabilityScore, 5)
  stabilityScore = Math.round(stabilityScore)
  factors.push({
    label: 'Route Stability',
    value: `${hopCount} hops`,
    score: stabilityScore,
    icon: <TrendingUp className="h-3 w-3" />,
  })

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.score, 0))
  const grade = totalScore >= 90 ? 'A+' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : totalScore >= 50 ? 'D' : 'F'
  const gradeColor = totalScore >= 80 ? 'text-emerald-400' : totalScore >= 60 ? 'text-amber-400' : 'text-rose-400'
  const barColor = totalScore >= 80 ? 'bg-emerald-500' : totalScore >= 60 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
          <Gauge className="h-4 w-4 text-cyan-400" />
          Internet Health
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('font-mono text-2xl font-bold', gradeColor)}>{totalScore}</span>
          <span className="text-xs text-muted-foreground">/100</span>
          <span className={cn('rounded border px-1.5 py-0.5 font-mono text-xs font-bold', gradeColor, 'border-current')}>{grade}</span>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-border/30">
        <div
          className={cn('h-full transition-all duration-500', barColor)}
          style={{ width: `${totalScore}%` }}
        />
      </div>

      {/* Factor breakdown */}
      <div className="grid grid-cols-1 gap-1">
        {factors.map((f) => (
          <div key={f.label} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{f.icon}</span>
            <span className="flex-1 text-foreground/80">{f.label}</span>
            <span className="font-mono text-muted-foreground">{f.value}</span>
            <span className={cn(
              'font-mono font-medium',
              f.score >= 15 ? 'text-emerald-300' : f.score >= 8 ? 'text-amber-300' : 'text-rose-300',
            )}>
              {f.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================================
// 3. NETWORK PASSPORT
// =====================================================================
// Summarizes the "journey" — countries visited, distance, ASNs, routers.

export function NetworkPassport({
  trace,
  userLocation,
}: {
  trace: TraceResult
  userLocation: GeoInfo
}) {
  const geoHops = trace.hops.filter((h) => h.geo && h.geo.country && h.geo.country !== 'LAN')
  if (geoHops.length === 0) return null

  const countries = new Map<string, { code: string; count: number }>()
  for (const hop of geoHops) {
    const country = hop.geo!.country!
    const code = hop.geo!.countryCode ?? '?'
    if (countries.has(country)) {
      countries.get(country)!.count++
    } else {
      countries.set(country, { code, count: 1 })
    }
  }
  // Include user's country
  if (userLocation.country && !countries.has(userLocation.country)) {
    countries.set(userLocation.country, { code: userLocation.countryCode ?? '?', count: 0 })
  }

  const asns = new Set<string>()
  for (const hop of geoHops) {
    if (hop.geo?.asn) asns.add(hop.geo.asn)
  }

  const distance = totalPathDistance(userLocation, trace.hops)
  const routerCount = trace.hops.filter((h) => h.ip !== '*').length

  // Convert country code to flag emoji
  const flagEmoji = (code: string) => {
    if (!code || code.length !== 2) return '🏳️'
    const A = 0x1F1E6
    const chars = code.toUpperCase().split('').map((c) => A + c.charCodeAt(0) - 65)
    return String.fromCodePoint(...chars)
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Stamp className="h-4 w-4 text-purple-400" />
        Network Passport
      </div>

      {/* Country flags */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from(countries.entries()).map(([country, { code }]) => (
          <span
            key={country}
            className="flex items-center gap-1 rounded-md border border-border/30 bg-card/30 px-1.5 py-0.5 text-[10px]"
            title={country}
          >
            <span className="text-sm">{flagEmoji(code)}</span>
            <span className="text-muted-foreground">{country.length > 10 ? country.slice(0, 10) + '…' : country}</span>
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="rounded border border-border/30 bg-card/20 px-1.5 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            <Globe2 className="h-2.5 w-2.5" />
          </div>
          <p className="font-mono text-sm text-cyan-300">{countries.size}</p>
          <p className="text-[8px] text-muted-foreground">countries</p>
        </div>
        <div className="rounded border border-border/30 bg-card/20 px-1.5 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            <Route className="h-2.5 w-2.5" />
          </div>
          <p className="font-mono text-sm text-amber-300">{formatDistance(distance).replace(/\s.*$/, '')}</p>
          <p className="text-[8px] text-muted-foreground">distance</p>
        </div>
        <div className="rounded border border-border/30 bg-card/20 px-1.5 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            <Network className="h-2.5 w-2.5" />
          </div>
          <p className="font-mono text-sm text-purple-300">{asns.size}</p>
          <p className="text-[8px] text-muted-foreground">ASNs</p>
        </div>
        <div className="rounded border border-border/30 bg-card/20 px-1.5 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            <Server className="h-2.5 w-2.5" />
          </div>
          <p className="font-mono text-sm text-emerald-300">{routerCount}</p>
          <p className="text-[8px] text-muted-foreground">routers</p>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// 4. INTERNET STORY MODE
// =====================================================================
// Generates a human-readable narrative of the packet's journey.

export function StoryMode({
  trace,
  userLocation,
}: {
  trace: TraceResult
  userLocation: GeoInfo
}) {
  const geoHops = trace.hops.filter((h) => h.geo && h.geo.country && h.geo.country !== 'LAN')
  if (geoHops.length === 0) return null

  const distance = totalPathDistance(userLocation, trace.hops)
  const routerCount = trace.hops.filter((h) => h.ip !== '*').length
  const rtt = trace.finalPing

  // Build the story
  const segments: string[] = []
  const startCity = userLocation.city || 'your location'
  const startCountry = userLocation.country || ''

  segments.push(`Your request started in ${startCity}${startCountry ? ', ' + startCountry : ''}.`)

  // Track country transitions
  let prevCountry = startCountry
  let prevCity = startCity
  const transitions: { from: string; to: string; via?: string }[] = []

  for (const hop of geoHops) {
    const geo = hop.geo!
    if (geo.country && geo.country !== prevCountry) {
      const via = geo.isp || geo.org || undefined
      transitions.push({
        from: prevCountry,
        to: geo.country,
        via: via ? via.split(' ')[0] : undefined,
      })
      prevCountry = geo.country
    }
    if (geo.city) prevCity = geo.city
  }

  // Add story segments for transitions
  for (const t of transitions) {
    if (t.via) {
      segments.push(`It traveled through ${t.from} and entered ${t.to}, passing via ${t.via}.`)
    } else {
      segments.push(`It crossed from ${t.from} into ${t.to}.`)
    }
  }

  // Final destination
  const finalGeo = geoHops[geoHops.length - 1].geo!
  const finalCity = finalGeo.city || 'the destination'
  const finalCountry = finalGeo.country || ''
  const finalIsp = finalGeo.isp || finalGeo.org || ''

  if (transitions.length === 0 && finalCity === startCity) {
    segments.push(`It reached ${finalIsp} in the same city.`)
  } else {
    segments.push(`It finally reached ${finalIsp} in ${finalCity}${finalCountry ? ', ' + finalCountry : ''}.`)
  }

  // Summary
  segments.push(
    `Total journey: ${formatDistance(distance)}, ${routerCount} routers${rtt !== undefined ? `, ${rtt} ms` : ''}.`,
  )

  return (
    <div className="space-y-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <BookOpen className="h-4 w-4 text-purple-400" />
        Story Mode
        <span className="ml-auto text-[10px] text-muted-foreground">your request's journey</span>
      </div>
      <div className="space-y-1.5">
        {segments.map((seg, idx) => (
          <p key={idx} className="text-xs leading-relaxed text-foreground/80">
            <span className="mr-1.5 font-mono text-[10px] text-purple-400/60">{String(idx + 1).padStart(2, '0')}</span>
            {seg}
          </p>
        ))}
      </div>
    </div>
  )
}

// =====================================================================
// 5. "COULD THIS BE FASTER?" RECOMMENDATIONS
// =====================================================================

export function RecommendationsPanel({ trace }: { trace: TraceResult }) {
  const sec = trace.security
  const recommendations: { issue: string; suggestion: string; severity: 'high' | 'medium' | 'low' }[] = []

  // No CDN
  if (!trace.cdn?.detected) {
    recommendations.push({
      issue: 'No CDN detected',
      suggestion: 'Deploy a CDN (Cloudflare, Akamai, Fastly) to serve content from edge locations closer to users.',
      severity: 'high',
    })
  }

  // No IPv6
  if (sec && !sec.ipv6) {
    recommendations.push({
      issue: 'No IPv6 support',
      suggestion: 'Enable IPv6 (AAAA records) to future-proof and improve routing for IPv6-native networks.',
      severity: 'medium',
    })
  }

  // Old TLS
  if (trace.ssl && trace.ssl.protocol !== 'TLSv1.3' && trace.ssl.protocol !== 'TLSv1.2') {
    recommendations.push({
      issue: `Outdated TLS (${trace.ssl.protocol})`,
      suggestion: 'Upgrade to TLS 1.3 for better performance (1-RTT handshake) and security.',
      severity: 'high',
    })
  }

  // No HSTS
  if (sec && sec.hsts === false) {
    recommendations.push({
      issue: 'No HSTS header',
      suggestion: 'Enable Strict-Transport-Security to force HTTPS and prevent downgrade attacks.',
      severity: 'medium',
    })
  }

  // No HTTP/2
  if (sec && sec.http2 === false) {
    recommendations.push({
      issue: 'No HTTP/2 support',
      suggestion: 'Enable HTTP/2 for multiplexed requests, header compression, and faster page loads.',
      severity: 'medium',
    })
  }

  // High latency
  if (trace.finalPing && trace.finalPing > 150) {
    recommendations.push({
      issue: `High latency (${trace.finalPing} ms)`,
      suggestion: 'Consider a closer CDN edge, or check if the origin server is geographically distant from users.',
      severity: 'high',
    })
  }

  // Many hops
  if (trace.hops.length > 15) {
    recommendations.push({
      issue: `Long route (${trace.hops.length} hops)`,
      suggestion: 'A CDN or edge network can reduce the number of transit hops between users and content.',
      severity: 'low',
    })
  }

  if (recommendations.length === 0) {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
          <Lightbulb className="h-4 w-4 text-emerald-400" />
          Could this be faster?
        </div>
        <p className="flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Everything looks optimized — no recommendations.
        </p>
      </div>
    )
  }

  const severityColor = {
    high: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
    medium: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    low: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300',
  }

  const severityIcon = {
    high: <XCircle className="h-3 w-3" />,
    medium: <AlertTriangle className="h-3 w-3" />,
    low: <Lightbulb className="h-3 w-3" />,
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Lightbulb className="h-4 w-4 text-amber-400" />
        Could this be faster?
        <span className="ml-auto text-[10px] text-muted-foreground">
          {recommendations.length} recommendation{recommendations.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-1.5">
        {recommendations.map((rec, idx) => (
          <div
            key={idx}
            className={cn('rounded-md border px-2.5 py-1.5', severityColor[rec.severity])}
          >
            <div className="flex items-center gap-1.5">
              {severityIcon[rec.severity]}
              <span className="text-xs font-medium">{rec.issue}</span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{rec.suggestion}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================================
// 6. TIME BREAKDOWN — "Where did my request spend time?"
// =====================================================================

export function TimeBreakdownPanel({ trace }: { trace: TraceResult }) {
  if (!trace.finishedAt) return null

  const totalTime = trace.finishedAt - trace.startedAt
  if (totalTime <= 0) return null

  // Estimate time breakdown:
  // - DNS: time until resolvedIp appears (we don't have exact timestamps, so estimate)
  // - TLS: ~1 RTT for TLS 1.2, ~0.5 RTT for TLS 1.3
  // - TCP/Connect: ~1 RTT
  // - Traceroute: the bulk of the time
  // - Server response: ~1 RTT

  const rtt = trace.finalPing ?? 50
  const isTls13 = trace.ssl?.protocol === 'TLSv1.3'

  // Rough estimates based on RTT
  const dnsTime = Math.min(totalTime * 0.05, 20) // ~5% or 20ms max
  const tlsTime = isTls13 ? rtt * 0.5 : rtt
  const connectTime = rtt
  const serverTime = rtt
  const tracerouteTime = totalTime - dnsTime - tlsTime - connectTime - serverTime

  const segments = [
    { label: 'DNS', ms: Math.max(1, dnsTime), color: 'bg-cyan-500' },
    { label: 'TLS', ms: Math.max(1, tlsTime), color: 'bg-purple-500' },
    { label: 'Connect', ms: Math.max(1, connectTime), color: 'bg-blue-500' },
    { label: 'Routing', ms: Math.max(1, tracerouteTime), color: 'bg-amber-500' },
    { label: 'Server', ms: Math.max(1, serverTime), color: 'bg-emerald-500' },
  ]

  const totalMs = segments.reduce((sum, s) => sum + s.ms, 0)

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Clock className="h-4 w-4 text-cyan-400" />
        Where did your request spend time?
        <span className="ml-auto font-mono text-xs text-muted-foreground">{(totalMs / 1000).toFixed(2)}s total</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={cn('transition-all', seg.color)}
            style={{ width: `${(seg.ms / totalMs) * 100}%` }}
            title={`${seg.label}: ${seg.ms.toFixed(0)}ms`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-5 gap-1">
        {segments.map((seg) => (
          <div key={seg.label} className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className={cn('h-2 w-2 rounded-sm', seg.color)} />
            </div>
            <p className="text-[9px] text-muted-foreground">{seg.label}</p>
            <p className="font-mono text-[10px] text-foreground/80">{seg.ms < 1000 ? `${seg.ms.toFixed(0)}ms` : `${(seg.ms / 1000).toFixed(1)}s`}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
