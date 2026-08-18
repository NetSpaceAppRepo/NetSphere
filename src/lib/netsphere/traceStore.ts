/**
 * Netsphere Trace Store - Zustand state management for network traceroute visualization
 * Handles WebSocket connection to trace service, user location, trace history, and real-time updates
 */

'use client'

import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'
import type { GeoInfo, Hop, TraceResult, TraceStatus } from './types'
import { DEFAULT_USER_ORIGIN } from './types'

/** Port number for the trace-service WebSocket server */
const TRACE_PORT = 3003

/** localStorage key for persisting trace history */
const HISTORY_STORAGE_KEY = 'netsphere-history-v1'

/** Maximum number of traces to keep in history */
const MAX_HISTORY = 20

/**
 * Detect sandbox mode: in the sandbox environment, the page is served through Caddy on
 * port 81 with XTransformPort header-based routing instead of direct localhost access.
 * @returns True if running in sandbox mode
 */
function isSandboxMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.port === '81'
}

/**
 * Create a Socket.IO connection to the trace service.
 * Configures appropriate connection settings based on environment (sandbox vs local).
 * @returns Configured Socket.IO client instance
 */
function createSocket(): Socket {
  const commonOptions = {
    path: '/socket.io' as const,
    transports: ['polling', 'websocket'] as const,
    upgrade: true,
    rememberUpgrade: true,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    timeout: 30000,
  }

  if (isSandboxMode()) {
    // Sandbox mode: use header-based routing through Caddy proxy
    return io(`/?XTransformPort=${TRACE_PORT}`, commonOptions)
  }
  // Local development: direct connection to trace service
  return io(`http://localhost:${TRACE_PORT}`, commonOptions)
}

/**
 * Load trace history from browser localStorage.
 * Returns empty array if localStorage is unavailable or contains invalid data.
 * @returns Array of previously saved trace results (max MAX_HISTORY items)
 */
function loadHistory(): TraceResult[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_HISTORY)
  } catch {
    // localStorage might be unavailable (private browsing, quota exceeded, etc.)
    return []
  }
}

/**
 * Save trace history to browser localStorage.
 * Silently fails if localStorage is unavailable or full.
 * @param history - Array of trace results to persist
 */
function saveHistory(history: TraceResult[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  } catch {
    /* localStorage might be full or disabled - silently ignore */
  }
}

/**
 * TraceState interface - defines the complete state shape for the Netsphere trace store.
 * Includes connection state, user location, current trace data, history, and action methods.
 */
interface TraceState {
  // ==================== Connection State ====================
  /** Socket.IO connection to trace service */
  socket: Socket | null
  /** Whether WebSocket is currently connected */
  connected: boolean
  /** Error message if connection failed */
  connectionError: string | null

  // ==================== User Location ====================
  /** Current user's geographic location (real or default) */
  userLocation: GeoInfo
  /** Status of geolocation permission request */
  userLocationStatus: 'idle' | 'requesting' | 'granted' | 'denied' | 'fallback'
  /** Request browser geolocation permission */
  requestUserLocation: () => void

  // ==================== Current Trace ====================
  /** Active trace result being updated in real-time */
  trace: TraceResult | null
  /** Whether a trace is currently in progress */
  isTracing: boolean
  /** Last error message from trace service */
  lastError: string | null

  // ==================== Focus Target ====================
  /** Target location for camera focus (when user clicks a hop) */
  focusTarget: GeoInfo | null
  /** Set the focus target for camera animation */
  setFocusTarget: (geo: GeoInfo | null) => void

  // ==================== History ====================
  /** Array of previously completed traces (from localStorage) */
  history: TraceResult[]
  /** Clear all saved trace history */
  clearHistory: () => void
  /** Replay a trace from history by index */
  replayFromHistory: (index: number) => void
  /** Export a trace as JSON file download */
  exportTrace: (trace: TraceResult) => void

  // ==================== Status Display ====================
  /** Human-readable status message for UI display */
  statusMessage: string

  // ==================== Actions ====================
  /** Initialize WebSocket connection to trace service */
  initSocket: () => void
  /** Disconnect from trace service */
  disconnect: () => void
  /** Start a new traceroute to the specified target */
  startTrace: (target: string) => void
  /** Reset current trace state to idle */
  reset: () => void
}

/**
 * Create an empty trace result object for initializing a new trace.
 * @param target - The hostname or IP address being traced
 * @returns Initial TraceResult with default values
 */
function emptyTrace(target: string): TraceResult {
  return {
    target,
    dnsServers: [],
    hops: [],
    status: 'resolving',
    startedAt: Date.now(),
  }
}

/**
 * Human-readable status messages for each trace state.
 * Displayed in the UI to inform users about current operation.
 */
const STATUS_MESSAGES: Record<TraceStatus, string> = {
  idle: 'Idle',
  resolving: 'Resolving DNS…',
  dns: 'Querying DNS resolvers…',
  ssl: 'Performing TLS handshake…',
  traceroute: 'Running real traceroute…',
  done: 'Trace complete',
  error: 'Trace failed',
}

/**
 * Get the appropriate geolocation API endpoint based on environment.
 * In sandbox mode, uses header-based routing; otherwise direct localhost access.
 * @returns URL string for geolocation endpoint
 */
