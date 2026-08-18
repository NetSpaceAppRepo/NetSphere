import { createServer } from 'http'
import { Server } from 'socket.io'
import net from 'net'
import dns from 'dns'
import tls from 'tls'
import https from 'https'
import http from 'http'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const dnsLookup = promisify(dns.lookup)
const dnsResolve4 = promisify(dns.resolve4)

const httpServer = createServer()
const io = new Server(httpServer, {
  // Use socket.io's default path /socket.io/ so we can use /geo for HTTP.
  // (Previously we used path: '/' which intercepted all requests.)
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ----------------------------- Types -----------------------------
export interface GeoInfo {
  ip: string
  lat: number
  lng: number
  city?: string
  region?: string
  country?: string
  countryCode?: string
  org?: string
  asn?: string
  isp?: string
  timezone?: string
}

export interface Hop {
  index: number
  ip: string | '*'
  hostname?: string
  rtt?: number
  geo?: GeoInfo
  bgp?: {
    asn?: string
    asnName?: string
    asnCountry?: string
    prefix?: string
  }
}

export interface TraceResult {
  target: string
  resolvedIp?: string
  dnsServers: string[]
  dnsRecords?: {
    a: string[]
    aaaa: string[]
    mx: { priority: number; exchange: string }[]
    txt: string[]
    ns: string[]
    cname: string[]
    soa?: { mname: string; rname: string }
  }
  ssl?: {
    protocol: string
    cipher: string
    subjectCn?: string
    issuerCn?: string
    validFrom?: string
    validTo?: string
  }
  cdn?: {
    name: string
    detected: boolean
    header?: string
  }
  hops: Hop[]
  finalPing?: number
  serverLocation?: GeoInfo
  security?: {
    hsts?: boolean
    hstsMaxAge?: number
    http2?: boolean
    http3?: boolean
    ipv6?: boolean
    ipv6Address?: string
    openPorts?: { port: number; service: string; open: boolean }[]
  }
  status: 'resolving' | 'dns' | 'ssl' | 'traceroute' | 'done' | 'error'
  error?: string
  startedAt: number
  finishedAt?: number
}

// ---------------------- IP Geolocation (ip-api.com) ----------------------
// Batch endpoint: up to 100 IPs per request, much faster than one-at-a-time.
const geoCache = new Map<string, GeoInfo | null>()

async function getGeoInfo(ip: string): Promise<GeoInfo | null> {
  if (geoCache.has(ip)) return geoCache.get(ip) ?? null
  if (!ip || ip === '*' || ip === '0.0.0.0') {
    geoCache.set(ip, null)
    return null
  }
  // Private / RFC1918 / loopback / link-local — no geolocation possible.
  if (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('127.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('172.21.') ||
    ip.startsWith('172.22.') ||
    ip.startsWith('172.23.') ||
    ip.startsWith('172.24.') ||
    ip.startsWith('172.25.') ||
    ip.startsWith('172.26.') ||
    ip.startsWith('172.27.') ||
    ip.startsWith('172.28.') ||
    ip.startsWith('172.29.') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.') ||
    ip.startsWith('100.64.') || // CGNAT
    ip.startsWith('fc') ||
    ip.startsWith('fe80')
  ) {
    const info: GeoInfo = {
      ip,
      lat: 0,
      lng: 0,
      city: 'Private network',
      country: 'LAN',
      org: 'Private',
      isp: 'Private',
    }
    geoCache.set(ip, info)
    return info
  }

  return new Promise((resolve) => {
    // ip-api.com's FREE tier requires HTTP (not HTTPS). HTTPS needs a paid key.
    // We use the http module here to avoid the SSL error.
    const req = http.get(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,city,lat,lon,timezone,isp,org,as,query`,
      { timeout: 5000 },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.status === 'success') {
              const info: GeoInfo = {
                ip,
                lat: json.lat,
                lng: json.lon,
                city: json.city,
                region: json.region,
                country: json.country,
                countryCode: json.countryCode,
                org: json.org,
                asn: json.as,
                isp: json.isp,
                timezone: json.timezone,
              }
              geoCache.set(ip, info)
              resolve(info)
            } else {
              geoCache.set(ip, null)
              resolve(null)
            }
          } catch {
            geoCache.set(ip, null)
            resolve(null)
          }
        })
      },
    )
    req.on('error', () => {
      geoCache.set(ip, null)
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      geoCache.set(ip, null)
      resolve(null)
    })
  })
}

// ---------------------- Reverse DNS (hostname from IP) ----------------------
// Uses Google's DNS-over-HTTPS for reliability — works on all platforms.
const reverseDnsCache = new Map<string, string | null>()
async function reverseDnsLookup(ip: string): Promise<string | null> {
  if (reverseDnsCache.has(ip)) return reverseDnsCache.get(ip) ?? null
  if (!ip || ip === '*') return null

  return new Promise((resolve) => {
    // Google DNS-over-HTTPS: query PTR record for the IP
    // Format: <reversed-ip>.in-addr.arpa for IPv4
    const parts = ip.split('.')
    if (parts.length !== 4) {
      reverseDnsCache.set(ip, null)
      resolve(null)
      return
    }
    const ptr = `${parts[3]}.${parts[2]}.${parts[1]}.${parts[0]}.in-addr.arpa`
    const url = `https://dns.google/resolve?name=${ptr}&type=PTR`

    const req = https.get(url, { timeout: 4000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const answer = json.Answer?.find((a: any) => a.type === 12) // type 12 = PTR
          const hostname = answer?.data?.replace(/\.$/, '') || null
          reverseDnsCache.set(ip, hostname)
          resolve(hostname)
        } catch {
          reverseDnsCache.set(ip, null)
          resolve(null)
        }
      })
    })
    req.on('error', () => {
      reverseDnsCache.set(ip, null)
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      reverseDnsCache.set(ip, null)
      resolve(null)
    })
  })
}

// ---------------------- BGPView API enrichment ----------------------
// Fetches ASN details (name, country, description) from BGPView's free API.
// This gives us richer data than ip-api.com's basic org field.
const bgpCache = new Map<string, { asn?: string; asnName?: string; asnCountry?: string; prefix?: string } | null>()
async function fetchBgpInfo(asnRaw: string): Promise<{ asn?: string; asnName?: string; asnCountry?: string; prefix?: string } | null> {
  if (!asnRaw) return null
  // Extract the ASN number from strings like "AS15169 Google LLC"
  const asnMatch = asnRaw.match(/AS(\d+)/i)
  if (!asnMatch) return null
  const asnNum = asnMatch[1]
  const cacheKey = asnNum
  if (bgpCache.has(cacheKey)) return bgpCache.get(cacheKey) ?? null

  return new Promise((resolve) => {
    const url = `https://api.bgpview.io/asn/${asnNum}`
    const req = https.get(url, { timeout: 5000, headers: { 'User-Agent': 'NetSphere/1.0' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.status !== 'ok') {
            bgpCache.set(cacheKey, null)
            resolve(null)
            return
          }
          const data_ = json.data
          const result = {
            asn: `AS${asnNum}`,
            asnName: data_.name || undefined,
            asnCountry: data_.rir_allocation?.country || undefined,
            prefix: data_.prefixes?.[0]?.prefix || undefined,
          }
          bgpCache.set(cacheKey, result)
          resolve(result)
        } catch {
          bgpCache.set(cacheKey, null)
          resolve(null)
        }
      })
    })
    req.on('error', () => {
      bgpCache.set(cacheKey, null)
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      bgpCache.set(cacheKey, null)
      resolve(null)
    })
  })
}

