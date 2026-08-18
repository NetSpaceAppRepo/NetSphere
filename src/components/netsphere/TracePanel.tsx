'use client'

import {
  Globe2,
  Lock,
  Server,
  ShieldCheck,
  MapPin,
  Clock,
  Network,
  Hash,
  Building2,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Cloud,
  WifiOff,
  Download,
  History,
  Trash2,
  TrendingUp,
  Route,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { GeoInfo, Hop, TraceResult } from '@/lib/netsphere/types'
import { hopColor, totalPathDistance, formatDistance } from '@/lib/netsphere/types'
import { InsightsPanel } from './InsightsPanel'
import { SecurityPanel } from './SecurityPanel'
import { TimeMachinePanel } from './TimeMachinePanel'
import { RouteComparison } from './RouteComparison'
import { PathAnalysis } from './PathAnalysis'
import {
  CarbonFootprintPanel,
  HealthDashboard,
  NetworkPassport,
  StoryMode,
  RecommendationsPanel,
  TimeBreakdownPanel,
} from './AnalysisPanels'
import {
  DnsRecordsPanel,
  VisualRouteMap,
  InternetConstellation,
  NetworkPulse,
  ServerFingerprint,
} from './BombasticPanels'

function StageRow({
  icon,
  label,
  detail,
  active,
  done,
  error,
}: {
  icon: React.ReactNode
  label: string
  detail?: string
  active?: boolean
  done?: boolean
  error?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2.5 transition-colors',
        active && 'border-cyan-500/60 bg-cyan-500/5',
        done && 'border-emerald-500/40 bg-emerald-500/5',
        error && 'border-rose-500/40 bg-rose-500/5',
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          active
            ? 'bg-cyan-500/15 text-cyan-300'
            : done
              ? 'bg-emerald-500/15 text-emerald-300'
              : error
                ? 'bg-rose-500/15 text-rose-300'
                : 'bg-slate-700/40 text-slate-400',
        )}
      >
        {active ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground/90">{label}</span>
          {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
        </div>
        {detail && (
          <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground" title={detail}>
            {detail}
          </p>
        )}
      </div>
    </div>
  )
}

function HopRow({
  hop,
  total,
  isFinal,
}: {
  hop: Hop
  total: number
  isFinal: boolean
}) {
  const isTimeout = hop.ip === '*'
  const isPrivate = hop.geo?.country === 'LAN'
  const color = isTimeout ? '#64748b' : isPrivate ? '#475569' : hopColor(hop.index - 1, Math.max(1, total - 1))
  const geo = hop.geo
  const bgp = hop.bgp

  // The "asn" to display: prefer BGP name, then geo.asn, then org
  const asnDisplay = bgp?.asnName
    ? `${bgp.asn} · ${bgp.asnName}`
    : geo?.asn
      ? `${geo.asn}${geo.org && geo.org !== geo.asn ? ' · ' + geo.org : ''}`
      : geo?.org

  return (
    <div className="group flex items-start gap-3 py-2.5 rounded-md">
      <div className="flex flex-col items-center pt-1">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] font-bold text-black"
          style={{ backgroundColor: color, boxShadow: isTimeout || isPrivate ? 'none' : `0 0 12px ${color}` }}
        >
          {hop.index}
        </span>
        {!isFinal && <span className="mt-1 h-6 w-px bg-gradient-to-b from-cyan-500/60 to-transparent" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-foreground">
            {isTimeout ? '✱ timeout' : hop.ip}
          </span>
          {isFinal && (
            <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-[10px] text-amber-300">
              TARGET
            </Badge>
          )}
          {isPrivate && (
            <Badge variant="outline" className="border-slate-600/40 bg-slate-700/20 text-[10px] text-slate-400">
              <WifiOff className="mr-1 h-2.5 w-2.5" />
              LAN
            </Badge>
          )}
          {isTimeout && (
            <Badge variant="outline" className="border-slate-600/40 bg-slate-700/20 text-[10px] text-slate-400">
              No response
            </Badge>
          )}
        </div>
        {/* Hostname (from reverse DNS or tracert) */}
        {hop.hostname && hop.hostname !== hop.ip && (
          <p className="mt-0.5 truncate font-mono text-[11px] text-purple-300/80" title={hop.hostname}>
            {hop.hostname}
          </p>
        )}
        {geo ? (
          <div className="mt-0.5 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              {[geo.city, geo.region, geo.country].filter(Boolean).join(', ')}
            </p>
            {asnDisplay && (
              <p className="truncate font-mono text-[11px] text-cyan-300/80" title={asnDisplay}>
                {asnDisplay}
              </p>
            )}
            {bgp?.prefix && (
              <p className="truncate font-mono text-[10px] text-muted-foreground/70" title={`BGP prefix: ${bgp.prefix}`}>
                prefix: {bgp.prefix}
              </p>
            )}
          </div>
        ) : (
          !isTimeout && (
            <p className="mt-0.5 text-xs italic text-muted-foreground/60">
              {isPrivate ? 'Local network device' : 'Geolocating…'}
            </p>
          )
        )}
      </div>
      {hop.rtt !== undefined && (
        <span className="font-mono text-xs text-muted-foreground">{hop.rtt.toFixed(1)} ms</span>
      )}
    </div>
  )
}

function StatChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className={cn('mt-0.5 truncate font-mono text-sm', tone ?? 'text-foreground')} title={value}>
        {value}
      </p>
    </div>
  )
}

