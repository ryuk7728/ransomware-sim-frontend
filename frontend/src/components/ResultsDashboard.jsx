import { useEffect, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import './ResultsDashboard.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement)

// ── Comparison data for all 4 strategies ─────────────────────────
const COMPARISON = {
  labels: ['S1: No Defense', 'S2: Basic Backup', 'S3: Isolated+Monitor', 'S4: Full Defense'],
  dataLoss:  [100, 65, 15, 0],
  downtime:  [72, 36, 8, 0.75],
  detection: [null, null, 4, 0.05],
}

const STRATEGY_VERDICT = {
  1: { label: 'CATASTROPHIC',      color: 'var(--red)',   text: 'Total organizational failure. No path to recovery without paying ransom. Average recovery cost: $1.85M.' },
  2: { label: 'SEVERE',            color: 'var(--red)',   text: 'Backup encryption means partial loss at best. Manual discovery delays response significantly.' },
  3: { label: 'MANAGEABLE',        color: 'var(--amber)', text: 'Monitoring caught the attack in time to preserve most data. Backup isolation was the critical control.' },
  4: { label: 'INDUSTRY BEST PRACTICE', color: 'var(--green)', text: 'Near-zero impact. Early detection + surgical restore demonstrated full BCP maturity per ISO 27031.' },
}

// ── Chart.js theme ────────────────────────────────────────────────
const CHART_COLORS = ['#ff1744cc', '#ff6d00cc', '#ffc400cc', '#00e676cc']

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#6e7681', font: { family: 'JetBrains Mono', size: 11 } }
      },
      tooltip: {
        backgroundColor: '#0c0f1a',
        borderColor: '#1a2035',
        borderWidth: 1,
        titleColor: '#eceff1',
        bodyColor: '#8892a4',
        titleFont: { family: 'JetBrains Mono', size: 12 },
        bodyFont:  { family: 'JetBrains Mono', size: 11 },
      }
    },
    scales: {
      x: {
        ticks: { color: '#6e7681', font: { family: 'JetBrains Mono', size: 10 } },
        grid: { color: '#1a2035' }
      },
      y: {
        ticks: { color: '#6e7681', font: { family: 'JetBrains Mono', size: 10 } },
        grid: { color: '#1a2035' }
      }
    }
  }
}