// ---------------------- DNS Resolution ----------------------
async function resolveDns(target: string): Promise<{ ip?: string; servers: string[] }> {
  const servers: string[] = []
  try {
    servers.push(...dns.getServers().slice(0, 2))
  } catch {
    /* noop */
  }

  const cleanTarget = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  let ip: string | undefined
  try {
    const result = await dnsLookup(cleanTarget, { all: true })
    const v4 = result.find((r) => r.family === 4)
    ip = (v4 ?? result[0])?.address
  } catch {
    try {
      const addrs = await dnsResolve4(cleanTarget)
      ip = addrs[0]
    } catch {
      /* noop */
    }
  }

  return { ip, servers }
}

// ---------------------- SSL Handshake ----------------------
async function getTlsInfo(host: string): Promise<TraceResult['ssl'] | undefined> {
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: cleanHost,
        port: 443,
        servername: cleanHost,
        rejectUnauthorized: false,
      },
      () => {
        const protocol = socket.getProtocol() ?? 'unknown'
        const cipher = socket.getCipher()
        const cert: any = socket.getPeerCertificate()
        socket.end()
        resolve({
          protocol: typeof protocol === 'string' ? protocol : String(protocol),
          cipher: cipher ? `${cipher.name}:${cipher.version}` : 'unknown',
          subjectCn: cert?.subject?.CN,
          issuerCn: cert?.issuer?.CN,
          validFrom: cert?.valid_from,
          validTo: cert?.valid_to,
        })
      },
    )
    socket.setTimeout(5000, () => {
      socket.destroy()
      resolve(undefined)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(undefined)
    })
  })
}

