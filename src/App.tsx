import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Activity, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  Globe, 
  Server, 
  Zap,
  BarChart3,
  List,
  Settings,
  Bell,
  Search,
  RefreshCw,
  XCircle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---

interface Packet {
  sourceIp: string;
  destIp: string;
  protocol: string;
  port: number;
  size: number;
  timestamp: string;
}

interface Alert {
  id: number;
  timestamp: string;
  type: string;
  severity: 'Low' | 'Medium' | 'High';
  source_ip: string;
  dest_ip: string;
  protocol: string;
  details: string;
}

interface BlockedIP {
  ip: string;
  reason: string;
  timestamp: string;
}

interface Stats {
  totalAlerts: number;
  blockedCount: number;
  trafficStats: { protocol: string; count: number }[];
}

// --- Components ---

const Loader = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh]">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-indigo-100 rounded-full"></div>
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
    </div>
    <p className="mt-4 text-slate-500 font-medium">Loading dashboard...</p>
  </div>
);

const StatCard = ({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: string }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
    <div className={cn("p-3 rounded-xl", color)}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
    </div>
  </div>
);

export default function App() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [blockedIps, setBlockedIps] = useState<BlockedIP[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'alerts' | 'blocked' | 'settings'>('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchInitialData();
    connectWebSocket();
    return () => ws.current?.close();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, alertsRes, blockedRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/alerts'),
        fetch('/api/blocked')
      ]);
      setStats(await statsRes.json());
      setAlerts(await alertsRes.json());
      setBlockedIps(await blockedRes.json());
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setIsLoading(false);
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onopen = () => setIsConnected(true);
    socket.onclose = () => setIsConnected(false);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'packet') {
        setPackets(prev => [message.data, ...prev].slice(0, 50));
      } else if (message.type === 'alert') {
        setAlerts(prev => [message.data, ...prev]);
        setStats(prev => prev ? { ...prev, totalAlerts: prev.totalAlerts + 1 } : null);
      }
    };
    ws.current = socket;
  };

  const handleBlockIp = async (ip: string, reason: string) => {
    await fetch('/api/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, reason })
    });
    fetchInitialData();
  };

  const handleUnblockIp = async (ip: string) => {
    await fetch('/api/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    fetchInitialData();
  };

  // Prepare chart data
  const chartData = packets.slice().reverse().map((p, i) => ({
    time: i,
    size: p.size
  }));

  const pieData = stats?.trafficStats.map(s => ({ name: s.protocol, value: s.count })) || [];
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e'];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Sentinel NIDS</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'dashboard' ? "bg-indigo-50 text-indigo-600 font-semibold" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <BarChart3 className="w-5 h-5" />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('alerts')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'alerts' ? "bg-indigo-50 text-indigo-600 font-semibold" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Bell className="w-5 h-5" />
            Alerts
            {!isLoading && alerts.length > 0 && (
              <span className="ml-auto bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('blocked')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'blocked' ? "bg-indigo-50 text-indigo-600 font-semibold" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Lock className="w-5 h-5" />
            Blocked IPs
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'settings' ? "bg-indigo-50 text-indigo-600 font-semibold" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </nav>

        <div className="mt-auto">
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium",
            isConnected ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
          )}>
            <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
            {isConnected ? "Live Connection Active" : "Disconnected"}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">
              {activeTab === 'dashboard' && "Security Overview"}
              {activeTab === 'alerts' && "Intrusion Alerts"}
              {activeTab === 'blocked' && "Firewall Rules"}
              {activeTab === 'settings' && "System Configuration"}
            </h2>
            <p className="text-slate-500 mt-1">
              Monitoring network traffic on interface <code className="bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600 font-mono text-sm">eth0</code>
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={fetchInitialData} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <RefreshCw className={cn("w-5 h-5 text-slate-600", isLoading && "animate-spin")} />
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search logs..." 
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-64"
              />
            </div>
          </div>
        </header>

        {isLoading && (
          <Loader />
        )}

        {!isLoading && activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Total Alerts" value={stats?.totalAlerts || 0} icon={AlertTriangle} color="bg-rose-500" />
              <StatCard title="Blocked IPs" value={stats?.blockedCount || 0} icon={Lock} color="bg-slate-800" />
              <StatCard title="Active Connections" value={packets.length} icon={Activity} color="bg-indigo-500" />
              <StatCard title="System Health" value="Optimal" icon={Zap} color="bg-emerald-500" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-500" />
                    Traffic Throughput (Bytes)
                  </h3>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded uppercase">Real-time</span>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="time" hide />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: '#6366f1', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="size" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorSize)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-500" />
                  Protocol Distribution
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-xs text-slate-500 font-medium">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Feed Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-bottom border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-400" />
                    Live Packet Stream
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Last 50 packets</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                      <tr>
                        <th className="px-6 py-3">Source IP</th>
                        <th className="px-6 py-3">Protocol</th>
                        <th className="px-6 py-3">Port</th>
                        <th className="px-6 py-3">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <AnimatePresence initial={false}>
                        {packets.map((packet, idx) => (
                          <motion.tr 
                            key={`${packet.timestamp}-${idx}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="hover:bg-slate-50 transition-colors group"
                          >
                            <td className="px-6 py-4 font-mono text-xs text-slate-600">{packet.sourceIp}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                packet.protocol === 'TCP' ? "bg-blue-50 text-blue-600" :
                                packet.protocol === 'UDP' ? "bg-purple-50 text-purple-600" :
                                "bg-slate-100 text-slate-600"
                              )}>
                                {packet.protocol}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-500">{packet.port}</td>
                            <td className="px-6 py-4 text-slate-500">{packet.size} B</td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-bottom border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    Recent Security Alerts
                  </h3>
                  <button onClick={() => setActiveTab('alerts')} className="text-xs text-indigo-600 font-semibold hover:underline">View All</button>
                </div>
                <div className="p-6 space-y-4">
                  {alerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="flex gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 group">
                      <div className={cn(
                        "p-2 rounded-lg h-fit",
                        alert.severity === 'High' ? "bg-rose-100 text-rose-600" :
                        alert.severity === 'Medium' ? "bg-amber-100 text-amber-600" :
                        "bg-blue-100 text-blue-600"
                      )}>
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-slate-800 text-sm">{alert.type}</h4>
                          <span className="text-[10px] text-slate-400 font-medium">{format(new Date(alert.timestamp), 'HH:mm:ss')}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{alert.details}</p>
                        <div className="mt-3 flex items-center gap-3">
                          <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                            {alert.source_ip}
                          </span>
                          <button 
                            onClick={() => handleBlockIp(alert.source_ip, alert.type)}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 uppercase tracking-wider"
                          >
                            Block IP
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div className="text-center py-12">
                      <Shield className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400 text-sm">No security threats detected</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading && activeTab === 'alerts' && (
          <Loader />
        )}

        {!isLoading && activeTab === 'alerts' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Alert History</h3>
              <div className="flex gap-2">
                <select className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                  <option>All Severities</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Severity</th>
                    <th className="px-6 py-3">Source IP</th>
                    <th className="px-6 py-3">Details</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                        {format(new Date(alert.timestamp), 'MMM dd, HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-800">{alert.type}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          alert.severity === 'High' ? "bg-rose-100 text-rose-600" :
                          alert.severity === 'Medium' ? "bg-amber-100 text-amber-600" :
                          "bg-blue-100 text-blue-600"
                        )}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">{alert.source_ip}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs max-w-xs truncate">{alert.details}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleBlockIp(alert.source_ip, alert.type)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Block IP"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isLoading && activeTab === 'blocked' && (
          <Loader />
        )}

        {!isLoading && activeTab === 'blocked' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Active Firewall Blocks</h3>
              <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Manual Block
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-3">IP Address</th>
                    <th className="px-6 py-3">Reason</th>
                    <th className="px-6 py-3">Blocked On</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {blockedIps.map((block) => (
                    <tr key={block.ip} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm font-bold text-slate-800">{block.ip}</td>
                      <td className="px-6 py-4 text-slate-500">{block.reason}</td>
                      <td className="px-6 py-4 text-slate-400 text-xs">
                        {format(new Date(block.timestamp), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleUnblockIp(block.ip)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Unblock IP"
                        >
                          <Unlock className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {blockedIps.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                        No IP addresses are currently blocked
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-500" />
                Notification Channels
              </h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-2 rounded-lg shadow-sm">
                      <Globe className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Email Alerts</p>
                      <p className="text-xs text-slate-500">Send high-priority alerts to admin@sentinel.io</p>
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-indigo-600 rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-2 rounded-lg shadow-sm">
                      <Zap className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Telegram Bot</p>
                      <p className="text-xs text-slate-500">Instant push notifications via Telegram</p>
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-500" />
                Detection Sensitivity
              </h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-bold text-slate-700">DDoS Threshold</label>
                    <span className="text-sm text-indigo-600 font-mono">50 pkts/sec</span>
                  </div>
                  <input type="range" className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-bold text-slate-700">Port Scan Sensitivity</label>
                    <span className="text-sm text-indigo-600 font-mono">5 ports</span>
                  </div>
                  <input type="range" className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                </div>
              </div>
              <button className="mt-8 w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors">
                Save Configuration
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