function getGeoEndpoint(): string {
  if (typeof window === 'undefined') return ''
  if (window.location.port === '81') {
    // Sandbox: route through Caddy with XTransformPort header
    return `/geo?XTransformPort=${TRACE_PORT}`
  }
  // Local development: direct connection
  return `http://localhost:${TRACE_PORT}/geo`
}

/**
 * Fetch IP-based geolocation data from the trace service.
 * Used as fallback when browser geolocation is denied or unavailable.
 * @returns Geolocation info or null if request fails
 */
async function fetchIpGeolocation(): Promise<GeoInfo | null> {
  try {
    const res = await fetch(getGeoEndpoint())
    if (!res.ok) return null
    const json = await res.json()
    if (json.error) return null
    return json as GeoInfo
  } catch {
    // Network error or service unavailable
    return null
  }
}

export const useTraceStore = create<TraceState>((set, get) => ({
  socket: null,
  connected: false,
  connectionError: null,

  userLocation: DEFAULT_USER_ORIGIN,
  userLocationStatus: 'idle',

  trace: null,
  isTracing: false,
  lastError: null,

  focusTarget: null,
  setFocusTarget: (geo) => set({ focusTarget: geo }),

  // Always start with empty history to match server-rendered HTML.
  // localStorage is loaded in initSocket() (runs in useEffect, client-only).
  history: [],
  clearHistory: () => {
    saveHistory([])
    set({ history: [] })
  },
  replayFromHistory: (index) => {
    const item = get().history[index]
    if (!item) return
    set({ trace: item, isTracing: false, statusMessage: 'Replaying from history' })
  },
  exportTrace: (trace) => {
    if (typeof window === 'undefined') return
    const blob = new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `netsphere-${trace.target}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  statusMessage: 'Idle',

  requestUserLocation: () => {
    if (get().userLocationStatus === 'requesting' || get().userLocationStatus === 'granted') return
    if (typeof window === 'undefined' || !navigator.geolocation) {
      set({ userLocationStatus: 'fallback' })
      fetchIpGeolocation().then((geo) => {
        if (geo) {
          set({ userLocation: geo, userLocationStatus: 'granted' })
        } else {
          set({ userLocationStatus: 'denied' })
        }
      })
      return
    }

    set({ userLocationStatus: 'requesting' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLocation: GeoInfo = {
          ...get().userLocation,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          city: 'Your location',
        }
        set({ userLocation: newLocation, userLocationStatus: 'granted' })
        fetchIpGeolocation().then((geo) => {
          if (geo) {
            set({
              userLocation: {
                ...geo,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                city: geo.city || 'Your location',
              },
            })
          }
        })
      },
      () => {
        set({ userLocationStatus: 'fallback' })
        fetchIpGeolocation().then((geo) => {
          if (geo) {
            set({ userLocation: geo, userLocationStatus: 'granted' })
          } else {
            set({ userLocationStatus: 'denied' })
          }
        })
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    )
  },

  initSocket: () => {
    if (get().socket) return

    // Load trace history from localStorage (client-only, runs in useEffect
    // after hydration — prevents SSR hydration mismatch).
    if (typeof window !== 'undefined') {
      const stored = loadHistory()
      if (stored.length > 0) {
        set({ history: stored })
      }
    }

    const sock = createSocket()

    sock.on('connect', () => {
      set({ connected: true, connectionError: null })
    })
    sock.on('disconnect', () => {
      set({ connected: false })
    })
    sock.on('connect_error', (err: Error) => {
      set({
        connected: false,
        connectionError: `Cannot reach trace-service on port ${TRACE_PORT}. Make sure it's running. (${err.message})`,
      })
    })

    sock.on('trace:update', (trace: TraceResult) => {
      const wasTracing = get().isTracing
      const isNowDone = trace.status === 'done'
      set({
        trace,
        isTracing: trace.status !== 'done' && trace.status !== 'error',
        statusMessage: STATUS_MESSAGES[trace.status] ?? 'Working…',
        lastError: trace.error ?? null,
      })
      // When a trace completes, push it to history (only once)
      if (wasTracing && isNowDone && trace.hops.length > 0) {
        const newHistory = [trace, ...get().history].slice(0, MAX_HISTORY)
        set({ history: newHistory })
        saveHistory(newHistory)
      }
    })

    sock.on('trace:hop', () => {
      // Hop is already in trace.hops from trace:update
    })

    sock.on('trace:error', (data: { error: string }) => {
      set({
        lastError: data.error,
        isTracing: false,
        statusMessage: 'Trace failed',
        trace: get().trace
          ? { ...get().trace!, status: 'error', error: data.error, finishedAt: Date.now() }
          : null,
      })
    })

    set({ socket: sock })
  },

  disconnect: () => {
    const sock = get().socket
    if (sock) {
      sock.disconnect()
      set({ socket: null, connected: false })
    }
  },

  startTrace: (target) => {
    const sock = get().socket
    if (!sock || !get().connected) {
      set({ lastError: 'Not connected to trace service. Is the trace-service window running?' })
      return
    }
    const cleanTarget = target.trim()
    if (!cleanTarget) return

    set({
      trace: emptyTrace(cleanTarget),
      isTracing: true,
      lastError: null,
      statusMessage: 'Resolving DNS…',
      focusTarget: null,
    })

    sock.emit('trace', { target: cleanTarget })
  },

  reset: () => {
    set({
      trace: null,
      isTracing: false,
      lastError: null,
      statusMessage: 'Idle',
      focusTarget: null,
    })
  },
}))
