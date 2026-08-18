'use client'

import {
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TraceResult } from '@/lib/netsphere/types'

interface TimeMachineEntry {
  trace: TraceResult
  date: Date
  rtt: number | undefined
  hops: number
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function TimeMachinePanel({
  currentTrace,
  history,
}: {
  currentTrace: TraceResult
  history: TraceResult[]
}) {
  // Find all traces to the same target (including current)
  const sameTargetTraces = history.filter(
    (t) => t.target === currentTrace.target && t.status === 'done' && t.finalPing !== undefined,
  )

  // Include current trace if it's done
  const allTraces: TraceResult[] = []
  if (currentTrace.status === 'done' && currentTrace.finalPing !== undefined) {
    allTraces.push(currentTrace)
  }
  allTraces.push(...sameTargetTraces)

  // Deduplicate by startedAt timestamp
  const seen = new Set<number>()
  const unique = allTraces.filter((t) => {
    if (seen.has(t.startedAt)) return false
    seen.add(t.startedAt)
    return true
  })

  // Sort by time (oldest first)
  unique.sort((a, b) => a.startedAt - b.startedAt)

  if (unique.length < 2) return null

  const entries: TimeMachineEntry[] = unique.map((t) => ({
    trace: t,
    date: new Date(t.startedAt),
    rtt: t.finalPing,
    hops: t.hops.length,
  }))

  // Calculate trend
  const latest = entries[entries.length - 1]
  const previous = entries[entries.length - 2]
  const rttDiff = (latest.rtt ?? 0) - (previous.rtt ?? 0)
  const rttPctChange = previous.rtt ? (rttDiff / previous.rtt) * 100 : 0
  const improved = rttDiff < 0
  const same = Math.abs(rttDiff) < 2

  // Find min/max/avg RTT
  const rtts = entries.map((e) => e.rtt).filter((r): r is number => r !== undefined)
  const minRtt = Math.min(...rtts)
  const maxRtt = Math.max(...rtts)
  const avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length

  // Build a simple sparkline using RTT values
  const maxBarHeight = 40
  const rttRange = maxRtt - minRtt || 1

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
          <Calendar className="h-4 w-4 text-purple-400" />
          Time Machine
          <span className="text-[10px] font-normal text-muted-foreground">
            {entries.length} trace{entries.length === 1 ? '' : 's'} to {currentTrace.target}
          </span>
        </div>
      </div>

      {/* Trend summary */}
      <div className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        same
          ? 'border-border/30 bg-card/20 text-muted-foreground'
          : improved
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
            : 'border-rose-500/30 bg-rose-500/5 text-rose-300',
      )}>
        {same ? (
          <Minus className="h-3.5 w-3.5" />
        ) : improved ? (
          <TrendingDown className="h-3.5 w-3.5" />
        ) : (
          <TrendingUp className="h-3.5 w-3.5" />
        )}
        <span>
          {same
            ? `Latency stable at ${latest.rtt} ms`
            : improved
              ? `Network improved ${Math.abs(rttPctChange).toFixed(0)}% (${previous.rtt}→${latest.rtt} ms)`
              : `Latency increased ${rttPctChange.toFixed(0)}% (${previous.rtt}→${latest.rtt} ms)`}
        </span>
      </div>

      {/* RTT sparkline */}
      <div className="flex items-end gap-1 px-1" style={{ height: `${maxBarHeight + 20}px` }}>
        {entries.map((entry, idx) => {
          const rtt = entry.rtt
          if (rtt === undefined) return null
          const height = ((rtt - minRtt) / rttRange) * maxBarHeight + 8
          const isLatest = idx === entries.length - 1
          return (
            <div key={`tm-${entry.trace.startedAt}`} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-mono text-[8px] text-muted-foreground">{rtt}ms</span>
              <div
                className={cn(
                  'w-full rounded-t transition-all',
                  isLatest ? 'bg-cyan-400' : 'bg-cyan-500/40',
                )}
                style={{ height: `${height}px` }}
                title={`${formatRelativeTime(entry.trace.startedAt)}: ${rtt} ms`}
              />
              <span className="text-[7px] text-muted-foreground/60">
                {formatRelativeTime(entry.trace.startedAt)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 border-t border-border/30 pt-2">
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Best</p>
          <p className="font-mono text-xs text-emerald-300">{minRtt} ms</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Average</p>
          <p className="font-mono text-xs text-cyan-300">{avgRtt.toFixed(0)} ms</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Worst</p>
          <p className="font-mono text-xs text-amber-300">{maxRtt} ms</p>
        </div>
      </div>
    </div>
  )
}
