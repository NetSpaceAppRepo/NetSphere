'use client'

import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Globe2,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Route,
  Network,
  Cloud,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeoInfo, Hop, TraceResult } from '@/lib/netsphere/types'
import { haversineKm } from '@/lib/netsphere/types'

interface Insight {
  type: 'positive' | 'warning' | 'negative' | 'info'
  icon: React.ReactNode
  title: string
  explanation: string
  detail?: string
}

// Generate insights from a completed trace.
// Pure function — no side effects, no backend calls.
export function generateInsights(trace: TraceResult, userLocation: GeoInfo): Insight[] {
  const insights: Insight[] = []
  const hops = trace.hops
  const geoHops = hops.filter((h) => h.geo && h.geo.country && h.geo.country !== 'LAN')
  const rtts = hops.map((h) => h.rtt).filter((r): r is number => typeof r === 'number')

  // --- CDN insight ---
  if (trace.cdn?.detected) {
    const cdnName = trace.cdn.name
    const cdnHeader = trace.cdn.header
    insights.push({
      type: 'info',
      icon: <Cloud className="h-4 w-4" />,
      title: `CDN detected: ${cdnName}`,
      explanation: `This site is served through ${cdnName}, detected via the "${cdnHeader}" HTTP response header. CDNs cache content at edge locations worldwide, so you're likely hitting a server geographically close to you rather than the origin server.`,
      detail: `This reduces latency and improves availability — even if the origin goes down, the CDN can serve cached content.`,
    })
  }

  // --- TLS insight ---
  if (trace.ssl) {
    const tlsVersion = trace.ssl.protocol
    const isModern = tlsVersion === 'TLSv1.3' || tlsVersion === 'TLSv1.2'
    insights.push({
      type: isModern ? 'positive' : 'warning',
      icon: <ShieldCheck className="h-4 w-4" />,
      title: `TLS: ${tlsVersion}`,
      explanation: isModern
        ? `The connection uses ${tlsVersion}, the latest secure protocol. The certificate was issued by ${trace.ssl.issuerCn ?? 'a trusted CA'} and is valid for ${trace.ssl.subjectCn ?? 'this domain'}.`
        : `The connection uses ${tlsVersion}, which is outdated. Modern browsers recommend TLS 1.2 or 1.3 for security.`,
    })
  }

  // --- RTT jump detection ---
  for (let i = 1; i < hops.length; i++) {
    const prev = hops[i - 1]
    const curr = hops[i]
    if (prev.rtt !== undefined && curr.rtt !== undefined && prev.geo && curr.geo) {
      const rttJump = curr.rtt - prev.rtt
      // Significant jump: >30ms increase
      if (rttJump > 30) {
        const prevCountry = prev.geo.country ?? 'Unknown'
        const currCountry = curr.geo.country ?? 'Unknown'
        const isInternational = prevCountry !== currCountry && prevCountry !== 'LAN' && currCountry !== 'LAN'
        const distance = haversineKm(prev.geo.lat, prev.geo.lng, curr.geo.lat, curr.geo.lng)

        let asnChanged = false
        if (prev.geo.asn && curr.geo.asn && prev.geo.asn !== curr.geo.asn) {
          asnChanged = true
        }

        insights.push({
          type: 'info',
          icon: <TrendingUp className="h-4 w-4" />,
          title: `RTT jump at hop ${curr.index}: +${rttJump.toFixed(0)} ms`,
          explanation: isInternational
            ? `This hop crosses an international border (${prevCountry} → ${currCountry}), covering ~${Math.round(distance).toLocaleString()} km. The latency increase reflects the physical distance signals must travel.${asnChanged ? ` The ASN also changed (${prev.geo.asn} → ${curr.geo.asn}), indicating a handoff between networks.` : ''}`
            : `Latency increased by ${rttJump.toFixed(0)} ms between hops ${prev.index} and ${curr.index}.${asnChanged ? ` The ASN changed (${prev.geo.asn} → ${curr.geo.asn}), suggesting a transit between different providers.` : ''} This could indicate a longer physical path or network congestion.`,
        })
      }
    }
  }

  // --- ASN transit analysis ---
  const asnChanges: { from: string; to: string; hopIndex: number }[] = []
  for (let i = 1; i < geoHops.length; i++) {
    const prev = geoHops[i - 1]
    const curr = geoHops[i]
    if (prev.geo?.asn && curr.geo?.asn && prev.geo.asn !== curr.geo.asn) {
      asnChanges.push({
        from: prev.geo.asn,
        to: curr.geo.asn,
        hopIndex: curr.index,
      })
    }
  }
  if (asnChanges.length > 0) {
    insights.push({
      type: 'info',
      icon: <Network className="h-4 w-4" />,
      title: `${asnChanges.length} network transition${asnChanges.length === 1 ? '' : 's'}`,
      explanation: `Your packets traveled through ${asnChanges.length + 1} different network${asnChanges.length === 1 ? '' : 's'}. Each ASN transition represents a handoff between internet providers — typically your ISP → a transit provider → the destination's hosting network.`,
      detail: `Path: ${asnChanges.map((c) => `${c.from.split(' ')[0]} → ${c.to.split(' ')[0]}`).join(' → ')}`,
    })
  }

  // --- Final RTT assessment ---
  if (trace.finalPing !== undefined) {
    const finalRtt = trace.finalPing
    let quality: { label: string; type: Insight['type'] } = { label: 'Good', type: 'positive' }
    if (finalRtt > 200) quality = { label: 'Poor', type: 'negative' }
    else if (finalRtt > 100) quality = { label: 'Fair', type: 'warning' }

    insights.push({
      type: quality.type,
      icon: <Zap className="h-4 w-4" />,
      title: `Final latency: ${finalRtt} ms (${quality.label})`,
      explanation:
        finalRtt < 50
          ? `Excellent latency. The destination is geographically close and the route is efficient. This is typical for CDN-served sites or nearby data centers.`
          : finalRtt < 100
            ? `Good latency. The route is reasonably efficient, though there may be room for improvement if the destination could be served from a closer CDN edge.`
            : finalRtt < 200
              ? `Fair latency. This suggests a geographically distant destination or a route with multiple transit hops. A CDN could significantly improve this.`
              : `High latency. The destination is likely on another continent or the route is suboptimal. Consider using a CDN or checking for network congestion.`,
    })
  }

  // --- Distance vs RTT correlation ---
  if (geoHops.length > 0 && trace.finalPing !== undefined) {
    const lastGeo = geoHops[geoHops.length - 1].geo!
    if (lastGeo && lastGeo.lat !== 0 && userLocation.lat !== 0) {
      const distance = haversineKm(userLocation.lat, userLocation.lng, lastGeo.lat, lastGeo.lng)
      // Speed of light in fiber: ~200,000 km/s → 5 µs/km → 0.005 ms/km (one-way)
      // Round trip = 2× = 0.01 ms/km theoretical minimum
      const theoreticalMinRtt = (distance / 200000) * 1000 * 2
      const efficiency = theoreticalMinRtt > 0 ? (theoreticalMinRtt / trace.finalPing) * 100 : 0

      insights.push({
        type: efficiency > 60 ? 'positive' : efficiency > 30 ? 'info' : 'warning',
        icon: <Route className="h-4 w-4" />,
        title: `Distance efficiency: ${efficiency.toFixed(0)}%`,
        explanation: `The straight-line distance to the destination is ~${Math.round(distance).toLocaleString()} km. The theoretical minimum RTT (speed of light in fiber) is ~${theoreticalMinRtt.toFixed(1)} ms. Your actual RTT of ${trace.finalPing} ms is ${efficiency.toFixed(0)}% of the physical limit — ${efficiency > 60 ? 'very efficient' : efficiency > 30 ? 'typical' : 'there may be routing inefficiency'}.`,
      })
    }
  }

  // --- Packet loss analysis ---
  const timeoutHops = hops.filter((h) => h.ip === '*').length
  if (timeoutHops > 0) {
    const lossPct = (timeoutHops / hops.length) * 100
    insights.push({
      type: lossPct > 50 ? 'negative' : 'warning',
      icon: <AlertTriangle className="h-4 w-4" />,
      title: `${timeoutHops} hop${timeoutHops === 1 ? '' : 's'} timed out (${lossPct.toFixed(0)}% loss)`,
      explanation:
        lossPct > 50
          ? `More than half the hops didn't respond. This is common on networks that block ICMP (ping) traffic — the routers are still routing packets, they just don't reply to traceroute probes. The final destination is still reachable.`
          : `Some intermediate routers didn't respond to traceroute probes. This is normal — many routers deprioritize or block ICMP. The trace still completed successfully.`,
    })
  }

  // --- Geolocation summary ---
  if (geoHops.length > 0) {
    const countries = new Set(geoHops.map((h) => h.geo?.country).filter(Boolean))
    if (countries.size > 1) {
      insights.push({
        type: 'info',
        icon: <Globe2 className="h-4 w-4" />,
        title: `Crossed ${countries.size} countries`,
        explanation: `Your packets traveled through ${Array.from(countries).join(', ')}. International routes typically involve undersea cables or cross-border fiber links, and pass through multiple transit providers.`,
      })
    }
  }

  return insights
}

