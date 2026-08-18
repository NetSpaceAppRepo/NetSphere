/**
 * Shared types between client and trace-service.
 * Netsphere - Network Traceroute Visualization Tool
 */

/** Geographic location information for an IP address */
export interface GeoInfo {
  /** IPv4 or IPv6 address */
  ip: string
  /** Latitude in decimal degrees (-90 to 90) */
  lat: number
  /** Longitude in decimal degrees (-180 to 180) */
  lng: number
  /** City name */
  city?: string
  /** Region/state/province name */
  region?: string
  /** Country name */
  country?: string
  /** ISO 3166-1 alpha-2 country code */
  countryCode?: string
  /** Organization name (ISP, company, etc.) */
  org?: string
  /** Autonomous System Number (e.g., "AS15169") */
  asn?: string
  /** Internet Service Provider name */
  isp?: string
  /** IANA timezone database name (e.g., "America/New_York") */
  timezone?: string
}

/** A single hop in a traceroute path */
export interface Hop {
  /** Hop index (1-based, starting from the first router after origin) */
  index: number
  /** IP address of the hop, or '*' if timeout/unreachable */
  ip: string | '*'
  /** Reverse DNS hostname if available */
  hostname?: string
  /** Round-trip time in milliseconds */
  rtt?: number
  /** Geographic location data */
  geo?: GeoInfo
  /** BGP routing information */
  bgp?: {
    /** Autonomous System Number */
    asn?: string
    /** ASN organization name */
    asnName?: string
    /** ASN country code */
    asnCountry?: string
    /** IP prefix/route */
    prefix?: string
  }
}

/** SSL/TLS certificate information */
export interface SslInfo {
  /** TLS protocol version (e.g., "TLSv1.3") */
  protocol: string
  /** Cipher suite name (e.g., "TLS_AES_256_GCM_SHA384") */
  cipher: string
  /** Certificate subject common name (CN) */
  subjectCn?: string
  /** Certificate issuer common name (CN) */
  issuerCn?: string
  /** Certificate validity start date (ISO 8601) */
  validFrom?: string
  /** Certificate validity end date (ISO 8601) */
  validTo?: string
}

/** Content Delivery Network detection result */
export interface CdnInfo {
  /** CDN provider name (e.g., "Cloudflare", "Akamai") */
  name: string
  /** Whether CDN was detected */
  detected: boolean
  /** HTTP header that revealed the CDN */
  header?: string
}

/** Current state of a trace operation */
export type TraceStatus =
  | 'idle'       // No trace in progress
  | 'resolving'  // DNS resolution in progress
  | 'dns'        // Querying multiple DNS resolvers
  | 'ssl'        // Performing TLS handshake
  | 'traceroute' // Running actual traceroute
  | 'done'       // Trace completed successfully
  | 'error'      // Trace failed with error

/** Complete result of a network trace operation */
export interface TraceResult {
  /** Original target (hostname or IP) being traced */
  target: string
  /** Resolved IP address from DNS lookup */
  resolvedIp?: string
  /** DNS servers used for resolution */
  dnsServers: string[]
  /** DNS records found during resolution */
  dnsRecords?: {
    /** IPv4 addresses (A records) */
    a: string[]
    /** IPv6 addresses (AAAA records) */
    aaaa: string[]
    /** Mail exchange records with priority */
    mx: { priority: number; exchange: string }[]
    /** Text records (TXT) */
    txt: string[]
    /** Name server records (NS) */
    ns: string[]
    /** Canonical name records (CNAME) */
    cname: string[]
    /** Start of Authority record */
    soa?: { mname: string; rname: string }
  }
  /** SSL/TLS certificate information if HTTPS */
  ssl?: SslInfo
  /** CDN detection result */
  cdn?: CdnInfo
  /** List of hops from traceroute */
  hops: Hop[]
  /** Final ping time to destination in ms */
  finalPing?: number
  /** Geographic location of the target server */
  serverLocation?: GeoInfo
  /** Security-related findings */
  security?: {
    /** HSTS header present */
    hsts?: boolean
    /** HSTS max-age value in seconds */
    hstsMaxAge?: number
    /** HTTP/2 support detected */
    http2?: boolean
    /** HTTP/3 (QUIC) support detected */
    http3?: boolean
    /** IPv6 connectivity available */
    ipv6?: boolean
    /** IPv6 address if available */
    ipv6Address?: string
    /** Open ports discovered via port scan */
    openPorts?: { port: number; service: string; open: boolean }[]
  }
  /** Current status of the trace */
  status: TraceStatus
  /** Error message if status is 'error' */
  error?: string
  /** Unix timestamp when trace started (ms) */
  startedAt: number
  /** Unix timestamp when trace completed (ms) */
  finishedAt?: number
}

/** Default user origin location. Will be replaced at runtime with the browser's real geolocation
 * (if the user grants permission). Falls back to IP-based lookup if geolocation is denied. */
