import { useState, useEffect } from 'react'
import './StrategySelector.css'

// ── Hardcoded fallback (used if backend is not reachable on load) ──
const DEFAULT_STRATEGIES = [
  {
    id: 1,
    name: 'No Defense',
    threat: 'CRITICAL',
    threatColor: 'red',
    description: 'No backups, no monitoring, no AV. The organization has zero security controls.',
    backup_type: 'none',
    monitoring: false,
    isolated_backup: false,
    expected_loss: '100%',
    expected_downtime: '72h',
    detection: 'NEVER',
    features: [
      { label: 'Backup', value: 'None', bad: true },
      { label: 'Monitoring', value: 'None', bad: true },
      { label: 'Network Isolation', value: 'None', bad: true },
      { label: 'AV / EDR', value: 'None', bad: true },
    ]
  },
  {
    id: 2,
    name: 'Basic Backup',
    threat: 'HIGH',
    threatColor: 'red',
    description: 'Backups exist but stored on the same connected drive — within the attack surface.',
    backup_type: 'connected',
    monitoring: false,
    isolated_backup: false,
    expected_loss: '65%',
    expected_downtime: '36h',
    detection: 'MANUAL',
    features: [
      { label: 'Backup', value: 'Connected drive', bad: true },
      { label: 'Monitoring', value: 'None', bad: true },
      { label: 'Network Isolation', value: 'None', bad: true },
      { label: 'AV / EDR', value: 'None', bad: true },
    ]
  },
  {
    id: 3,
    name: 'Isolated Backup + Monitoring',
    threat: 'MODERATE',
    threatColor: 'amber',
    description: 'Offline backups unreachable by ransomware. File-change monitoring detects attack with delay.',
    backup_type: 'isolated',
    monitoring: true,
    isolated_backup: true,
    expected_loss: '15%',
    expected_downtime: '8h',
    detection: '~4 min',
    features: [
      { label: 'Backup', value: 'Isolated (offline)', bad: false },
      { label: 'Monitoring', value: 'File watcher (5 files/10s)', bad: false },
      { label: 'Network Isolation', value: 'On detection', bad: false },
      { label: 'AV / EDR', value: 'Basic', bad: false },
    ]
  },
  {
    id: 4,
    name: 'Full Defense',
    threat: 'SECURE',
    threatColor: 'green',
    description: 'Immutable offsite backups, aggressive real-time monitoring, hash verification, surgical restore.',
    backup_type: 'isolated+hashed',
    monitoring: true,
    isolated_backup: true,
    expected_loss: '0%',
    expected_downtime: '45 min',
    detection: '~3 min',
    features: [
      { label: 'Backup', value: 'Immutable + hashed', bad: false },
      { label: 'Monitoring', value: 'Aggressive (2 files/2s)', bad: false },
      { label: 'Network Isolation', value: 'Instant on detection', bad: false },
      { label: 'AV / EDR', value: 'Full EDR + hash verify', bad: false },
    ]
  }
]

const THREAT_BADGE = {
  CRITICAL: 'badge-red',
  HIGH:     'badge-red',
  MODERATE: 'badge-amber',
  SECURE:   'badge-green',
}