// ---------------------- CDN Detection ----------------------
async function detectCdn(host: string): Promise<{ name: string; detected: boolean; header?: string }> {
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  return new Promise((resolve) => {
    const req = https.get(
      { hostname: cleanHost, port: 443, path: '/', headers: { 'User-Agent': 'NetSphere/1.0' } },
      { timeout: 5000 },
      (res) => {
        const headers = res.headers as Record<string, string | string[] | undefined>
        const server = (headers.server as string | undefined)?.toLowerCase() ?? ''
        const cf = headers['cf-ray'] as string | undefined
        const akamai = headers['x-akamai-transformed'] as string | undefined
        const fastly = headers['x-served-by'] as string | undefined

        if (cf) resolve({ name: 'Cloudflare', detected: true, header: 'cf-ray: ' + cf })
        else if (akamai) resolve({ name: 'Akamai', detected: true, header: 'x-akamai-transformed' })
        else if (fastly) resolve({ name: 'Fastly', detected: true, header: 'x-served-by' })
        else if (server.includes('cloudflare')) resolve({ name: 'Cloudflare', detected: true, header: 'server: ' + server })
        else if (server.includes('akamai')) resolve({ name: 'Akamai', detected: true, header: 'server: ' + server })
        else if (server.includes('fastly')) resolve({ name: 'Fastly', detected: true, header: 'server: ' + server })
        else if (server.includes('cloudfront')) resolve({ name: 'AWS CloudFront', detected: true, header: 'server: ' + server })
        else if (server.includes('gse') || server.includes('google')) resolve({ name: 'Google CDN', detected: true, header: 'server: ' + server })
        else if (server.includes('nginx')) resolve({ name: 'Direct (nginx)', detected: false, header: 'server: ' + server })
        else if (server.includes('apache')) resolve({ name: 'Direct (Apache)', detected: false, header: 'server: ' + server })
        else resolve({ name: 'Direct / Unknown', detected: false })
      },
    )
    req.on('error', () => resolve({ name: 'Unknown', detected: false }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ name: 'Unknown', detected: false })
    })
  })
}

// ---------------------- DNS Records Explorer ----------------------
// Fetches A, AAAA, MX, TXT, NS, CNAME, SOA records for a domain.
// Uses Node's dns module with Google DoH as a fallback.

async function fetchDnsRecords(target: string): Promise<TraceResult['dnsRecords']> {
  const cleanTarget = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  const records: TraceResult['dnsRecords'] = {
    a: [],
    aaaa: [],
    mx: [],
    txt: [],
    ns: [],
    cname: [],
  }

  const safeResolve = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn()
    } catch {
      return null
    }
  }

  // A records (IPv4)
  const aRecords = await safeResolve(() => dnsResolve4(cleanTarget))
  if (aRecords) records.a = aRecords

  // AAAA records (IPv6)
  const aaaaResolve = promisify(dns.resolve6)
  const aaaaRecords = await safeResolve(() => aaaaResolve(cleanTarget))
  if (aaaaRecords) records.aaaa = aaaaRecords

  // MX records
  const mxResolve = promisify(dns.resolveMx as any)
  const mxRecords = await safeResolve(() => mxResolve(cleanTarget))
  if (mxRecords) {
    records.mx = mxRecords.map((r: any) => ({
      priority: r.priority,
      exchange: r.exchange,
    }))
  }

  // TXT records
  const txtResolve = promisify(dns.resolveTxt as any)
  const txtRecords = await safeResolve(() => txtResolve(cleanTarget))
  if (txtRecords) {
    records.txt = txtRecords.map((r: any) => Array.isArray(r) ? r.join('') : String(r))
  }

  // NS records
  const nsResolve = promisify(dns.resolveNs as any)
  const nsRecords = await safeResolve(() => nsResolve(cleanTarget))
  if (nsRecords) records.ns = nsRecords

  // CNAME records
  const cnameResolve = promisify(dns.resolveCname as any)
  const cnameRecords = await safeResolve(() => cnameResolve(cleanTarget))
  if (cnameRecords) records.cname = cnameRecords

  // SOA records
  const soaResolve = promisify(dns.resolveSoa as any)
  const soaRecord = await safeResolve(() => soaResolve(cleanTarget))
  if (soaRecord) {
    records.soa = {
      mname: soaRecord.nsname,
      rname: soaRecord.hostmaster,
    }
  }

  return records
}

