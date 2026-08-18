'use client'

import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Lock,
  Globe2,
  Network,
  Server,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TraceResult } from '@/lib/netsphere/types'

function SecurityRow({
  icon,
  label,
  value,
  positive,
}: {
  icon: React.ReactNode
  label: string
  value: string
  positive: boolean
}) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className={cn('shrink-0', positive ? 'text-emerald-400' : 'text-rose-400')}>
        {positive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      </span>
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-xs text-foreground/80">{label}</span>
      <span className={cn('font-mono text-xs font-medium', positive ? 'text-emerald-300' : 'text-rose-300')}>
        {value}
      </span>
    </div>
  )
}

export function SecurityPanel({ trace }: { trace: TraceResult }) {
  const sec = trace.security
  if (!sec) return null

  // Calculate security grade
  let grade = 0
  let total = 0
  const checks: { label: string; pass: boolean }[] = []

  if (trace.ssl) {
    total++
    const modern = trace.ssl.protocol === 'TLSv1.3' || trace.ssl.protocol === 'TLSv1.2'
    checks.push({ label: 'Modern TLS', pass: modern })
    if (modern) grade++
  }
  if (sec.hsts !== undefined) {
    total++
    checks.push({ label: 'HSTS', pass: sec.hsts })
    if (sec.hsts) grade++
  }
  if (sec.http2 !== undefined) {
    total++
    checks.push({ label: 'HTTP/2', pass: sec.http2 })
    if (sec.http2) grade++
  }
  if (sec.ipv6 !== undefined) {
    total++
    checks.push({ label: 'IPv6', pass: sec.ipv6 })
    if (sec.ipv6) grade++
  }

  const gradePct = total > 0 ? (grade / total) * 100 : 0
  const gradeLetter = gradePct >= 100 ? 'A+' : gradePct >= 75 ? 'A' : gradePct >= 50 ? 'B' : gradePct >= 25 ? 'C' : 'D'
  const gradeColor = gradePct >= 75 ? 'text-emerald-400' : gradePct >= 50 ? 'text-amber-400' : 'text-rose-400'

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Security Analysis
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Grade</span>
          <span className={cn('font-mono text-lg font-bold', gradeColor)}>{gradeLetter}</span>
        </div>
      </div>

      <div className="space-y-0.5">
        {/* TLS */}
        {trace.ssl && (
          <SecurityRow
            icon={<Lock className="h-3 w-3 text-muted-foreground" />}
            label="TLS Version"
            value={trace.ssl.protocol}
            positive={trace.ssl.protocol === 'TLSv1.3' || trace.ssl.protocol === 'TLSv1.2'}
          />
        )}

        {/* HSTS */}
        {sec.hsts !== undefined && (
          <SecurityRow
            icon={<ShieldCheck className="h-3 w-3 text-muted-foreground" />}
            label="HSTS"
            value={sec.hsts ? (sec.hstsMaxAge ? `${Math.round(sec.hstsMaxAge / 86400)}d` : 'Enabled') : 'Disabled'}
            positive={sec.hsts}
          />
        )}

        {/* HTTP/2 */}
        {sec.http2 !== undefined && (
          <SecurityRow
            icon={<Zap className="h-3 w-3 text-muted-foreground" />}
            label="HTTP/2"
            value={sec.http2 ? 'Supported' : 'Not supported'}
            positive={sec.http2}
          />
        )}

        {/* IPv6 */}
        {sec.ipv6 !== undefined && (
          <SecurityRow
            icon={<Globe2 className="h-3 w-3 text-muted-foreground" />}
            label="IPv6"
            value={sec.ipv6 ? 'Available' : 'Unavailable'}
            positive={sec.ipv6}
          />
        )}
      </div>

      {/* Open ports */}
      {sec.openPorts && sec.openPorts.length > 0 && (
        <div className="border-t border-border/30 pt-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Server className="h-3 w-3" />
            Port Scan
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {sec.openPorts.map((p) => (
              <div
                key={p.port}
                className={cn(
                  'rounded border px-1.5 py-1 text-center',
                  p.open
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-border/30 bg-card/20 opacity-50',
                )}
                title={`${p.service} (port ${p.port})`}
              >
                <p className="font-mono text-[10px] font-bold text-foreground">{p.port}</p>
                <p className="text-[8px] text-muted-foreground">{p.service}</p>
                <p className={cn('text-[8px]', p.open ? 'text-emerald-400' : 'text-muted-foreground')}>
                  {p.open ? 'OPEN' : 'closed'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hosting summary */}
      {trace.serverLocation && trace.cdn && (
        <div className="border-t border-border/30 pt-2 text-[10px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1">
              <Network className="h-2.5 w-2.5" />
              CDN: <span className="font-mono text-cyan-300">{trace.cdn.name}</span>
            </span>
            <span className="flex items-center gap-1">
              <Server className="h-2.5 w-2.5" />
              Host: <span className="font-mono text-cyan-300">{trace.serverLocation.isp ?? 'Unknown'}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