function insightTone(type: Insight['type']): string {
  switch (type) {
    case 'positive':
      return 'border-emerald-500/30 bg-emerald-500/5'
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/5'
    case 'negative':
      return 'border-rose-500/30 bg-rose-500/5'
    default:
      return 'border-cyan-500/30 bg-cyan-500/5'
  }
}

function insightIconTone(type: Insight['type']): string {
  switch (type) {
    case 'positive':
      return 'text-emerald-400'
    case 'warning':
      return 'text-amber-400'
    case 'negative':
      return 'text-rose-400'
    default:
      return 'text-cyan-400'
  }
}

export function InsightsPanel({ trace, userLocation }: { trace: TraceResult; userLocation: GeoInfo }) {
  const insights = generateInsights(trace, userLocation)

  if (insights.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 text-sm font-medium text-foreground/90">
        <Lightbulb className="h-4 w-4 text-amber-400" />
        Why did this happen?
        <span className="text-[10px] font-normal text-muted-foreground">
          {insights.length} insight{insights.length === 1 ? '' : 's'}
        </span>
      </div>
      {insights.map((insight, idx) => (
        <div
          key={`insight-${idx}`}
          className={cn(
            'rounded-lg border px-3 py-2.5 transition-colors',
            insightTone(insight.type),
          )}
        >
          <div className="flex items-start gap-2.5">
            <div className={cn('mt-0.5 shrink-0', insightIconTone(insight.type))}>
              {insight.icon}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground/90">{insight.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {insight.explanation}
              </p>
              {insight.detail && (
                <p className="font-mono text-[10px] text-muted-foreground/70">
                  {insight.detail}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