// ---------------------- Security Analysis ----------------------
// Checks HSTS, HTTP/2, IPv6, and scans common ports.

async function checkSecurityHeaders(host: string): Promise<{ hsts: boolean; hstsMaxAge?: number; http2: boolean }> {
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: cleanHost,
      port: 443,
      path: '/',
      method: 'GET',
      headers: { 'User-Agent': 'NetSphere/1.0' },
      timeout: 5000,
      // Request HTTP/2 via ALPN — Node will negotiate if server supports it
      ALPNProtocols: ['h2', 'http/1.1'],
    }
    const req = https.request(options, (res) => {
      const headers = res.headers as Record<string, string | string[] | undefined>
      const hstsHeader = (headers['strict-transport-security'] as string | undefined) ?? ''
      const hsts = hstsHeader.length > 0
      const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/i)
      const hstsMaxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : undefined
      const alpn = (res.socket as any)?.alpnProtocol
      const http2 = alpn === 'h2'
      res.destroy()
      resolve({ hsts, hstsMaxAge, http2 })
    })
    req.on('error', () => resolve({ hsts: false, http2: false }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ hsts: false, http2: false })
    })
    req.end()
  })
}

async function checkIPv6(host: string): Promise<{ ipv6: boolean; ipv6Address?: string }> {
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  try {
    const result = await dnsLookup(cleanHost, { family: 6, all: true })
    if (result && result.length > 0) {
      return { ipv6: true, ipv6Address: result[0].address }
    }
  } catch {
    // No AAAA record
  }
  return { ipv6: false }
}

async function scanPort(host: string, port: number, service: string): Promise<{ port: number; service: string; open: boolean }> {
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(2500)
    socket.once('connect', () => {
      socket.destroy()
      resolve({ port, service, open: true })
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve({ port, service, open: false })
    })
    socket.once('error', () => {
      socket.destroy()
      resolve({ port, service, open: false })
    })
    socket.connect(port, cleanHost)
  })
}

async function runSecurityAnalysis(host: string): Promise<TraceResult['security']> {
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  const [headers, ipv6, ...portResults] = await Promise.all([
    checkSecurityHeaders(cleanHost),
    checkIPv6(cleanHost),
    scanPort(cleanHost, 80, 'HTTP'),
    scanPort(cleanHost, 443, 'HTTPS'),
    scanPort(cleanHost, 22, 'SSH'),
    scanPort(cleanHost, 3389, 'RDP'),
    scanPort(cleanHost, 8080, 'HTTP-Alt'),
  ])
  return {
    hsts: headers.hsts,
    hstsMaxAge: headers.hstsMaxAge,
    http2: headers.http2,
    ipv6: ipv6.ipv6,
    ipv6Address: ipv6.ipv6Address,
    openPorts: portResults,
  }
}

