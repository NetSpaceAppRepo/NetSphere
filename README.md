# 🌐 NetSphere — Planet-Scale Internet Visualizer

> **Making the invisible internet visible.**  
> A real-time 3D visualization platform that shows how data travels across the globe through DNS, TLS, CDN detection, and traceroute.

---

## 🚀 Overview

NetSphere is an interactive internet visualization tool that reveals the hidden infrastructure behind every website connection. Instead of viewing networking information through command-line outputs, NetSphere transforms complex processes into an immersive 3D globe experience.

Users can enter any domain and watch as NetSphere analyzes the connection, discovers network information, and visualizes the journey of data across the world in real time.

---

## ✨ Features

🌍 **Interactive 3D Globe**
- Real-time animated visualization of internet routes
- Global representation of network hops
- Smooth rotation and zoom controls

🔎 **Network Intelligence**
- DNS resolution to discover domain information
- TLS certificate inspection for secure connections
- CDN detection
- Traceroute-based network path visualization
- IP geolocation of network nodes

⚡ **Real-Time Visualization**
- Live updates using WebSockets
- Hop-by-hop route animation
- Instant rendering of network events

🛰️ **Simulation Mode**
- Provides realistic routes when real traceroute is blocked
- Ensures reliable demonstrations across different networks

---

## 🛠️ Tech Stack

**Frontend**
- Next.js
- React
- TypeScript
- Three.js
- React Three Fiber
- Three Globe
- Tailwind CSS
- shadcn/ui

**Backend**
- Node.js
- Socket.IO
- DNS Module
- TLS Module
- Traceroute / tracert
- IP Geolocation APIs

---

## 🏗️ Architecture

```
Browser
   |
   | HTTP
   ↓
Next.js Frontend (:3000)
   |
   | WebSocket
   ↓
Trace Service (:3003)
   |
   ├── DNS Lookup
   ├── TLS Analysis
   ├── CDN Detection
   ├── Traceroute
   └── IP Geolocation
```

---

## 📦 Installation

### Prerequisites

- Node.js 18+
- npm or Bun

Clone the repository:

```bash
git clone https://github.com/yourusername/netsphere.git
cd netsphere
```

Install dependencies:

```bash
npm install
```

Create environment file:

```bash
cp .env.local.example .env.local
```

---

## ▶️ Running NetSphere

### Start Frontend

```bash
npm run dev
```

Frontend runs at:

```
http://localhost:3000
```

### Start Trace Service

Open another terminal:

```bash
cd mini-services/trace-service
npm install
npm run dev
```

Backend runs on:

```
http://localhost:3003
```

---

## 🎮 Usage

1. Open NetSphere in your browser
2. Enter a domain:

```
google.com
github.com
wikipedia.org
```

3. Press **Trace**
4. Watch the network journey appear across the globe

---

## 🧩 Challenges

The biggest challenge was combining multiple networking operations that complete at different speeds. DNS resolution, TLS inspection, traceroute, CDN detection, and geolocation all operate independently.

We solved this by streaming events through WebSockets, allowing the globe visualization to update instantly as new network information becomes available.

---

## 🏆 Accomplishments

- Built a complete real-time internet visualization system
- Combined networking protocols with interactive 3D graphics
- Created an educational tool for understanding internet infrastructure
- Designed a reliable demo experience with simulated routes

---

## 📚 What We Learned

Building NetSphere helped us understand:

- Internet routing and networking protocols
- Real-time WebSocket communication
- 3D visualization with WebGL
- Backend event-driven architecture
- Integrating multiple system-level tools into a web application

---

## 🔮 Future Improvements

Future plans include:

- IPv6 route visualization
- BGP network mapping
- Latency heatmaps
- Historical route tracking
- Network performance analytics
- Educational classroom features

---

## 🤝 Contributing

Contributions and suggestions are welcome!

1. Fork the repository
2. Create a new branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License.

---

## ⭐ Built for VoltHacks

NetSphere was created to make the invisible infrastructure of the internet visual, interactive, and understandable.