function HistoryItem({
  trace,
  onClick,
}: {
  trace: TraceResult
  onClick: () => void
}) {
  const date = new Date(trace.startedAt)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md border border-border/30 bg-card/30 px-2.5 py-1.5 text-left transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/5"
    >
      <History className="h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-foreground">{trace.target}</p>
        <p className="text-[10px] text-muted-foreground">
          {time} · {trace.hops.length} hops
          {trace.finalPing !== undefined && ` · ${trace.finalPing}ms`}
        </p>
      </div>
    </button>
  )
}

export function TracePanel({
  trace,
  userLocation,
  history,
  onReplayHistory,
  onClearHistory,
  onExport,
}: {
  trace: TraceResult | null
  userLocation: GeoInfo
  history: TraceResult[]
  onReplayHistory: (index: number) => void
  onClearHistory: () => void
  onExport: (trace: TraceResult) => void
}) {
  if (!trace) {
    return (
      <div className="flex h-full flex-col">
        <ScrollArea className="flex-1">
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="relative mb-4">
              <Globe2 className="h-14 w-14 text-cyan-400" />
              <div className="absolute inset-0 -z-10 rounded-full bg-cyan-400/30 blur-2xl" />
            </div>
            <h3 className="text-lg font-semibold text-glow-cyan">NetSphere</h3>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Enter a domain above to run a <span className="text-cyan-300">real</span> trace across the planet — DNS, TLS handshake, CDN detection, and live traceroute with BGP/ASN enrichment.
            </p>
            <div className="mt-6 grid w-full grid-cols-1 gap-2 text-left">
              {[
                { icon: <Network className="h-4 w-4 text-cyan-400" />, label: 'DNS Resolution', desc: 'Real DNS via your system resolvers' },
                { icon: <Lock className="h-4 w-4 text-cyan-400" />, label: 'TLS Handshake', desc: 'Real cipher suite + cert inspection' },
                { icon: <Cloud className="h-4 w-4 text-cyan-400" />, label: 'CDN Detection', desc: 'Real HTTP header inspection' },
                { icon: <Activity className="h-4 w-4 text-cyan-400" />, label: 'Live Traceroute', desc: 'Real tracert, hop by hop' },
                { icon: <Server className="h-4 w-4 text-cyan-400" />, label: 'BGP Enrichment', desc: 'ASN name, country, prefix via BGPView' },
                { icon: <Hash className="h-4 w-4 text-cyan-400" />, label: 'Reverse DNS', desc: 'PTR lookup for each hop via DoH' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-md border border-border/30 bg-card/30 px-3 py-2">
                  {item.icon}
                  <div>
                    <p className="text-sm font-medium text-foreground/90">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 max-w-xs text-[11px] text-muted-foreground/70">
              No simulated data. Every hop is a real router on the public internet.
            </p>
          </div>
        </ScrollArea>

        {history.length > 0 && (
          <div className="border-t border-border/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Recent traces ({history.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearHistory}
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-rose-300"
              >
                <Trash2 className="mr-1 h-2.5 w-2.5" />
                Clear
              </Button>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {history.map((item, idx) => (
                <HistoryItem key={`${item.target}-${item.startedAt}-${idx}`} trace={item} onClick={() => onReplayHistory(idx)} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const isDone = trace.status === 'done'
  const isError = trace.status === 'error'
  const totalHops = trace.hops.length
  const stage = trace.status
  const geoHops = trace.hops.filter((h) => h.geo && h.geo.country !== 'LAN').length
  const timeoutHops = trace.hops.filter((h) => h.ip === '*').length
  const packetLoss = totalHops > 0 ? Math.round((timeoutHops / totalHops) * 100) : 0
  const rtts = trace.hops.map((h) => h.rtt).filter((r): r is number => typeof r === 'number')
  const minRtt = rtts.length > 0 ? Math.min(...rtts) : undefined
  const maxRtt = rtts.length > 0 ? Math.max(...rtts) : undefined
  const avgRtt = rtts.length > 0 ? rtts.reduce((a, b) => a + b, 0) / rtts.length : undefined
  const pathDistance = totalPathDistance(userLocation, trace.hops)

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tracing</p>
              <h2 className="truncate font-mono text-xl font-semibold text-glow-cyan">{trace.target}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isDone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExport(trace)}
                  className="h-7 gap-1 border-cyan-500/30 bg-card/40 px-2 text-[10px] text-cyan-300 hover:bg-cyan-500/10"
                  title="Export trace as JSON"
                >
                  <Download className="h-3 w-3" />
                  Export
                </Button>
              )}
              <Badge
                variant="outline"
                className={cn(
                  isDone && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                  isError && 'border-rose-500/40 bg-rose-500/10 text-rose-300',
                  !isDone && !isError && 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
                )}
              >
                <span className={cn('mr-1.5 inline-block h-1.5 w-1.5 rounded-full', isDone ? 'bg-emerald-400' : isError ? 'bg-rose-400' : 'bg-cyan-400 animate-pulse')} />
                {trace.status.toUpperCase()}
              </Badge>
            </div>
          </div>
          {isError && trace.error && (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="font-mono break-all">{trace.error}</span>
            </div>
          )}
        </div>

        {/* Stage tracker */}
        <div className="space-y-1.5">
          <StageRow
            icon={<Network className="h-4 w-4" />}
            label="DNS Resolution"
            detail={
              trace.resolvedIp
                ? `${trace.target} → ${trace.resolvedIp}${trace.dnsServers.length ? ` · via ${trace.dnsServers.join(', ')}` : ''}`
                : undefined
            }
            active={stage === 'dns' || stage === 'resolving'}
            done={!!trace.resolvedIp || stage === 'ssl' || stage === 'traceroute' || isDone}
            error={isError && !trace.resolvedIp}
          />
          <StageRow
            icon={<Lock className="h-4 w-4" />}
            label="TLS Handshake"
            detail={
              trace.ssl
                ? `${trace.ssl.protocol} · ${trace.ssl.cipher}${trace.ssl.issuerCn ? ` · ${trace.ssl.issuerCn}` : ''}`
                : undefined
            }
            active={stage === 'ssl'}
            done={!!trace.ssl || stage === 'traceroute' || isDone}
          />
          <StageRow
            icon={<Cloud className="h-4 w-4" />}
            label="CDN Detection"
            detail={trace.cdn ? `${trace.cdn.name}${trace.cdn.header ? ` · ${trace.cdn.header}` : ''}` : undefined}
            active={stage === 'traceroute' && !trace.cdn}
            done={!!trace.cdn || stage === 'traceroute' || isDone}
          />
          <StageRow
            icon={<Activity className="h-4 w-4" />}
            label="Traceroute"
            detail={
              totalHops > 0
                ? `${totalHops} hops · ${geoHops} geolocated${timeoutHops > 0 ? ` · ${timeoutHops} timeouts` : ''}`
                : stage === 'traceroute'
                  ? 'Waiting for first hop…'
                  : undefined
            }
            active={stage === 'traceroute'}
            done={isDone}
          />
        </div>

        <Separator />

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-2">
          <StatChip icon={<Hash className="h-3 w-3" />} label="Resolved IP" value={trace.resolvedIp ?? '—'} />
          <StatChip
            icon={<Zap className="h-3 w-3" />}
            label="Final RTT"
            value={trace.finalPing !== undefined ? `${trace.finalPing} ms` : '—'}
            tone={trace.finalPing !== undefined ? 'text-amber-300' : undefined}
          />
          <StatChip icon={<Server className="h-3 w-3" />} label="Server ASN" value={trace.serverLocation?.asn ?? '—'} />
          <StatChip icon={<Building2 className="h-3 w-3" />} label="Hosting" value={trace.serverLocation?.isp ?? '—'} />
        </div>

        {/* RTT statistics + total distance (only when traceroute is running or done) */}
        {(stage === 'traceroute' || isDone) && rtts.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            <StatChip icon={<TrendingUp className="h-3 w-3" />} label="Min RTT" value={minRtt !== undefined ? `${minRtt.toFixed(1)} ms` : '—'} tone="text-emerald-300" />
            <StatChip icon={<TrendingUp className="h-3 w-3" />} label="Avg RTT" value={avgRtt !== undefined ? `${avgRtt.toFixed(1)} ms` : '—'} tone="text-cyan-300" />
            <StatChip icon={<TrendingUp className="h-3 w-3" />} label="Max RTT" value={maxRtt !== undefined ? `${maxRtt.toFixed(1)} ms` : '—'} tone="text-amber-300" />
            <StatChip icon={<Route className="h-3 w-3" />} label="Distance" value={pathDistance > 0 ? formatDistance(pathDistance) : '—'} tone="text-purple-300" />
          </div>
        )}

        {/* Packet loss (only if there are timeouts) */}
        {packetLoss > 0 && (
          <div className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-xs',
            packetLoss > 50 ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
          )}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Packet loss: {packetLoss}% ({timeoutHops}/{totalHops} hops timed out)</span>
          </div>
        )}

        {/* TLS details */}
        {trace.ssl && (
          <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              TLS Certificate
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Subject CN</span>
                <span className="truncate font-mono text-foreground" title={trace.ssl.subjectCn}>{trace.ssl.subjectCn ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Issuer</span>
                <span className="truncate font-mono text-foreground" title={trace.ssl.issuerCn}>{trace.ssl.issuerCn ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Valid</span>
                <span className="font-mono text-foreground">
                  {trace.ssl.validFrom ? `${trace.ssl.validFrom} → ${trace.ssl.validTo ?? '?'}` : '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Server location */}
        {trace.serverLocation && (
          <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
              <MapPin className="h-4 w-4 text-amber-400" />
              Server Location
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Coordinates</span>
                <span className="font-mono text-foreground">
                  {trace.serverLocation.lat.toFixed(4)}°, {trace.serverLocation.lng.toFixed(4)}°
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">City</span>
                <span className="truncate font-mono text-foreground" title={`${trace.serverLocation.city}, ${trace.serverLocation.country}`}>
                  {[trace.serverLocation.city, trace.serverLocation.country].filter(Boolean).join(', ')}
                </span>
              </div>
              {trace.serverLocation.timezone && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Timezone</span>
                  <span className="truncate font-mono text-foreground">{trace.serverLocation.timezone}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Security analysis — HSTS, HTTP/2, IPv6, port scan */}
        {trace.security && <SecurityPanel trace={trace} />}

        {/* Time Machine — RTT trends across traces to the same target */}
        {isDone && (
          <TimeMachinePanel currentTrace={trace} history={history} />
        )}

        {/* Route Comparison — diff current trace vs previous trace to same target */}
        {isDone && (
          <RouteComparison currentTrace={trace} history={history} />
        )}

        {/* Internet Health Dashboard — overall score */}
        {isDone && <HealthDashboard trace={trace} />}

        {/* Time Breakdown — where did the request spend time */}
        {isDone && <TimeBreakdownPanel trace={trace} />}

        {/* Network Passport — countries, ASNs, distance collected */}
        {isDone && (
          <NetworkPassport trace={trace} userLocation={userLocation} />
        )}

        {/* Carbon Footprint — energy + CO2 estimate */}
        {isDone && (
          <CarbonFootprintPanel trace={trace} userLocation={userLocation} />
        )}

        {/* Story Mode — narrative journey explanation */}
        {isDone && (
          <StoryMode trace={trace} userLocation={userLocation} />
        )}

        {/* Recommendations — could this be faster? */}
        {isDone && <RecommendationsPanel trace={trace} />}

        {/* DNS Records Explorer */}
        {isDone && trace.dnsRecords && <DnsRecordsPanel trace={trace} />}

        {/* Server Fingerprint — who is this server? */}
        {isDone && <ServerFingerprint trace={trace} />}

        {/* Network Pulse — live latency visualization */}
        {isDone && <NetworkPulse trace={trace} />}

        {/* Visual Route Map — 2D top-down view */}
        {isDone && (
          <VisualRouteMap trace={trace} userLocation={userLocation} />
        )}

        {/* Internet Constellation — all past destinations */}
        {isDone && <InternetConstellation history={history} />}

        {/* Hop list */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
              <Activity className="h-4 w-4 text-cyan-400" />
              Hop-by-Hop Journey
            </div>
            {totalHops > 0 && (
              <span className="font-mono text-xs text-muted-foreground">
                {totalHops} {totalHops === 1 ? 'hop' : 'hops'}
              </span>
            )}
          </div>

          {/* Origin */}
          <div className="flex items-start gap-3 py-2.5">
            <div className="flex flex-col items-center pt-1">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] font-bold text-black"
                style={{ backgroundColor: '#22d3ee', boxShadow: '0 0 12px #22d3ee' }}
              >
                <Globe2 className="h-3.5 w-3.5" />
              </span>
              {totalHops > 0 && <span className="mt-1 h-6 w-px bg-gradient-to-b from-cyan-500/60 to-transparent" />}
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-mono text-xs text-foreground">You</span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {userLocation.city && userLocation.country
                  ? `${userLocation.city}, ${userLocation.country}`
                  : `${userLocation.lat.toFixed(2)}°, ${userLocation.lng.toFixed(2)}°`}
              </p>
              {userLocation.isp && (
                <p className="truncate font-mono text-[11px] text-cyan-300/70" title={userLocation.isp}>
                  {userLocation.isp}
                </p>
              )}
            </div>
            <span className="font-mono text-xs text-muted-foreground">0.0 ms</span>
          </div>

          {trace.hops.map((hop, idx) => (
            <HopRow
              key={`hop-${hop.index}-${hop.ip}`}
              hop={hop}
              total={totalHops}
              isFinal={idx === totalHops - 1 && isDone}
            />
          ))}

          {totalHops === 0 && !isError && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {stage === 'traceroute' ? 'Waiting for first hop…' : 'Preparing trace…'}
            </div>
          )}
        </div>

        {/* Footer timing */}
        {trace.finishedAt && (
          <div className="flex items-center justify-center gap-2 pt-2 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Completed in {((trace.finishedAt - trace.startedAt) / 1000).toFixed(2)}s
          </div>
        )}

        {/* Insights — explain WHY the trace looks the way it does */}
        {isDone && trace.hops.length > 0 && (
          <>
            <Separator />
            <InsightsPanel trace={trace} userLocation={userLocation} />
            <PathAnalysis trace={trace} userLocation={userLocation} />
          </>
        )}

        {/* History (below current trace when done) */}
        {isDone && history.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                  <History className="h-4 w-4 text-cyan-400" />
                  Recent traces
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearHistory}
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-rose-300"
                >
                  <Trash2 className="mr-1 h-2.5 w-2.5" />
                  Clear
                </Button>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {history.map((item, idx) => (
                  <HistoryItem key={`${item.target}-${item.startedAt}-${idx}`} trace={item} onClick={() => onReplayHistory(idx)} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  )
}