// ---------------------- Traceroute ----------------------
// Parses a single line of traceroute output. Supports both:
//
// Linux traceroute:
//   " 1  192.168.1.1 (192.168.1.1)  1.234 ms  2.123 ms  1.987 ms"
//   " 2  * * *"
//
// Windows tracert:
//   "  1     1 ms     1 ms     1 ms  192.168.1.1"
//   "  2     *        *        *     Request timed out."
//   "  3     5 ms     4 ms     6 ms  10.0.0.1"
//   "  4    12 ms    11 ms    13 ms  some.host.com [203.0.113.5]"
function parseTracerouteLine(line: string): { ip: string; rtt?: number; hostname?: string } | null {
  // Skip empty lines, header lines, and traceroute intro text
  const trimmed = line.trim()
  if (!trimmed) return null
  // Must start with a hop number (1-3 digits)
  const match = line.match(/^\s*(\d+)\s+(.+)$/)
  if (!match) return null

  const rest = match[2].trim()
  if (rest.startsWith('*') || /request timed out/i.test(rest)) return { ip: '*' }

  // Windows format with bracketed IP: "  some.host.com [203.0.113.5]" at the end.
  const bracketIpMatch = rest.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/)
  // Linux format with parentheses: "hostname (ip)"
  const parenIpMatch = rest.match(/\((\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\)/)
  const rttMatch = rest.match(/([\d.]+)\s*ms/)

  if (bracketIpMatch) {
    const beforeBracket = rest.split('[')[0].trim()
    const hostname = beforeBracket && beforeBracket !== bracketIpMatch[1] ? beforeBracket : undefined
    return {
      ip: bracketIpMatch[1],
      hostname: hostname && hostname.length > 0 ? hostname : undefined,
      rtt: rttMatch ? parseFloat(rttMatch[1]) : undefined,
    }
  }

  if (parenIpMatch) {
    const hostMatch = rest.match(/^\S+/)
    return {
      ip: parenIpMatch[1],
      hostname: hostMatch?.[0] !== parenIpMatch[1] ? hostMatch?.[0] : undefined,
      rtt: rttMatch ? parseFloat(rttMatch[1]) : undefined,
    }
  }

  // Plain IP at the start (Linux "-n" mode): "  192.168.1.1  1.234 ms ..."
  const plainIpMatch = rest.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
  if (plainIpMatch) {
    return {
      ip: plainIpMatch[1],
      rtt: rttMatch ? parseFloat(rttMatch[1]) : undefined,
    }
  }

  // Windows without -d, no hostname: "  5 ms  4 ms  6 ms  10.0.0.1"
  // The IP is the LAST thing on the line. We need to be careful not to
  // pick up RTT values (which are numbers followed by "ms") as IPs.
  // Strategy: remove all "Xms" patterns, then look for a trailing IP.
  const withoutRtts = rest.replace(/[\d.]+\s*ms/g, '').trim()
  const trailingIpMatch = withoutRtts.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*$/)
  if (trailingIpMatch) {
    return {
      ip: trailingIpMatch[1],
      rtt: rttMatch ? parseFloat(rttMatch[1]) : undefined,
    }
  }

  return null
}

async function runTraceroute(
  target: string,
  onHop: (hop: Hop) => void,
): Promise<Hop[]> {
  const cleanTarget = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  const hops: Hop[] = []
  const isWin = process.platform === 'win32'

  // Try TCP traceroute first (port 443) — many routers in the Middle East,
  // India, and elsewhere block ICMP but allow TCP SYN to port 443 through.
  // This reveals hops that standard ICMP traceroute can't see.
  //
  // Linux:   traceroute -T -p 443 (requires traceroute 2.x, usually installed)
  // macOS:   Uses a different syntax, but most Macs don't have TCP traceroute
  //          by default — fall back to ICMP
  // Windows: No built-in TCP traceroute — use tracert (ICMP only)

  const cmds: { cmd: string; method: string }[] = []

  if (isWin) {
    // Windows: only ICMP tracert is available
    cmds.push({ cmd: `tracert -d -h 30 -w 2500 ${cleanTarget}`, method: 'ICMP' })
  } else {
    // Linux/macOS: use standard ICMP traceroute (most reliable).
    // TCP traceroute (-T) requires root on many systems and can crash the
    // service, so we skip it. The Path Analysis panel explains why some
    // hops don't respond.
    cmds.push({ cmd: `traceroute -n -w 2 -q 1 -m 30 ${cleanTarget}`, method: 'ICMP' })
  }

  let lastResult: Hop[] = []

  for (const { cmd, method } of cmds) {
    console.log(`[trace-service] Running traceroute (${method}): ${cmd}`)
    try {
      const result = await runSingleTraceroute(cmd, method, onHop)
      if (result.length > lastResult.length) {
        lastResult = result
      }
      const realHops = result.filter((h) => h.ip !== '*')
      if (realHops.length >= 3) {
        console.log(`[trace-service] ${method} traceroute succeeded with ${realHops.length} hops`)
        break
      }
      console.log(`[trace-service] ${method} traceroute only got ${realHops.length} hops, trying next method...`)
    } catch (err) {
      console.error(`[trace-service] ${method} traceroute failed:`, err)
    }
  }

  return lastResult
}

