'use client'

import { useState } from 'react'
import {
  Globe2,
  Server,
  Mail,
  FileText,
  Network,
  Link2,
  Database,
  ChevronDown,
  ChevronRight,
  MapPin,
  Navigation,
  Clock,
  Zap,
  Activity,
  Crosshair,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeoInfo, Hop, TraceResult } from '@/lib/netsphere/types'
import { latLngToVector3, hopColor, haversineKm, formatDistance } from '@/lib/netsphere/types'

// =====================================================================
// 1. DNS RECORDS EXPLORER
// =====================================================================

function DnsRecordRow({ type, label, icon, records }: {
  type: string
  label: string
  icon: React.ReactNode
  records: string[] | { priority: number; exchange: string }[] | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  if (!records || (Array.isArray(records) && records.length === 0)) return null

  const displayRecords = records as any[]
  const preview = displayRecords.slice(0, 2)
  const hasMore = displayRecords.length > 2

  return (
    <div className="rounded-md border border-border/30 bg-card/20 px-2 py-1.5">
      <div
        className={cn('flex items-center gap-2', hasMore && 'cursor-pointer')}
        onClick={() => hasMore && setExpanded(!expanded)}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-mono text-[10px] font-bold uppercase text-cyan-300">{type}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">{displayRecords.length}</span>
          {hasMore && (
            expanded
              ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
      </div>
      <div className="mt-1 space-y-0.5">
        {(expanded ? displayRecords : preview).map((record, idx) => (
          <p key={idx} className="truncate font-mono text-[10px] text-foreground/80" title={typeof record === 'string' ? record : `${record.priority} ${record.exchange}`}>
            {typeof record === 'string'
              ? record
              : `${record.priority} ${record.exchange}`
            }
          </p>
        ))}
      </div>
    </div>
  )
}

export function DnsRecordsPanel({ trace }: { trace: TraceResult }) {
  const dns = trace.dnsRecords
  if (!dns) return null

  const hasAny = dns.a.length > 0 || dns.aaaa.length > 0 || dns.mx.length > 0 ||
    dns.txt.length > 0 || dns.ns.length > 0 || dns.cname.length > 0 || dns.soa
  if (!hasAny) return null

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Globe2 className="h-4 w-4 text-cyan-400" />
        DNS Records
        <span className="ml-auto text-[10px] text-muted-foreground">
          {trace.dnsServers.length} resolver{trace.dnsServers.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-1">
        <DnsRecordRow type="A" label="IPv4" icon={<Server className="h-3 w-3" />} records={dns.a} />
        <DnsRecordRow type="AAAA" label="IPv6" icon={<Server className="h-3 w-3" />} records={dns.aaaa} />
        <DnsRecordRow type="MX" label="Mail" icon={<Mail className="h-3 w-3" />} records={dns.mx} />
        <DnsRecordRow type="TXT" label="Text" icon={<FileText className="h-3 w-3" />} records={dns.txt} />
        <DnsRecordRow type="NS" label="Nameservers" icon={<Network className="h-3 w-3" />} records={dns.ns} />
        <DnsRecordRow type="CNAME" label="Alias" icon={<Link2 className="h-3 w-3" />} records={dns.cname} />
        {dns.soa && (
          <div className="rounded-md border border-border/30 bg-card/20 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <Database className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px] font-bold uppercase text-cyan-300">SOA</span>
              <span className="text-[10px] text-muted-foreground">Start of Authority</span>
            </div>
            <div className="mt-1 space-y-0.5">
              <p className="truncate font-mono text-[10px] text-foreground/80">ns: {dns.soa.mname}</p>
              <p className="truncate font-mono text-[10px] text-foreground/80">admin: {dns.soa.rname}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================================
// 2. VISUAL ROUTE MAP (2D top-down)
// =====================================================================
// A 2D equirectangular map projection showing all hops as numbered markers
// connected by lines. Gives a clear "where did my packets go" view without
// needing to rotate the 3D globe.

function latLngToMapCoords(lat: number, lng: number, width: number, height: number) {
  // Equirectangular projection: x = (lng + 180) / 360 * width, y = (90 - lat) / 180 * height
  const x = ((lng + 180) / 360) * width
  const y = ((90 - lat) / 180) * height
  return { x, y }
}

export function VisualRouteMap({
  trace,
  userLocation,
}: {
  trace: TraceResult
  userLocation: GeoInfo
}) {
  const geoHops = trace.hops.filter((h) => h.geo && h.geo.lat !== 0 && h.geo.lng !== 0 && h.geo.country !== 'LAN')
  if (geoHops.length === 0) return null

  const W = 320
  const H = 160
  const points = [
    { lat: userLocation.lat, lng: userLocation.lng, isOrigin: true, isFinal: false, index: 0 },
    ...geoHops.map((h, i) => ({
      lat: h.geo!.lat,
      lng: h.geo!.lng,
      isOrigin: false,
      isFinal: i === geoHops.length - 1,
      index: i + 1,
    })),
  ]

  const coords = points.map((p) => ({ ...p, ...latLngToMapCoords(p.lat, p.lng, W, H) }))

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Navigation className="h-4 w-4 text-cyan-400" />
        Route Map
        <span className="ml-auto text-[10px] text-muted-foreground">top-down view</span>
      </div>
      <div className="relative overflow-hidden rounded-md border border-border/30 bg-background/60">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
          {/* Simplified world map grid */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(34,211,238,0.08)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />

          {/* Continents (very simplified shapes) */}
          <g fill="rgba(34,211,238,0.06)" stroke="rgba(34,211,238,0.2)" strokeWidth="0.5">
            {/* North America */}
            <path d="M 30 30 L 80 25 L 90 50 L 75 70 L 50 75 L 35 60 Z" />
            {/* South America */}
            <path d="M 75 80 L 90 75 L 95 110 L 80 130 L 70 110 Z" />
            {/* Europe */}
            <path d="M 140 30 L 170 28 L 175 45 L 155 50 L 145 40 Z" />
            {/* Africa */}
            <path d="M 145 55 L 175 52 L 180 85 L 165 120 L 150 100 L 145 75 Z" />
            {/* Asia */}
            <path d="M 175 25 L 260 28 L 270 55 L 240 65 L 200 55 L 180 45 Z" />
            {/* Australia */}
            <path d="M 245 95 L 275 92 L 280 110 L 260 115 Z" />
          </g>

          {/* Route lines */}
          {coords.slice(1).map((p, i) => {
            const prev = coords[i]
            return (
              <line
                key={`line-${i}`}
                x1={prev.x}
                y1={prev.y}
                x2={p.x}
                y2={p.y}
                stroke={hopColor(i, coords.length)}
                strokeWidth="1.5"
                strokeDasharray="2 1"
                opacity="0.7"
              />
            )
          })}

          {/* Hop markers */}
          {coords.map((p, i) => {
            const color = i === 0 ? '#22d3ee' : hopColor(i - 1, coords.length)
            return (
              <g key={`marker-${i}`}>
                {p.isOrigin || p.isFinal ? (
                  <circle cx={p.x} cy={p.y} r="5" fill={color} opacity="0.3" />
                ) : null}
                <circle cx={p.x} cy={p.y} r="3" fill={color} stroke="#000" strokeWidth="0.5" />
                <text
                  x={p.x}
                  y={p.y - 6}
                  textAnchor="middle"
                  fontSize="6"
                  fill={color}
                  fontWeight="bold"
                >
                  {p.isOrigin ? 'YOU' : p.index}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{geoHops.length} geolocated hop{geoHops.length === 1 ? '' : 's'}</span>
        <span>Each dot = a router</span>
      </div>
    </div>
  )
}

// =====================================================================
// 3. INTERNET CONSTELLATION (all past traces' endpoints on the globe)
// =====================================================================
// Shows all the destinations you've ever traced as persistent dots on a
// mini 2D map. Like collecting stamps in a passport, but visual.

export function InternetConstellation({ history }: { history: TraceResult[] }) {
  if (history.length === 0) return null

  const W = 320
  const H = 160

  // Collect all unique endpoints from history
  const endpoints = new Map<string, { lat: number; lng: number; target: string; city?: string }>()
  for (const trace of history) {
    if (trace.serverLocation && trace.serverLocation.lat !== 0) {
      const key = `${trace.serverLocation.lat.toFixed(2)},${trace.serverLocation.lng.toFixed(2)}`
      if (!endpoints.has(key)) {
        endpoints.set(key, {
          lat: trace.serverLocation.lat,
          lng: trace.serverLocation.lng,
          target: trace.target,
          city: trace.serverLocation.city,
        })
      }
    }
  }

  if (endpoints.size === 0) return null

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Activity className="h-4 w-4 text-purple-400" />
        Internet Constellation
        <span className="ml-auto text-[10px] text-muted-foreground">
          {endpoints.size} destination{endpoints.size === 1 ? '' : 's'} visited
        </span>
      </div>
      <div className="relative overflow-hidden rounded-md border border-border/30 bg-background/60">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
          <defs>
            <pattern id="constellation-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(167,139,250,0.08)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#constellation-grid)" />

          {/* Simplified continents */}
          <g fill="rgba(167,139,250,0.05)" stroke="rgba(167,139,250,0.15)" strokeWidth="0.5">
            <path d="M 30 30 L 80 25 L 90 50 L 75 70 L 50 75 L 35 60 Z" />
            <path d="M 75 80 L 90 75 L 95 110 L 80 130 L 70 110 Z" />
            <path d="M 140 30 L 170 28 L 175 45 L 155 50 L 145 40 Z" />
            <path d="M 145 55 L 175 52 L 180 85 L 165 120 L 150 100 L 145 75 Z" />
            <path d="M 175 25 L 260 28 L 270 55 L 240 65 L 200 55 L 180 45 Z" />
            <path d="M 245 95 L 275 92 L 280 110 L 260 115 Z" />
          </g>

          {/* Endpoint dots */}
          {Array.from(endpoints.values()).map((ep, i) => {
            const { x, y } = latLngToMapCoords(ep.lat, ep.lng, W, H)
            return (
              <g key={`ep-${i}`}>
                <circle cx={x} cy={y} r="4" fill="#a78bfa" opacity="0.2" />
                <circle cx={x} cy={y} r="2" fill="#a78bfa" stroke="#fff" strokeWidth="0.3" />
                <title>{ep.target} — {ep.city}</title>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Every purple dot is a server you've traced. Keep tracing to build your constellation!
      </p>
    </div>
  )
}

// =====================================================================
// 4. NETWORK PULSE (live latency visualization)
// =====================================================================
// Shows a live-updating visualization of the connection quality with
// an animated pulse and latency gauge.

export function NetworkPulse({ trace }: { trace: TraceResult }) {
  if (trace.finalPing === undefined) return null

  const rtt = trace.finalPing
  const quality = rtt < 50 ? 'excellent' : rtt < 100 ? 'good' : rtt < 200 ? 'fair' : 'poor'
  const color = rtt < 50 ? '#34d399' : rtt < 100 ? '#22d3ee' : rtt < 200 ? '#f59e0b' : '#ef4444'

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
          <Zap className="h-4 w-4" style={{ color }} />
          Network Pulse
        </div>
        <span className="text-[10px] uppercase tracking-wider" style={{ color }}>
          {quality}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {/* Animated pulse */}
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full opacity-20 animate-ping"
            style={{ backgroundColor: color }}
          />
          <div
            className="absolute inset-2 rounded-full opacity-40"
            style={{ backgroundColor: color }}
          />
          <div
            className="relative rounded-full p-2"
            style={{ backgroundColor: color }}
          >
            <Activity className="h-4 w-4 text-black" />
          </div>
        </div>
        {/* Latency display */}
        <div className="flex-1">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-3xl font-bold" style={{ color }}>
              {rtt}
            </span>
            <span className="text-sm text-muted-foreground">ms</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {rtt < 50
              ? 'Faster than 90% of connections'
              : rtt < 100
                ? 'Typical for regional traffic'
                : rtt < 200
                  ? 'Likely cross-continental'
                  : 'High latency — distant or congested'}
          </p>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// 5. SERVER FINGERPRINT (who is this server really?)
// =====================================================================
// Summarizes everything we know about the destination server in one glance.

export function ServerFingerprint({ trace }: { trace: TraceResult }) {
  const geo = trace.serverLocation
  if (!geo && !trace.cdn && !trace.ssl) return null

  const fingerprints: { label: string; value: string; icon: React.ReactNode }[] = []

  if (trace.cdn) {
    fingerprints.push({
      label: 'CDN',
      value: trace.cdn.name,
      icon: <Network className="h-3 w-3" />,
    })
  }

  if (geo?.isp) {
    fingerprints.push({
      label: 'Hosting',
      value: geo.isp,
      icon: <Server className="h-3 w-3" />,
    })
  }

  if (geo?.asn) {
    fingerprints.push({
      label: 'ASN',
      value: geo.asn,
      icon: <Network className="h-3 w-3" />,
    })
  }

  if (geo?.city && geo?.country) {
    fingerprints.push({
      label: 'Location',
      value: `${geo.city}, ${geo.country}`,
      icon: <MapPin className="h-3 w-3" />,
    })
  }

  if (geo?.timezone) {
    fingerprints.push({
      label: 'Timezone',
      value: geo.timezone,
      icon: <Clock className="h-3 w-3" />,
    })
  }

  if (trace.ssl?.protocol) {
    fingerprints.push({
      label: 'TLS',
      value: trace.ssl.protocol,
      icon: <Crosshair className="h-3 w-3" />,
    })
  }

  if (trace.resolvedIp) {
    fingerprints.push({
      label: 'IP',
      value: trace.resolvedIp,
      icon: <Server className="h-3 w-3" />,
    })
  }

  if (fingerprints.length === 0) return null

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Crosshair className="h-4 w-4 text-cyan-400" />
        Server Fingerprint
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {fingerprints.map((fp, i) => (
          <div key={i} className="rounded-md border border-border/30 bg-card/20 px-2 py-1">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              {fp.icon}
              {fp.label}
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/90" title={fp.value}>
              {fp.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
