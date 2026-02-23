import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("nids.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT,
    severity TEXT,
    source_ip TEXT,
    dest_ip TEXT,
    protocol TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS traffic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_ip TEXT,
    dest_ip TEXT,
    protocol TEXT,
    port INTEGER,
    size INTEGER
  );
`);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  // --- API Routes ---

  app.get("/api/stats", (req, res) => {
    const totalAlerts = db.prepare("SELECT COUNT(*) as count FROM alerts").get() as any;
    const blockedCount = db.prepare("SELECT COUNT(*) as count FROM blocked_ips").get() as any;
    const recentAlerts = db.prepare("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 10").all();
    const trafficStats = db.prepare(`
      SELECT protocol, COUNT(*) as count 
      FROM traffic_logs 
      WHERE timestamp > datetime('now', '-1 hour')
      GROUP BY protocol
    `).all();

    res.json({
      totalAlerts: totalAlerts.count,
      blockedCount: blockedCount.count,
      recentAlerts,
      trafficStats
    });
  });

  app.get("/api/alerts", (req, res) => {
    const alerts = db.prepare("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 50").all();
    res.json(alerts);
  });

  app.get("/api/blocked", (req, res) => {
    const blocked = db.prepare("SELECT * FROM blocked_ips ORDER BY timestamp DESC").all();
    res.json(blocked);
  });

  app.post("/api/block", (req, res) => {
    const { ip, reason } = req.body;
    try {
      db.prepare("INSERT OR REPLACE INTO blocked_ips (ip, reason) VALUES (?, ?)").run(ip, reason);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to block IP" });
    }
  });

  app.post("/api/unblock", (req, res) => {
    const { ip } = req.body;
    db.prepare("DELETE FROM blocked_ips WHERE ip = ?").run(ip);
    res.json({ success: true });
  });

  // --- WebSocket Logic ---

  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  function broadcast(data: any) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // --- Traffic Simulator & Detection Engine ---

  const PROTOCOLS = ["TCP", "UDP", "ICMP", "HTTP", "HTTPS", "SSH", "FTP"];
  const COMMON_PORTS = [80, 443, 22, 21, 53, 3306, 8080];

  function generateRandomIP() {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join(".");
  }

  // Track state for detection
  const ipActivity: Record<string, { count: number, lastSeen: number, ports: Set<number> }> = {};

  function simulateTraffic() {
    const sourceIp = Math.random() > 0.9 ? "192.168.1.105" : generateRandomIP(); // Simulate some recurring IPs
    const destIp = "10.0.0.5"; // Our "server"
    const protocol = PROTOCOLS[Math.floor(Math.random() * PROTOCOLS.length)];
    const port = COMMON_PORTS[Math.floor(Math.random() * COMMON_PORTS.length)];
    const size = Math.floor(Math.random() * 1500);

    // Log traffic
    db.prepare("INSERT INTO traffic_logs (source_ip, dest_ip, protocol, port, size) VALUES (?, ?, ?, ?, ?)")
      .run(sourceIp, destIp, protocol, port, size);

    const packet = { sourceIp, destIp, protocol, port, size, timestamp: new Date().toISOString() };
    broadcast({ type: "packet", data: packet });

    // Detection Logic
    const now = Date.now();
    if (!ipActivity[sourceIp]) {
      ipActivity[sourceIp] = { count: 0, lastSeen: now, ports: new Set() };
    }
    const activity = ipActivity[sourceIp];
    activity.count++;
    activity.lastSeen = now;
    activity.ports.add(port);

    // 1. DDoS Detection (High frequency)
    if (activity.count > 50 && (now - activity.lastSeen) < 10000) {
      createAlert("DDoS Attempt", "High", sourceIp, destIp, protocol, `High traffic volume: ${activity.count} packets in short period`);
      activity.count = 0; // Reset after alert
    }

    // 2. Port Scanning Detection
    if (activity.ports.size > 5) {
      createAlert("Port Scanning", "Medium", sourceIp, destIp, "Multiple", `IP scanned ${activity.ports.size} different ports`);
      activity.ports.clear();
    }

    // 3. Brute Force (Simulated for SSH/FTP)
    if ((protocol === "SSH" || protocol === "FTP") && Math.random() > 0.98) {
      createAlert("Brute Force Attempt", "High", sourceIp, destIp, protocol, `Multiple failed login attempts detected on port ${port}`);
    }

    // 4. Unusual Traffic Spike (Random anomaly)
    if (size > 1450 && Math.random() > 0.99) {
      createAlert("Anomalous Packet Size", "Low", sourceIp, destIp, protocol, `Large packet size detected: ${size} bytes`);
    }
  }

  function createAlert(type: string, severity: string, source_ip: string, dest_ip: string, protocol: string, details: string) {
    const stmt = db.prepare("INSERT INTO alerts (type, severity, source_ip, dest_ip, protocol, details) VALUES (?, ?, ?, ?, ?, ?)");
    const info = stmt.run(type, severity, source_ip, dest_ip, protocol, details);
    
    const alert = {
      id: info.lastInsertRowid,
      timestamp: new Date().toISOString(),
      type,
      severity,
      source_ip,
      dest_ip,
      protocol,
      details
    };
    
    broadcast({ type: "alert", data: alert });
  }

  // Run simulation every 1-2 seconds
  setInterval(simulateTraffic, 1500);

  // --- Vite Integration ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Sentinel NIDS running on http://localhost:${PORT}`);
  });
}

startServer();