// Run a single traceroute command and collect hops
async function runSingleTraceroute(
  cmd: string,
  method: string,
  onHop: (hop: Hop) => void,
): Promise<Hop[]> {
  const hops: Hop[] = []
  const seenIps = new Set<string>()

  return new Promise((resolve) => {
    const child = exec(cmd, { timeout: 120000, maxBuffer: 1024 * 1024 * 4 })
    let hopIndex = 0

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split(/\r?\n/)
        for (const line of lines) {
          const parsed = parseTracerouteLine(line)
          if (!parsed) continue
          if (parsed.ip === '*') {
            hopIndex++
            const timeoutHop: Hop = { index: hopIndex, ip: '*', rtt: undefined }
            hops.push(timeoutHop)
            onHop(timeoutHop)
            continue
          }

          if (seenIps.has(parsed.ip)) {
            continue
          }
          seenIps.add(parsed.ip)

          hopIndex++
          const hop: Hop = {
            index: hopIndex,
            ip: parsed.ip,
            hostname: parsed.hostname,
            rtt: parsed.rtt,
          }
          hops.push(hop)
          onHop(hop)
          Promise.all([
            getGeoInfo(parsed.ip),
            reverseDnsLookup(parsed.ip),
          ])
            .then(async ([geo, hostname]) => {
              if (geo) {
                hop.geo = geo
                if (!hop.hostname && hostname) hop.hostname = hostname
                onHop(hop)
                if (geo.asn) {
                  const bgp = await fetchBgpInfo(geo.asn)
                  if (bgp) {
                    hop.bgp = bgp
                    onHop(hop)
                  }
                }
              } else if (hostname) {
                hop.hostname = hostname
                onHop(hop)
              }
            })
            .catch(() => {})
        }
      })
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        // Suppress "command not found" errors for TCP traceroute — we have a fallback
        const msg = chunk.toString()
        if (!msg.includes('not found') && !msg.includes('No such file')) {
          console.error(`[trace-service] traceroute stderr: ${msg}`)
        }
      })
    }

    child.on('close', (code) => {
      console.log(`[trace-service] Traceroute (${method}) exited with code ${code}`)
      let cleanedHops = [...hops]
      while (cleanedHops.length > 0 && cleanedHops[cleanedHops.length - 1].ip === '*') {
        cleanedHops.pop()
      }
      cleanedHops = cleanedHops.map((h, idx) => ({ ...h, index: idx + 1 }))
      resolve(cleanedHops)
    })

    child.on('error', (err) => {
      console.error(`[trace-service] Traceroute (${method}) spawn error:`, err.message)
      resolve(hops)
    })
  })
}

