import { useState, useEffect, useRef, useCallback } from 'react'
import StrategySelector from './components/StrategySelector'
import AttackConsole from './components/AttackConsole'
import Timeline from './components/Timeline'
import ResultsDashboard from './components/ResultsDashboard'

// ── Phase constants ────────────────────────────────────────────────
const PHASE = { SELECT: 'select', SIMULATING: 'simulating', COMPLETE: 'complete' }

// ── Status label per phase ────────────────────────────────────────
const STATUS = {
  select:     { label: 'STANDBY',      dot: '' },
  simulating: { label: 'ATTACK LIVE',  dot: 'attack' },
  complete:   { label: 'SIM COMPLETE', dot: '' },
}

export default function App() {
  const [phase, setPhase]         = useState(PHASE.SELECT)
  const [strategy, setStrategy]   = useState(null)
  const [simId, setSimId]         = useState(null)
  const [logs, setLogs]           = useState([])
  const [metrics, setMetrics]     = useState(null)
  const [timeline, setTimeline]   = useState([])
  const [wsStatus, setWsStatus]   = useState('idle')   // idle | connecting | connected | error
  const [encryptedCount, setEncryptedCount] = useState(0)

  const wsRef = useRef(null)

  // ── Push a log entry ──────────────────────────────────────────────
  const pushLog = useCallback((type, message, timestamp) => {
    const ts = timestamp ? new Date(timestamp * 1000) : new Date()
    const timeStr = ts.toLocaleTimeString('en-GB', { hour12: false })
    setLogs(prev => [...prev, { type, message, time: timeStr, id: Date.now() + Math.random() }])
  }, [])

  // ── Push a timeline event ─────────────────────────────────────────
  const pushTimeline = useCallback((event) => {
    setTimeline(prev => {
      if (prev.find(e => e.key === event.key)) return prev
      return [...prev, { ...event, time: new Date().toLocaleTimeString('en-GB', { hour12: false }) }]
    })
  }, [])

  // ── Launch simulation ─────────────────────────────────────────────
  const launchSimulation = useCallback(async (selectedStrategy) => {
    setStrategy(selectedStrategy)
    setLogs([])
    setTimeline([])
    setMetrics(null)
    setEncryptedCount(0)
    setPhase(PHASE.SIMULATING)

    pushLog('info', `Initialising simulation — Strategy ${selectedStrategy.id}: ${selectedStrategy.name}`)
    pushLog('info', 'Connecting to backend orchestrator...')
    pushTimeline({ key: 'init', label: 'SIMULATION INIT', color: 'cyan' })

    try {
      const res = await fetch('/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: selectedStrategy.id })
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const id = data.simulation_id

      setSimId(id)
      pushLog('info', `Simulation ID: ${id}`)
      pushLog('info', 'WebSocket channel established. Awaiting events...')

      // ── Open WebSocket ─────────────────────────────────────────────
      setWsStatus('connecting')
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/${id}`)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
        pushLog('info', 'WebSocket connected. Live feed active.')
      }

      ws.onmessage = (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch { return }

        const { type, message, timestamp, metrics: m } = msg

        if (type === 'log') {
          pushLog('log', message, timestamp)
          // Parse encrypted count from log messages
          if (message && message.toLowerCase().includes('encrypted')) {
            const match = message.match(/\d+/)
            if (match) setEncryptedCount(parseInt(match[0]))
          }
        }

        if (type === 'detection') {
          pushLog('detection', message, timestamp)
          pushTimeline({ key: 'detection', label: 'THREAT DETECTED', color: 'amber' })
        }

        if (type === 'recovery') {
          pushLog('recovery', message, timestamp)
          pushTimeline({ key: 'recovery', label: 'RECOVERY START', color: 'green' })
        }

        if (type === 'complete') {
          pushLog('complete', 'Simulation complete. Assessment engine finalised.', timestamp)
          pushTimeline({ key: 'complete', label: 'RESTORED', color: 'green' })
          setMetrics(m)
          setPhase(PHASE.COMPLETE)
          ws.close()
        }

        if (type === 'error') {
          pushLog('error', message || 'Unknown error from backend.', timestamp)
          setWsStatus('error')
        }
      }

      ws.onerror = () => {
        setWsStatus('error')
        pushLog('error', 'WebSocket connection error. Check that the backend is running on port 8000.')
      }

      ws.onclose = () => {
        if (wsStatus !== 'error') setWsStatus('idle')
      }

    } catch (err) {
      pushLog('error', `Failed to connect to backend: ${err.message}`)
      pushLog('error', 'Make sure FastAPI is running: uvicorn app:app --reload')
      setWsStatus('error')
    }
  }, [pushLog, pushTimeline, wsStatus])

  // ── Reset to strategy select ──────────────────────────────────────
  const reset = useCallback(() => {
    if (wsRef.current) wsRef.current.close()
    setPhase(PHASE.SELECT)
    setStrategy(null)
    setSimId(null)
    setLogs([])
    setTimeline([])
    setMetrics(null)
    setEncryptedCount(0)
    setWsStatus('idle')
  }, [])

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => { if (wsRef.current) wsRef.current.close() }
  }, [])

  // ── Add baseline timeline events ──────────────────────────────────
  useEffect(() => {
    if (phase === PHASE.SIMULATING && timeline.length === 1) {
      setTimeout(() => pushTimeline({ key: 'recon', label: 'RECON', color: 'red' }), 800)
      setTimeout(() => pushTimeline({ key: 'encrypt', label: 'ENCRYPTING', color: 'red' }), 1600)
    }
  }, [phase, timeline.length, pushTimeline])

  const currentStatus = STATUS[phase]

  return (
    <div className="app-wrapper">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="header-logo">
            <div className="logo-icon">
              <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1L1 4v4c0 3.5 3 6.5 7 8 4-1.5 7-4.5 7-8V4L8 1zm0 2.2l5 2.2V8c0 2.5-2.2 4.8-5 6.1C5.2 12.8 3 10.5 3 8V5.4L8 3.2z"/>
              </svg>
            </div>
            <span className="header-title glitch">
              THREAT<span>-</span>SIM
            </span>
          </div>
          <span className="header-badge">v1.0.0</span>
        </div>

        <div className="header-right">
          <div className="header-status">
            <div className={`status-dot ${currentStatus.dot}`}></div>
            <span style={{ color: currentStatus.dot === 'attack' ? 'var(--red)' : 'var(--text-dim)' }}>
              {currentStatus.label}
            </span>
          </div>
          {strategy && (
            <span style={{ color: 'var(--text-dim)' }}>
              STRATEGY&nbsp;{strategy.id}
            </span>
          )}
          {simId && (
            <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>
              SIM&nbsp;{simId.slice(0, 8).toUpperCase()}
            </span>
          )}
          {phase !== PHASE.SELECT && (
            <button className="btn btn-dim" onClick={reset} style={{ padding: '4px 12px', fontSize: '10px' }}>
              ↩ RESET
            </button>
          )}
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main className="app-main">
        {phase === PHASE.SELECT && (
          <StrategySelector onLaunch={launchSimulation} />
        )}

        {phase === PHASE.SIMULATING && (
          <SimulatingView
            logs={logs}
            timeline={timeline}
            strategy={strategy}
            encryptedCount={encryptedCount}
            wsStatus={wsStatus}
          />
        )}

        {phase === PHASE.COMPLETE && (
          <ResultsDashboard
            metrics={metrics}
            strategy={strategy}
            logs={logs}
            onReset={reset}
          />
        )}
      </main>
    </div>
  )
}

// ── Simulating View: console + timeline side by side ──────────────
function SimulatingView({ logs, timeline, strategy, encryptedCount, wsStatus }) {
  return (
    <div className="animate-in">
      <div className="phase-label">LIVE SIMULATION — STRATEGY {strategy?.id}: {strategy?.name?.toUpperCase()}</div>

      {/* Attack status banner */}
      <div className="attack-banner">
        <div className="attack-banner-left">
          <span className="badge badge-red" style={{ animation: 'badgeBlink 1s step-end infinite' }}>
            ⬛ ATTACK IN PROGRESS
          </span>
          <span className="attack-banner-stat">
            FILES ENCRYPTED: <span className="text-red">{encryptedCount}</span>
          </span>
          {wsStatus === 'connecting' && (
            <span style={{ color: 'var(--amber)', fontSize: '11px' }}>
              ◌ Connecting to backend...
            </span>
          )}
          {wsStatus === 'error' && (
            <span className="badge badge-amber">⚠ Backend connection failed — check FastAPI is running</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          <span>TARGET: /sim_workspace/org_files/</span>
          <span>|</span>
          <span style={{ color: 'var(--cyan)' }}>MONITORING: {strategy?.monitoring ? 'ACTIVE' : 'NONE'}</span>
        </div>
      </div>

      <div className="sim-layout">
        <AttackConsole logs={logs} />
        <Timeline events={timeline} strategy={strategy} />
      </div>
    </div>
  )
}
