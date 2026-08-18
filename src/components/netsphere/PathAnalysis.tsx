'use client'

import {
  GitBranch,
  Cloud,
  Server,
  AlertTriangle,
  Info,
  CheckCircle2,
  MapPin,
  Route,
  Network,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeoInfo, Hop, TraceResult } from '@/lib/netsphere/types'
import { haversineKm, totalPathDistance, formatDistance } from '@/lib/netsphere/types'

export function PathAnalysis({
  trace,
  userLocation,
}: {
  trace: TraceResult
  userLocation: GeoInfo
}) {
  const geoHops = trace.hops.filter((h) => h.geo && h.geo.country && h.geo.country !== 'LAN')
  const timeoutHops = trace.hops.filter((h) => h.ip === '*').length
  const realHops = trace.hops.filter((h) => h.ip !== '*')

  const insights: { type: 'info' | 'warning' | 'positive'; icon: React.ReactNode; title: string; explanation: string }[] = []

  // --- CDN Edge vs Origin ---
  if (trace.cdn?.detected && trace.serverLocation) {
    const cdnName = trace.cdn.name
    const edgeCity = trace.serverLocation.city ?? 'unknown location'
    const edgeCountry = trace.serverLocation.country ?? ''

    insights.push({
      type: 'info',
      icon: <Cloud className="h-4 w-4" />,
      title: `CDN edge: ${edgeCity}${edgeCountry ? ', ' + edgeCountry : ''}`,
      explanation: `Your request was served from a ${cdnName} edge server in ${edgeCity}, not the origin server. CDNs cache content at hundreds of edge locations worldwide — you automatically hit the one closest to you. The actual origin server (where the website's data lives) is elsewhere, but you never connect to it directly. This is why the trace "stops" here — this IS your destination.`,
    })
  }

  // --- Why the trace stops ---
  if (timeoutHops > 0 && realHops.length < trace.hops.length) {
    const lossPct = (timeoutHops / trace.hops.length) * 100
    insights.push({
      type: lossPct > 50 ? 'warning' : 'info',
      icon: <AlertTriangle className="h-4 w-4" />,
      title: `${timeoutHops} hop${timeoutHops === 1 ? '' : 's'} didn't respond (${lossPct.toFixed(0)}%)`,
      explanation: lossPct > 50
        ? `More than half the routers didn't reply to traceroute probes. This is very common in the Middle East, South Asia, and corporate networks — ISPs often block or deprioritize ICMP (ping) traffic for security. The routers are still forwarding your real traffic (TCP/HTTPS); they just don't answer traceroute. We automatically added the final destination using DNS resolution.`
        : `Some routers didn't reply to traceroute. This is normal — many ISPs and transit providers block ICMP to prevent network mapping. The packets still go through; you just can't see those hops.`,
    })
  }

  // --- Transit path analysis ---
  if (geoHops.length >= 2) {
    const countries = Array.from(new Set(geoHops.map((h) => h.geo!.country).filter(Boolean)))
    const asns = Array.from(new Set(geoHops.map((h) => h.geo?.asn).filter(Boolean)))

    // Detect if the path goes through a known transit hub
    const transitHubs: string[] = []
    for (const hop of geoHops) {
      const city = (hop.geo!.city ?? '').toLowerCase()
      const country = (hop.geo!.country ?? '').toLowerCase()
      if (city.includes('dubai') || city.includes('abu dhabi')) transitHubs.push('Dubai (UAE)')
      if (city.includes('mumbai') || city.includes('chennai') || city.includes('delhi')) transitHubs.push(`${hop.geo!.city} (India)`)
      if (city.includes('singapore')) transitHubs.push('Singapore')
      if (city.includes('frankfurt')) transitHubs.push('Frankfurt (Germany)')
      if (city.includes('london')) transitHubs.push('London (UK)')
      if (city.includes('new york') || city.includes('ashburn')) transitHubs.push(`${hop.geo!.city} (US East)`)
      if (city.includes('san jose') || city.includes('los angeles') || city.includes('seattle')) transitHubs.push(`${hop.geo!.city} (US West)`)
      if (city.includes('hong kong')) transitHubs.push('Hong Kong')
      if (city.includes('tokyo')) transitHubs.push('Tokyo (Japan)')
      if (country.includes('pakistan')) transitHubs.push('Pakistan')
    }

    if (transitHubs.length > 0) {
      const uniqueHubs = Array.from(new Set(transitHubs))
      insights.push({
        type: 'info',
        icon: <Route className="h-4 w-4" />,
        title: `Transit path: ${uniqueHubs.join(' → ')}`,
        explanation: `Your packets passed through ${uniqueHubs.length} major network hub${uniqueHubs.length === 1 ? '' : 's'}: ${uniqueHubs.join(', ')}. These are key internet exchange points where traffic is handed off between ISPs and international backbone providers. Most international traffic flows through a small number of these hubs.`,
      })
    }

    // ASN transition analysis
    if (asns.length > 1) {
      insights.push({
        type: 'info',
        icon: <Network className="h-4 w-4" />,
        title: `${asns.length} networks traversed`,
        explanation: `Your packets crossed ${asns.length} different Autonomous Systems (networks). The typical path is: your ISP → a transit provider (like Level3/Telia/Cogent) → the destination's hosting provider. Each handoff is a "peering" or "transit" agreement between networks.`,
      })
    }
  }

  // --- Geolocation confidence ---
  if (geoHops.length < realHops.length) {
    const unlocated = realHops.length - geoHops.length
    insights.push({
      type: 'info',
      icon: <MapPin className="h-4 w-4" />,
      title: `${unlocated} hop${unlocated === 1 ? '' : 's'} couldn't be located`,
      explanation: `Some IPs couldn't be geolocated — they may belong to private networks, internal infrastructure, or IPs not in the geolocation database. The hop count and RTT are still accurate; only the city/country is missing.`,
    })
  }

  if (insights.length === 0) return null

  const toneClass = {
    info: 'border-cyan-500/30 bg-cyan-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    positive: 'border-emerald-500/30 bg-emerald-500/5',
  }
  const iconColor = {
    info: 'text-cyan-400',
    warning: 'text-amber-400',
    positive: 'text-emerald-400',
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <GitBranch className="h-4 w-4 text-cyan-400" />
        Path Analysis
        <span className="ml-auto text-[10px] text-muted-foreground">
          {insights.length} insight{insights.length === 1 ? '' : 's'}
        </span>
      </div>
      {insights.map((insight, idx) => (
        <div
          key={idx}
          className={cn('rounded-md border px-2.5 py-2', toneClass[insight.type])}
        >
          <div className="flex items-start gap-2">
            <div className={cn('mt-0.5 shrink-0', iconColor[insight.type])}>
              {insight.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground/90">{insight.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {insight.explanation}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