// ---------------------- Trace Orchestrator ----------------------
async function runTrace(target: string, socket: any): Promise<void> {
  const cleanTarget = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0].toLowerCase()
  const trace: TraceResult = {
    target: cleanTarget,
    dnsServers: [],
    hops: [],
    status: 'resolving',
    startedAt: Date.now(),
  }

  socket.emit('trace:update', trace)

  // Step 1: DNS
  trace.status = 'dns'
  socket.emit('trace:update', trace)
  try {
    console.log(`[trace-service] Resolving DNS for ${cleanTarget}`)
    const dnsResult = await resolveDns(cleanTarget)
    trace.resolvedIp = dnsResult.ip
    trace.dnsServers = dnsResult.servers
    socket.emit('trace:update', trace)
    if (!trace.resolvedIp) {
      trace.error = `Could not resolve ${cleanTarget} — check the domain or your DNS.`
      trace.status = 'error'
      trace.finishedAt = Date.now()
      socket.emit('trace:update', trace)
      return
    }
    // Fetch full DNS records (A, AAAA, MX, TXT, NS, CNAME, SOA) in parallel
    fetchDnsRecords(cleanTarget).then((records) => {
      trace.dnsRecords = records
      socket.emit('trace:update', trace)
    }).catch(() => {})
  } catch (err) {
    trace.error = `DNS lookup failed: ${(err as Error).message}`
  }

  // Step 2: SSL handshake
  trace.status = 'ssl'
  socket.emit('trace:update', trace)
  try {
    trace.ssl = await getTlsInfo(cleanTarget)
    socket.emit('trace:update', trace)
  } catch {
    /* noop */
  }

  // Step 3: CDN detection
  try {
    trace.cdn = await detectCdn(cleanTarget)
    socket.emit('trace:update', trace)
  } catch {
    /* noop */
  }

  // Step 4: Traceroute (real, always)
  trace.status = 'traceroute'
  socket.emit('trace:update', trace)
  try {
    const hops = await runTraceroute(cleanTarget, (hop) => {
      // Replace existing hop with same index (for geo re-emits), or append.
      const existingIdx = trace.hops.findIndex((h) => h.index === hop.index)
      if (existingIdx >= 0) {
        trace.hops[existingIdx] = hop
      } else {
        trace.hops.push(hop)
      }
      socket.emit('trace:hop', hop)
      socket.emit('trace:update', trace)
    })

    trace.hops = hops

    // CRITICAL: Always geolocate the RESOLVED IP directly.
    // The traceroute's last hop is often a CDN edge (e.g., Cloudflare for
    // Khan Academy), NOT the actual destination server. By geolocating the
    // resolved IP, we show the true destination — even if traceroute didn't
    // reach it or stopped at an intermediate hop.
    //
    // IMPORTANT: Only use the actual resolved IP address — NOT the domain name.
    // If we pass a domain name to ip-api.com, it returns the CDN's anycast
    // location (which could be anywhere), not the actual server.
    const resolvedIp = trace.resolvedIp
    let resolvedGeo: GeoInfo | null = null
    if (resolvedIp && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(resolvedIp)) {
      resolvedGeo = await getGeoInfo(resolvedIp)
    }
    // If we couldn't geolocate the resolved IP, try the last real hop
    if (!resolvedGeo) {
      const lastRealHop = [...hops].reverse().find(
        (h) => h.geo && h.geo.country !== 'LAN' && h.ip !== '*'
      )
      if (lastRealHop?.geo) {
        resolvedGeo = lastRealHop.geo
      }
    }
    if (resolvedGeo) {
      trace.serverLocation = resolvedGeo
      // Use the last hop's RTT if available, otherwise leave undefined
      const lastHop = hops[hops.length - 1]
      trace.finalPing = lastHop?.rtt ? Math.round(lastHop.rtt) : undefined

      // If the resolved IP isn't already in the hops list, add it as a
      // final "destination" hop so it appears on the globe.
      const resolvedIpInHops = hops.some((h) => h.ip === resolvedIp)
      if (!resolvedIpInHops && resolvedIp && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(resolvedIp)) {
        // Check if the last hop is a private/LAN hop or has a different
        // location than the resolved IP. If so, the traceroute didn't
        // reach the actual destination — replace the last hop with the
        // resolved IP as the true destination.
        const lastHopGeo = lastHop?.geo
        const lastHopIsPrivate = lastHopGeo?.country === 'LAN'
        const lastHopDifferentLocation =
          lastHopGeo &&
          resolvedGeo.country &&
          lastHopGeo.country !== resolvedGeo.country &&
          lastHopGeo.country !== 'LAN'

        if (lastHop && (lastHopIsPrivate || lastHopDifferentLocation)) {
          // Replace the last hop with the resolved IP as the destination
          lastHop.ip = resolvedIp
          lastHop.hostname = cleanTarget
          lastHop.geo = resolvedGeo
          lastHop.rtt = lastHop.rtt // keep the RTT
          onHop(lastHop)
        } else {
          // Add the resolved IP as a new final hop
          const destIndex = hops.length + 1
          const destHop: Hop = {
            index: destIndex,
            ip: resolvedIp,
            hostname: cleanTarget,
            rtt: lastHop?.rtt,
            geo: resolvedGeo,
          }
          hops.push(destHop)
          onHop(destHop)
          trace.hops = hops
        }
      } else if (resolvedIpInHops) {
        // The resolved IP is already in the hops — make sure it has the
        // correct geo data (in case ip-api returned something different)
        const destHop = hops.find((h) => h.ip === resolvedIp)
        if (destHop && !destHop.geo) {
          destHop.geo = resolvedGeo
          onHop(destHop)
        }
      }
    }
  } catch (err) {
    trace.error = `Traceroute failed: ${(err as Error).message}`
  }

  // Step 5: Security analysis (HSTS, HTTP/2, IPv6, port scan)
  // Runs after traceroute so the user sees hops immediately, then security.
  try {
    trace.security = await runSecurityAnalysis(cleanTarget)
    socket.emit('trace:update', trace)
  } catch (err) {
    console.error('[trace-service] Security analysis failed:', err)
  }

  trace.status = 'done'
  trace.finishedAt = Date.now()
  socket.emit('trace:update', trace)
}