export const DEFAULT_USER_ORIGIN: GeoInfo = {
  ip: '0.0.0.0',
  lat: 40.7128, // New York City
  lng: -74.006,
  city: 'Locating…',
  country: '',
  org: 'You',
  isp: 'You',
}

/**
 * Convert latitude/longitude to a 3D vector on a sphere of given radius.
 * Uses spherical coordinate conversion with standard geographic conventions.
 * @param lat - Latitude in decimal degrees (-90 to 90)
 * @param lng - Longitude in decimal degrees (-180 to 180)
 * @param radius - Radius of the sphere
 * @returns 3D vector [x, y, z] in Cartesian coordinates
 */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return [x, y, z]
}

/**
 * Generate a color for a hop based on its position in the route path.
 * Creates a smooth gradient from cyan → violet → amber along the route.
 * @param index - Zero-based hop index
 * @param total - Total number of hops in the path
 * @returns RGB color string (e.g., "rgb(34, 211, 238)")
 */
export function hopColor(index: number, total: number): string {
  const t = total > 1 ? index / (total - 1) : 0
  if (t < 0.5) {
    // Cyan to violet gradient
    const k = t * 2
    const r = Math.round(0x22 + (0xa7 - 0x22) * k)
    const g = Math.round(0xd3 + (0x8b - 0xd3) * k)
    const b = Math.round(0xee + (0xfa - 0xee) * k)
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Violet to amber gradient
    const k = (t - 0.5) * 2
    const r = Math.round(0xa7 + (0xf5 - 0xa7) * k)
    const g = Math.round(0x8b + (0x9e - 0x8b) * k)
    const b = Math.round(0xfa + (0x0b - 0xfa) * k)
    return `rgb(${r}, ${g}, ${b})`
  }
}

/**
 * Calculate the great-circle distance between two points on Earth using the Haversine formula.
 * This gives the shortest distance over the Earth's surface (as the crow flies).
 * @param lat1 - Latitude of point 1 in decimal degrees
 * @param lng1 - Longitude of point 1 in decimal degrees
 * @param lat2 - Latitude of point 2 in decimal degrees
 * @param lng2 - Longitude of point 2 in decimal degrees
 * @returns Distance in kilometers
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371 // Earth radius in km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Format a distance value in kilometers as a human-readable string.
 * Automatically chooses appropriate units (meters, kilometers, or thousands of km).
 * @param km - Distance in kilometers
 * @returns Formatted string with unit (e.g., "500 m", "1,234 km", "12.5k km")
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10000) return `${Math.round(km).toLocaleString()} km`
  return `${(km / 1000).toFixed(1)}k km`
}

/**
 * Compute the total geographic distance traveled by a network trace path.
 * Sums the great-circle distance between consecutive geo-located hops.
 * Skips private/LAN hops and hops without geolocation data.
 * @param userLocation - Starting point (user's location)
 * @param hops - Array of hops from the traceroute
 * @returns Total path distance in kilometers
 */
export function totalPathDistance(
  userLocation: GeoInfo,
  hops: Hop[],
): number {
  const geoPoints: { lat: number; lng: number }[] = [
    { lat: userLocation.lat, lng: userLocation.lng },
  ]
  for (const hop of hops) {
    if (!hop.geo) continue
    if (hop.geo.country === 'LAN') continue
    if (hop.geo.lat === 0 && hop.geo.lng === 0) continue
    geoPoints.push({ lat: hop.geo.lat, lng: hop.geo.lng })
  }
  let total = 0
  for (let i = 1; i < geoPoints.length; i++) {
    total += haversineKm(
      geoPoints[i - 1].lat,
      geoPoints[i - 1].lng,
      geoPoints[i].lat,
      geoPoints[i].lng,
    )
  }
  return total
}

/**
 * Check if an IP address is in a private/reserved range.
 * Private ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x
 * @param ip - IPv4 address string
 * @returns True if the IP is in a private range
 */
export function isPrivateIP(ip: string): boolean {
  if (ip === '*' || ip === '0.0.0.0') return false
  
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return false
  }
  
  const [a, b] = parts
  
  // 10.0.0.0/8
  if (a === 10) return true
  
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true
  
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true
  
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true
  
  return false
}

/**
 * Estimate network latency tier based on round-trip time.
 * Useful for quick visual assessment of connection quality.
 * @param rtt - Round-trip time in milliseconds
 * @returns Latency tier classification
 */
export function getLatencyTier(rtt: number | undefined): string {
  if (rtt === undefined) return 'unknown'
  if (rtt < 10) return 'excellent'     // < 10ms (local/LAN)
  if (rtt < 30) return 'very-good'     // 10-30ms (regional)
  if (rtt < 60) return 'good'          // 30-60ms (national)
  if (rtt < 100) return 'fair'         // 60-100ms (continental)
  if (rtt < 200) return 'poor'         // 100-200ms (intercontinental)
  return 'very-poor'                   // > 200ms (satellite/congested)
}
