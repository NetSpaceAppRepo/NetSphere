# NetSphere — Planet-Scale Internet Visualizer

Watch real DNS, TLS, CDN detection, and a live traceroute animate across a 3D globe. No simulated data — every hop is a real router on the public internet. Built for VoltHacks.

DOWNLOAD THE ZIP FILE .

---

## Run it on Windows (5-minute setup)

### Prerequisites

The only thing you need is **Node.js 18 or newer**.

1. Go to https://nodejs.org/
2. Download the **LTS** version.
3. Run the installer — accept all defaults.
4. **Restart any open Command Prompt / PowerShell windows.**

To verify Node is installed:
```cmd
node -v
```
You should see `v18.x.x` or higher.

### Steps

1. **Copy this entire project folder** to your laptop (e.g. `C:\Users\YourName\NetSphere`).

2. **Double-click `start-windows.bat`** in File Explorer, OR run it from Command Prompt:
   ```cmd
   cd C:\Users\YourName\NetSphere
   start-windows.bat
   ```

   The script will:
   - Verify Node.js is installed
   - Install all dependencies (root + trace-service) via npm
   - Build native modules (sharp, swc, esbuild)
   - Open a **new window** running the trace-service backend on port 3003
   - Start Next.js on port 3000 in the current window

3. **Open http://localhost:3000** in your browser.

4. **Allow location access** when the browser prompts you — this places the "You" marker at your real GPS location. If you deny, it falls back to your IP-based location automatically.

5. **Type a domain** (e.g. `cloudflare.com`, `wikipedia.org`, `github.com`) and hit **Trace**.

6. **Watch the magic:**
   - DNS resolves to a real IP
   - TLS handshake captures the real certificate
   - CDN detection identifies Cloudflare/Akamai/Fastly
   - Real `tracert` runs hop-by-hop, each router appears on the globe as a 3D network node with a beam, diamond marker, and animated arc
   - Side panel shows the ASN, hosting provider, and RTT for each hop

7. **Stop both services:** Close BOTH command prompt windows, or press `Ctrl+C` in the Next.js window.

---

## How it works

```
Browser  ──HTTP──>  Next.js app (:3000)
   │                  │
   │                  └─ serves the React UI + 3D globe
   │
   └─WebSocket──>  Trace-service (:3003)
                     │
                     ├─ DNS lookup       (Node dns module, real)
                     ├─ TLS handshake    (Node tls module, real cert)
                     ├─ CDN detection    (HTTPS HEAD, real headers)
                     ├─ Traceroute       (Windows tracert, real)
                     ├─ IP geolocation   (ip-api.com, real)
                     └─ /geo endpoint    (proxies geolocation for browser)
```

**100% real data.** No simulation, no fake hops, no cached demo traces. Every hop you see is a real router on the public internet, geolocated to its actual city via ip-api.com.

### Geolocation

- The browser asks for your GPS location (permission prompt). If granted, the "You" marker is placed at your exact coordinates.
- If denied, it falls back to your IP address (via ip-api.com through the trace-service proxy).
- Each traceroute hop's IP is also geolocated via ip-api.com, so you can see the city, country, ASN, and ISP for every router.

---

## Troubleshooting (Windows-specific)

### "This site can't be reached" when opening localhost:3000

Next.js didn't start. Most common cause on Node 24 / npm 11: install-scripts blocked, preventing native binaries from downloading.

**Quick fix:**
```cmd
npm rebuild
cd mini-services\trace-service
npm rebuild
cd ..\..
```
Then re-run `start-windows.bat`.

If that fails, clean reinstall:
```cmd
rmdir /s /q node_modules
del package-lock.json
npm install
npm rebuild
```

### "Service online" badge shows red / "Connecting…" forever

The trace-service backend isn't running. Check:

1. **Is the trace-service window open?** There should be a second Command Prompt titled "NetSphere Trace Service". If it closed, open a Command Prompt in `mini-services\trace-service` and run `npx tsx index.ts` to see the error.

2. **Is port 3003 in use by something else?**
   ```cmd
   netstat -ano | findstr :3003
   taskkill /PID <number> /F
   ```

3. **Windows Firewall blocking port 3003?** The first time the trace-service starts, Windows may show a firewall prompt — click "Allow access".

4. **Test directly:** Open `http://localhost:3003/geo?ip=8.8.8.8` in your browser. You should see JSON with Google's location data. If you see nothing, the service isn't running.

### "Stuck in connecting" / lots of `/socket.io` 404 errors

Your browser cached old JavaScript. Do a **hard refresh**:
- Chrome/Edge: `Ctrl+Shift+R` or `Ctrl+F5`
- Firefox: `Ctrl+F5`

### Traceroute shows only timeouts (no real hops)

This happens on networks that block ICMP (some corporate/school Wi-Fi). Test if tracert works:
```cmd
tracert 8.8.8.8
```
If you see only `* * *`, your network blocks traceroute. Try a different network (mobile hotspot, home Wi-Fi).

### Browser doesn't ask for location / "Location denied"

The browser only asks for location on `http://localhost:3000` or `https://` pages. If you're accessing from a different hostname, geolocation won't work. The app falls back to IP-based location automatically — you'll still see your city, just not your precise GPS coordinates.

To re-enable: click the location icon in your browser's address bar and select "Allow".

### "Cannot find module @swc/core" / swc error

```cmd
npm rebuild @swc/core
```

### "'node' is not recognized"

Install Node.js LTS from https://nodejs.org/, then restart all terminal windows.

### "EADDRINUSE" / port already in use

```cmd
netstat -ano | findstr :3000
taskkill /PID <number> /F
```

### PowerShell script won't run

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

## File structure

```
C:\...\NetSphere\
├── src\                          # Next.js frontend
│   ├── app\                      # Root layout + page
│   ├── components\netsphere\     # Globe (3D nodes), TracePanel, SearchHeader
│   └── lib\netsphere\            # Types + Zustand store (socket + geolocation)
├── mini-services\
│   └── trace-service\            # Socket.io backend + /geo HTTP endpoint (port 3003)
├── start-windows.bat             # ← Double-click this
├── .npmrc                        # Allows install-scripts (needed for native binaries)
└── package.json                  # Uses "next dev -p 3000" (no Unix pipes)
```

---

## For the hackathon demo

**5-minute demo script:**

1. "Let me trace cloudflare.com" → type `cloudflare.com` → hit Trace → watch DNS resolve to 104.16.x.x, TLS cert appears, then real `tracert` runs hop-by-hop.
2. "Each of these markers is a real router" → point at the 3D nodes with beams and diamonds on the globe.
3. "This hop is in Columbus, Ohio — DoD Network, AS749" → point at the side panel.
4. "And here we land at Cloudflare in Toronto — AS13335, 9ms RTT" → point at the amber target marker.
5. "The arc animation shows my actual packets traveling from my location through each router to the destination."

**Pro tips:**
- The trace takes 10-30 seconds (real `tracert` is slow). Use this time to explain what's happening.
- If venue Wi-Fi blocks ICMP, the trace will show mostly timeouts. Have a mobile hotspot ready as backup.
- The geolocation permission prompt only appears once — grant it before the demo starts.

Good luck at VoltHacks! 🚀