// ---------------------- HTTP endpoint for client-side IP geolocation ----------------------
// The browser can't call ip-api.com directly because:
//   1. The free tier is HTTP-only (mixed-content blocked on HTTPS pages)
//   2. CORS isn't enabled on ip-api.com's free tier
// So we expose a simple HTTP endpoint that the browser can call, and the
// trace-service proxies the request to ip-api.com over HTTP.
//
// GET /geo?ip=8.8.8.8  →  { lat, lng, city, ... }  or  { error: "..." }
// GET /geo             →  geolocates the caller's IP (no ?ip= param)
httpServer.on('request', async (req, res) => {
  // Only handle /geo and /health requests; everything else goes to socket.io.
  if (!req.url || (!req.url.startsWith('/geo') && !req.url.startsWith('/health'))) {
    return // let socket.io handle it
  }

  // CORS headers so the browser can call this from any origin
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check endpoint: GET /health
  if (req.url.startsWith('/health')) {
    res.writeHead(200)
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      platform: process.platform,
      traceroute: process.platform === 'win32' ? 'tracert' : 'traceroute',
      dnsServers: dns.getServers(),
      geoCacheSize: geoCache.size,
      bgpCacheSize: bgpCache.size,
      reverseDnsCacheSize: reverseDnsCache.size,
    }))
    return
  }

  // Extract IP from query string: /geo?ip=8.8.8.8
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const ip = url.searchParams.get('ip')

  // If no IP provided, geolocate the caller's IP (read X-Forwarded-For or socket.remoteAddress)
  let targetIp = ip || ''
  if (!targetIp) {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      targetIp = forwarded.split(',')[0].trim()
    } else if (req.socket.remoteAddress) {
      // Strip IPv6 prefix ::ffff: from IPv4 addresses
      targetIp = req.socket.remoteAddress.replace(/^::ffff:/, '')
    }
  }

  // If the client IP is a loopback or private address (i.e. we're running
  // locally and the browser is on the same machine), we can't geolocate it.
  // Fall back to querying the server's own outbound IP via api.ipify.org.
  if (!ip && (!targetIp || targetIp === '::1' || targetIp === '127.0.0.1' || targetIp.startsWith('192.168.') || targetIp.startsWith('10.'))) {
    try {
      const externalIp = await new Promise<string>((resolveIP, rejectIP) => {
        const r = https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (ipRes) => {
          let body = ''
          ipRes.on('data', (c) => (body += c))
          ipRes.on('end', () => {
            try {
              resolveIP(JSON.parse(body).ip)
            } catch {
              rejectIP(new Error('parse error'))
            }
          })
        })
        r.on('error', rejectIP)
        r.on('timeout', () => {
          r.destroy()
          rejectIP(new Error('timeout'))
        })
      })
      targetIp = externalIp
    } catch {
      // If we can't get the external IP, just use whatever we had
    }
  }

  if (!targetIp) {
    res.writeHead(400)
    res.end(JSON.stringify({ error: 'No IP provided and could not determine client IP' }))
    return
  }

  const geo = await getGeoInfo(targetIp)
  if (geo) {
    res.writeHead(200)
    res.end(JSON.stringify(geo))
  } else {
    res.writeHead(404)
    res.end(JSON.stringify({ error: `Could not geolocate ${targetIp}` }))
  }
})

// ---------------------- Socket.io Connection Handler ----------------------
io.on('connection', (socket) => {
  console.log(`[trace-service] Client connected: ${socket.id}`)

  socket.on('trace', async (data: { target: string; userLocation?: { lat: number; lng: number } | null }) => {
    const target = data?.target?.trim()
    if (!target) {
      socket.emit('trace:error', { error: 'No target provided' })
      return
    }
    console.log(`[trace-service] Starting trace for: ${target}`)
    try {
      await runTrace(target, socket)
    } catch (err) {
      console.error(`[trace-service] Trace failed:`, err)
      socket.emit('trace:error', { error: (err as Error).message })
    }
  })

  socket.on('ping', () => socket.emit('pong'))

  socket.on('disconnect', (reason) => {
    console.log(`[trace-service] Client disconnected: ${socket.id} (${reason})`)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[trace-service] WebSocket server running on port ${PORT}`)
  console.log(`[trace-service] DNS servers in use: ${dns.getServers().join(', ')}`)
  console.log(`[trace-service] Platform: ${process.platform} — using ${process.platform === 'win32' ? 'tracert' : 'traceroute'}`)
})

process.on('SIGTERM', () => {
  console.log('[trace-service] SIGTERM, shutting down...')
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[trace-service] SIGINT, shutting down...')
  httpServer.close(() => process.exit(0))
})

// CRITICAL: Catch unhandled errors so the service doesn't crash
process.on('uncaughtException', (err) => {
  console.error('[trace-service] UNCAUGHT EXCEPTION (service staying alive):', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[trace-service] UNHANDLED REJECTION (service staying alive):', reason)
})