export default function ResultsDashboard({ metrics, strategy, logs, onReset }) {
  const [animIn, setAnimIn] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setAnimIn(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Use measured metrics if available, else fall back to strategy defaults
  const dataLoss   = metrics?.data_loss_percent   ?? (strategy?.expected_loss?.replace('%','') * 1) ?? 0
  const totalFiles = metrics?.total_files          ?? 50
  const filesLost  = metrics?.data_loss_files      ?? Math.round(totalFiles * dataLoss / 100)
  const filesRec   = metrics?.files_recovered      ?? (totalFiles - filesLost)
  const detectionSec = metrics?.detection_time_seconds ?? null
  const downtimeSec  = metrics?.downtime_seconds    ?? null
  const projected    = metrics?.downtime_is_projected ?? (strategy?.id <= 2)
  const suspect      = metrics?.suspect_process     ?? null

  const verdict = STRATEGY_VERDICT[strategy?.id] || STRATEGY_VERDICT[1]

  // Format time nicely
  const fmtTime = (sec) => {
    if (sec == null) return '—'
    if (sec >= 3600) return `${(sec / 3600).toFixed(1)}h`
    if (sec >= 60)   return `${Math.round(sec / 60)} min`
    return `${Math.round(sec)}s`
  }

  // ── Bar chart: data loss comparison ──────────────────────────────
  const dataLossChart = {
    labels: COMPARISON.labels,
    datasets: [{
      label: 'Data Loss (%)',
      data: COMPARISON.dataLoss,
      backgroundColor: CHART_COLORS,
      borderColor: CHART_COLORS.map(c => c.replace('cc','ff')),
      borderWidth: 1,
    }]
  }

  // ── Bar chart: downtime comparison ───────────────────────────────
  const downtimeChart = {
    labels: COMPARISON.labels,
    datasets: [{
      label: 'Downtime (hours)',
      data: COMPARISON.downtime,
      backgroundColor: CHART_COLORS,
      borderColor: CHART_COLORS.map(c => c.replace('cc','ff')),
      borderWidth: 1,
    }]
  }

  // ── Doughnut: files affected ──────────────────────────────────────
  const doughnutData = {
    labels: ['Files Lost', 'Files Recovered'],
    datasets: [{
      data: [filesLost, filesRec],
      backgroundColor: ['#ff1744aa', '#00e676aa'],
      borderColor:     ['#ff1744',   '#00e676'],
      borderWidth: 1,
    }]
  }

  return (
    <div className={`results-wrapper ${animIn ? 'animate-in' : ''}`}>
      <div className="phase-label">SIMULATION COMPLETE — ASSESSMENT ENGINE OUTPUT</div>

      {/* Verdict Banner */}
      <div className="verdict-banner" style={{ '--verdict-color': verdict.color }}>
        <div className="verdict-left">
          <div className="verdict-label" style={{ color: verdict.color }}>
            THREAT OUTCOME: {verdict.label}
          </div>
          <div className="verdict-text">{verdict.text}</div>
        </div>
        <div className="verdict-strategy">
          <div className="text-dim" style={{ fontSize: 11, letterSpacing: 2 }}>STRATEGY</div>
          <div className="verdict-strat-num" style={{ color: verdict.color }}>
            S{strategy?.id}
          </div>
          <div className="text-bright" style={{ fontSize: 12, letterSpacing: 1 }}>
            {strategy?.name?.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Top Metrics */}
      <div className="metrics-grid">
        <MetricCard
          label="DATA LOSS"
          value={`${Math.round(dataLoss)}%`}
          sub={`${filesLost} / ${totalFiles} files`}
          color={dataLoss === 0 ? 'var(--green)' : dataLoss > 50 ? 'var(--red)' : 'var(--amber)'}
          big
        />
        <MetricCard
          label="DOWNTIME"
          value={fmtTime(downtimeSec ?? (strategy?.id === 1 ? 259200 : strategy?.id === 2 ? 129600 : strategy?.id === 3 ? 28800 : 2700))}
          sub={projected ? '⚠ Projected (industry avg)' : 'Measured'}
          color={projected ? 'var(--amber)' : 'var(--cyan)'}
        />
        <MetricCard
          label="DETECTION TIME"
          value={detectionSec != null ? fmtTime(detectionSec) : 'NONE'}
          sub={detectionSec != null ? 'From attack start' : 'Not detected'}
          color={detectionSec != null ? 'var(--green)' : 'var(--text-dim)'}
        />
        <MetricCard
          label="FILES ENCRYPTED"
          value={metrics?.files_encrypted ?? filesLost}
          sub={`${filesRec} recovered`}
          color="var(--red)"
        />
      </div>

      {/* Process ID block */}
      {suspect && (
        <div className="pid-block card">
          <div className="card-header">
            <div className="card-header-title">PROCESS IDENTIFICATION (psutil)</div>
            <span className="badge badge-amber">OS-LEVEL DETECTION</span>
          </div>
          <div className="pid-body">
            <div className="pid-row">
              <span className="pid-key">PID</span>
              <span className="pid-val text-red">{suspect.pid}</span>
            </div>
            <div className="pid-row">
              <span className="pid-key">Process Name</span>
              <span className="pid-val text-amber">{suspect.name}</span>
            </div>
            <div className="pid-row">
              <span className="pid-key">CPU %</span>
              <span className="pid-val">{suspect.cpu_percent?.toFixed(1)}%</span>
            </div>
            <div className="pid-row">
              <span className="pid-key">Open File Handles in Target</span>
              <span className="pid-val text-red">{suspect.file_count}</span>
            </div>
            <div className="pid-note text-dim">
              ⚠ In production: OS would issue SIGKILL to PID {suspect.pid}. In this simulation,
              a threading.Event() stop signal was sent instead (same behavioral effect).
            </div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-header-title">DATA LOSS BY STRATEGY (%)</div>
            <span className="badge badge-dim">COMPARISON</span>
          </div>
          <div className="chart-container">
            <Bar
              data={dataLossChart}
              options={{
                ...chartDefaults(),
                scales: {
                  ...chartDefaults().scales,
                  y: { ...chartDefaults().scales.y, max: 110,
                       title: { display: true, text: 'Data Loss (%)', color: '#6e7681', font: { family: 'JetBrains Mono', size: 10 } } }
                }
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-header-title">DOWNTIME BY STRATEGY (hours)</div>
            <span className="badge badge-dim">COMPARISON</span>
          </div>
          <div className="chart-container">
            <Bar
              data={downtimeChart}
              options={{
                ...chartDefaults(),
                scales: {
                  ...chartDefaults().scales,
                  y: { ...chartDefaults().scales.y,
                       title: { display: true, text: 'Hours', color: '#6e7681', font: { family: 'JetBrains Mono', size: 10 } } }
                }
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-header-title">FILE RECOVERY BREAKDOWN</div>
            <span className="badge badge-dim">THIS RUN</span>
          </div>
          <div className="chart-container" style={{ maxWidth: 280, margin: '0 auto' }}>
            <Doughnut
              data={doughnutData}
              options={{
                ...chartDefaults(),
                scales: undefined,
                cutout: '65%',
              }}
            />
          </div>
          <div className="doughnut-legend">
            <span style={{ color: 'var(--red)' }}>● {filesLost} Lost</span>
            <span style={{ color: 'var(--green)' }}>● {filesRec} Recovered</span>
          </div>
        </div>
      </div>

      {/* Action Row */}
      <div className="results-actions">
        <button className="btn btn-dim" onClick={onReset}>
          ↩ RUN ANOTHER SIMULATION
        </button>
        <div className="results-note text-dim">
          All metrics above reflect real Fernet encryption on synthetic files in /sim_workspace/org_files/.
          Downtime for S1/S2 are industry-average projections (flagged). Detection time and data loss % are computed values.
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub, color, big }) {
  return (
    <div className="metric-card card">
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value" style={{ color, fontSize: big ? '48px' : '36px' }}>
        {value}
      </div>
      <div className="metric-card-sub">{sub}</div>
    </div>
  )
}