export default function StrategySelector({ onPrepare, onLaunch, preparedWorkspace }) {
  const [strategies, setStrategies] = useState(DEFAULT_STRATEGIES)
  const [selected, setSelected]     = useState(null)
  const [preparing, setPreparing]   = useState(false)
  const [launching, setLaunching]   = useState(false)
  const [actionError, setActionError] = useState('')

  // Try to fetch strategies from backend, fall back silently
  useEffect(() => {
    fetch('/strategies')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data) && data.length === 4) {
          const byId = new Map(data.map(item => [item.id, item]))
          // Merge backend data with our display metadata
          setStrategies(prev => prev.map(s => ({ ...s, ...(byId.get(s.id) || {}) })))
        }
      })
      .catch(() => {}) // silently use defaults
  }, [])

  const isPreparedForSelection = preparedWorkspace?.strategy === selected?.id

  const handlePrepare = async () => {
    if (!selected) return
    setPreparing(true)
    setActionError('')
    try {
      await onPrepare(selected)
    } catch (err) {
      setActionError(err.message || 'Failed to prepare workspace.')
    } finally {
      setPreparing(false)
    }
  }

  const handleLaunch = async () => {
    if (!selected) return
    setActionError('')
    setLaunching(true)
    try {
      await onLaunch(selected)
    } catch (err) {
      setActionError(err.message || 'Failed to launch simulation.')
      setLaunching(false)
    }
  }

  return (
    <div className="strategy-selector animate-in">
      <div className="selector-header">
        <div className="phase-label">SELECT SECURITY POSTURE // CHOOSE YOUR BATTLEGROUND</div>
        <h1 className="selector-title glitch">
          RANSOMWARE ATTACK SIMULATOR
        </h1>
        <p className="selector-subtitle">
          Select an organizational security posture below. The simulation will generate synthetic org files,
          execute real Fernet encryption, and measure actual data loss and downtime per strategy.
        </p>
        <div className="selector-meta">
          <span className="badge badge-cyan">ACADEMIC DEMO</span>
          <span className="badge badge-dim">VIT — INFORMATION SECURITY MGMT</span>
          <span className="badge badge-dim">UBUNTU 22.04 VM</span>
        </div>
      </div>

      <div className="strategy-grid">
        {strategies.map((s, i) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            index={i}
            selected={selected?.id === s.id}
            onSelect={() => setSelected(s)}
          />
        ))}
      </div>

      <div className="launch-row">
        <div className="launch-info">
          {selected ? (
            <div className="launch-info-stack">
              <div>
                <span className="text-dim">SELECTED:</span>&nbsp;
                <span className={`text-${selected.threatColor}`}>{selected.name.toUpperCase()}</span>
                &nbsp;
                <span className="text-dim">// Expected loss:</span>&nbsp;
                <span className={`text-${selected.threatColor}`}>{selected.expected_loss}</span>
                &nbsp;
                <span className="text-dim">// Downtime:</span>&nbsp;
                <span className={`text-${selected.threatColor}`}>{selected.expected_downtime}</span>
              </div>
              <div className="launch-helper">
                {isPreparedForSelection ? (
                  <>
                    <span className="badge badge-green">WORKSPACE READY</span>
                    <span className="text-dim">
                      {preparedWorkspace.total_files} files prepared // backup: {preparedWorkspace.backup_type}
                    </span>
                  </>
                ) : (
                  <span className="text-dim">
                    1. Create organisation files to inspect the clean workspace and backups. 2. Launch the attack simulation.
                  </span>
                )}
              </div>
              {actionError && (
                <div className="launch-helper text-red">{actionError}</div>
              )}
            </div>
          ) : (
            <span className="text-dim">↑ Select a strategy to continue</span>
          )}
        </div>
        <div className="launch-actions">
          <button
            className="btn btn-cyan prepare-btn"
            disabled={!selected || preparing || launching}
            onClick={handlePrepare}
          >
            {preparing ? '◌ CREATING...' : '◌ CREATE ORGANISATION FILES'}
          </button>
          <button
            className="btn btn-red launch-btn"
            disabled={!selected || launching || preparing || !isPreparedForSelection}
            onClick={handleLaunch}
          >
            {launching ? '◌ LAUNCHING...' : '⬛ LAUNCH ATTACK SIMULATION'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StrategyCard({ strategy: s, index, selected, onSelect }) {
  const colorVar = {
    red:   'var(--red)',
    amber: 'var(--amber)',
    green: 'var(--green)',
    cyan:  'var(--cyan)',
  }[s.threatColor]

  return (
    <div
      className={`strategy-card ${selected ? 'selected' : ''} card-${s.threatColor}`}
      onClick={onSelect}
      style={{ '--card-color': colorVar, animationDelay: `${index * 0.08}s` }}
    >
      <div className="strategy-card-top">
        <div className="strategy-card-id">S{s.id}</div>
        <span className={`badge ${THREAT_BADGE[s.threat]}`}>{s.threat}</span>
      </div>

      <h3 className="strategy-card-name">{s.name}</h3>
      <p className="strategy-card-desc">{s.description}</p>

      <div className="strategy-card-divider"></div>

      <div className="strategy-features">
        {s.features.map(f => (
          <div key={f.label} className="strategy-feature">
            <span className="feature-label">{f.label}</span>
            <span className={`feature-value ${f.bad ? 'text-dim' : 'text-green'}`}>
              {f.bad ? '✗' : '✓'} {f.value}
            </span>
          </div>
        ))}
      </div>

      <div className="strategy-card-divider"></div>

      <div className="strategy-metrics-row">
        <div className="strategy-metric">
          <div className="metric-label">DATA LOSS</div>
          <div className={`metric-val text-${s.threatColor}`}>{s.expected_loss}</div>
        </div>
        <div className="strategy-metric">
          <div className="metric-label">DOWNTIME</div>
          <div className={`metric-val text-${s.threatColor}`}>{s.expected_downtime}</div>
        </div>
        <div className="strategy-metric">
          <div className="metric-label">DETECTION</div>
          <div className={`metric-val text-${s.threatColor}`}>{s.detection}</div>
        </div>
      </div>

      {selected && <div className="selected-indicator">▶ SELECTED</div>}
    </div>
  )
}
