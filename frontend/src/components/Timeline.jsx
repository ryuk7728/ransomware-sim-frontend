import './Timeline.css'

const COLOR_VAR = {
  red:   'var(--red)',
  amber: 'var(--amber)',
  green: 'var(--green)',
  cyan:  'var(--cyan)',
}

// All possible timeline nodes in order
const ALL_NODES = [
  { key: 'init',      label: 'SIMULATION INIT', color: 'cyan'  },
  { key: 'recon',     label: 'RECON',           color: 'red'   },
  { key: 'encrypt',   label: 'ENCRYPTING',      color: 'red'   },
  { key: 'detection', label: 'THREAT DETECTED', color: 'amber' },
  { key: 'recovery',  label: 'RECOVERY START',  color: 'green' },
  { key: 'complete',  label: 'RESTORED',        color: 'green' },
]

export default function Timeline({ events, strategy }) {
  const reachedKeys = new Set(events.map(e => e.key))

  const getEventTime = (key) => {
    const ev = events.find(e => e.key === key)
    return ev?.time || null
  }

  return (
    <div className="timeline-wrapper">
      <div className="card">
        <div className="card-header">
          <div className="card-header-title">EVENT TIMELINE</div>
          <span className="text-dim" style={{ fontSize: 10 }}>{events.length} events</span>
        </div>

        <div className="timeline-body">
          {ALL_NODES.map((node, i) => {
            const reached  = reachedKeys.has(node.key)
            const color    = COLOR_VAR[node.color]
            const time     = getEventTime(node.key)
            const isLast   = i === ALL_NODES.length - 1

            return (
              <div key={node.key} className="timeline-node-wrap">
                <div className={`timeline-node ${reached ? 'reached' : ''}`} style={{ '--node-color': color }}>
                  {/* Dot */}
                  <div className="node-dot">
                    {reached ? (
                      <div className="dot-active" style={{ background: color, boxShadow: `0 0 8px ${color}` }}></div>
                    ) : (
                      <div className="dot-inactive"></div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="node-content">
                    <div
                      className="node-label"
                      style={{ color: reached ? color : 'var(--text-dim)' }}
                    >
                      {node.label}
                    </div>
                    {time && (
                      <div className="node-time">{time}</div>
                    )}
                    {!reached && (
                      <div className="node-pending">pending</div>
                    )}
                  </div>
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div className={`timeline-connector ${reached ? 'filled' : ''}`}
                       style={{ '--connector-color': color }}>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Strategy info card */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <div className="card-header-title">STRATEGY DETAILS</div>
        </div>
        <div className="strategy-detail-body">
          <div className="detail-row">
            <span className="detail-key">Name</span>
            <span className="detail-val text-bright">{strategy?.name}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Backup</span>
            <span className="detail-val">{strategy?.backup_type || '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Monitoring</span>
            <span className={`detail-val ${strategy?.monitoring ? 'text-green' : 'text-red'}`}>
              {strategy?.monitoring ? 'Active' : 'None'}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Isolated Backup</span>
            <span className={`detail-val ${strategy?.isolated_backup ? 'text-green' : 'text-red'}`}>
              {strategy?.isolated_backup ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Expected Loss</span>
            <span className={`detail-val text-${strategy?.threatColor || 'dim'}`}>
              {strategy?.expected_loss || '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
