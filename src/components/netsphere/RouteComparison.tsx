'use client'

import {
  GitCompare,
  Plus,
  Minus,
  ArrowRight,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus as MinusIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Hop, TraceResult } from '@/lib/netsphere/types'

interface HopDiff {
  index: number
  currentIp?: string
  previousIp?: string
  currentRtt?: number
  previousRtt?: number
  currentCity?: string
  previousCity?: string
  status: 'same' | 'new' | 'removed' | 'changed'
}

function diffTraces(current: TraceResult, previous: TraceResult): HopDiff[] {
  const diffs: HopDiff[] = []
  const maxHops = Math.max(current.hops.length, previous.hops.length)

  for (let i = 0; i < maxHops; i++) {
    const curr = current.hops[i]
    const prev = previous.hops[i]

    if (curr && prev) {
      if (curr.ip === prev.ip) {
        diffs.push({
          index: i + 1,
          currentIp: curr.ip,
          previousIp: prev.ip,
          currentRtt: curr.rtt,
          previousRtt: prev.rtt,
          currentCity: curr.geo?.city,
          previousCity: prev.geo?.city,
          status: 'same',
        })
      } else {
        diffs.push({
          index: i + 1,
          currentIp: curr.ip,
          previousIp: prev.ip,
          currentRtt: curr.rtt,
          previousRtt: prev.rtt,
          currentCity: curr.geo?.city,
          previousCity: prev.geo?.city,
          status: 'changed',
        })
      }
    } else if (curr && !prev) {
      diffs.push({
        index: i + 1,
        currentIp: curr.ip,
        currentRtt: curr.rtt,
        currentCity: curr.geo?.city,
        status: 'new',
      })
    } else if (!curr && prev) {
      diffs.push({
        index: i + 1,
        previousIp: prev.ip,
        previousRtt: prev.rtt,
        previousCity: prev.geo?.city,
        status: 'removed',
      })
    }
  }

  return diffs
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function RouteComparison({
  currentTrace,
  history,
}: {
  currentTrace: TraceResult
  history: TraceResult[]
}) {
  // Find the most recent previous trace to the same target
  const previousTraces = history.filter(
    (t) =>
      t.target === currentTrace.target &&
      t.status === 'done' &&
      t.startedAt < currentTrace.startedAt,
  )

  if (previousTraces.length === 0) return null

  // Get the most recent previous trace
  const previous = previousTraces[0]
  const diffs = diffTraces(currentTrace, previous)

  const newHops = diffs.filter((d) => d.status === 'new').length
  const removedHops = diffs.filter((d) => d.status === 'removed').length
  const changedHops = diffs.filter((d) => d.status === 'changed').length
  const sameHops = diffs.filter((d) => d.status === 'same').length

  // RTT comparison
  const currRtt = currentTrace.finalPing
  const prevRtt = previous.finalPing
  const rttDiff = currRtt !== undefined && prevRtt !== undefined ? currRtt - prevRtt : undefined
  const rttPctChange = rttDiff !== undefined && prevRtt ? (rttDiff / prevRtt) * 100 : undefined

  const improved = rttDiff !== undefined && rttDiff < -2
  const worse = rttDiff !== undefined && rttDiff > 2
  const stable = rttDiff !== undefined && Math.abs(rttDiff) <= 2

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <GitCompare className="h-4 w-4 text-purple-400" />
        Route Comparison
        <span className="text-[10px] font-normal text-muted-foreground">
          vs {formatRelativeTime(previous.startedAt)}
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-1 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Same</p>
          <p className="font-mono text-sm text-emerald-300">{sameHops}</p>
        </div>
        <div className="rounded border border-cyan-500/20 bg-cyan-500/5 px-1.5 py-1 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">New</p>
          <p className="font-mono text-sm text-cyan-300">{newHops}</p>
        </div>
        <div className="rounded border border-rose-500/20 bg-rose-500/5 px-1.5 py-1 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Removed</p>
          <p className="font-mono text-sm text-rose-300">{removedHops}</p>
        </div>
        <div className="rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-1 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Changed</p>
          <p className="font-mono text-sm text-amber-300">{changedHops}</p>
        </div>
      </div>

      {/* RTT change */}
      {rttDiff !== undefined && (
        <div className={cn(
          'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
          stable
            ? 'border-border/30 bg-card/20 text-muted-foreground'
            : improved
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/5 text-rose-300',
        )}>
          {stable ? (
            <MinusIcon className="h-3.5 w-3.5" />
          ) : improved ? (
            <TrendingDown className="h-3.5 w-3.5" />
          ) : (
            <TrendingUp className="h-3.5 w-3.5" />
          )}
          <span>
            Latency {stable ? 'stable' : improved ? 'improved' : 'worsened'}:{' '}
            <span className="font-mono">
              {prevRtt}ms → {currRtt}ms
            </span>
            {rttPctChange !== undefined && !stable && (
              <span className="ml-1">
                ({rttPctChange > 0 ? '+' : ''}{rttPctChange.toFixed(0)}%)
              </span>
            )}
          </span>
        </div>
      )}

      {/* Hop-by-hop diff (only show if there are differences) */}
      {(newHops > 0 || removedHops > 0 || changedHops > 0) && (
        <div className="space-y-1 border-t border-border/30 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Changes
          </p>
          {diffs
            .filter((d) => d.status !== 'same')
            .map((d) => (
              <div
                key={`diff-${d.index}`}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1 text-xs',
                  d.status === 'new' && 'border-cyan-500/20 bg-cyan-500/5',
                  d.status === 'removed' && 'border-rose-500/20 bg-rose-500/5',
                  d.status === 'changed' && 'border-amber-500/20 bg-amber-500/5',
                )}
              >
                <span className="font-mono text-[10px] text-muted-foreground">#{d.index}</span>
                {d.status === 'new' && <Plus className="h-3 w-3 shrink-0 text-cyan-400" />}
                {d.status === 'removed' && <Minus className="h-3 w-3 shrink-0 text-rose-400" />}
                {d.status === 'changed' && <ArrowRight className="h-3 w-3 shrink-0 text-amber-400" />}
                <div className="min-w-0 flex-1">
                  {d.status === 'changed' ? (
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] text-muted-foreground line-through">
                        {d.previousIp}
                      </span>
                      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="font-mono text-[10px] text-amber-300">
                        {d.currentIp}
                      </span>
                    </div>
                  ) : (
                    <span className="font-mono text-[10px]">
                      {d.status === 'removed' ? d.previousIp : d.currentIp}
                    </span>
                  )}
                  {(d.currentCity || d.previousCity) && (
                    <p className="text-[9px] text-muted-foreground">
                      {d.status === 'removed'
                        ? d.previousCity
                        : d.status === 'changed'
                          ? `${d.previousCity} → ${d.currentCity}`
                          : d.currentCity}
                    </p>
                  )}
                </div>
                {d.status !== 'removed' && d.currentRtt !== undefined && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {d.currentRtt.toFixed(0)}ms
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
