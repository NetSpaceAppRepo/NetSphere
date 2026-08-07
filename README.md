# 🌐 NetSphere — Planet-Scale Internet Visualizer

![NetSphere Banner](https://github.com/user-attachments/assets/placeholder)

> **Making the invisible internet visible.**  
> Watch DNS resolution, TLS handshakes, CDN detection, and network routes animate across a 3D globe in real time.

---

## 🚀 Overview

NetSphere is an interactive real-time internet visualization platform that reveals the hidden journey of data across the world. Instead of viewing networking information through traditional command-line tools, NetSphere transforms complex internet infrastructure into an immersive 3D experience.

Enter any domain and watch as NetSphere analyzes the connection, discovers network information, and visualizes the path your data takes across the globe.

---

## ✨ Features

### 🌍 Interactive 3D Globe
- Real-time animated visualization of internet routes
- Geographic representation of network hops
- Smooth rotation and zoom controls

### 🔎 Network Analysis
- **DNS Resolution** — Discover how domains map to IP addresses
- **TLS Inspection** — View certificates and secure connection details
- **CDN Detection** — Identify content delivery networks
- **Traceroute Visualization** — See hop-by-hop network paths
- **IP Geolocation** — Map infrastructure locations worldwide

### ⚡ Real-Time Streaming
- Live updates using WebSockets
- Network events appear instantly as they are discovered
- Animated hop-by-hop route visualization

### 🛰️ Simulation Mode
When real traceroute is unavailable due to firewall or ISP restrictions, NetSphere provides realistic simulated routes for reliable demonstrations.

---

## 🛠️ Tech Stack

### Frontend
- Next.js
- React
- TypeScript
- Three.js
- React Three Fiber
- Three Globe
- Tailwind CSS
- shadcn/ui

### Backend
- Node.js
- Socket.IO
- DNS module
- TLS module
- Traceroute/tracert utilities
- IP geolocation APIs

---

## 🏗️ Architecture
