import { useEffect, useRef } from 'react'
import './AttackConsole.css'

const TYPE_CONFIG = {
  log:       { prefix: '[SYS]',       color: 'var(--text-mid)',   glow: false },
  info:      { prefix: '[INFO]',      color: 'var(--cyan)',       glow: false },
  detection: { prefix: '[DETECTION]', color: 'var(--amber)',      glow: true  },
  recovery:  { prefix: '[RECOVERY]',  color: 'var(--green)',      glow: true  },
  error:     { prefix: '[ERROR]',     color: 'var(--red)',        glow: true  },
  complete:  { prefix: '[COMPLETE]',  color: 'var(--green)',      glow: true  },
}

export default function AttackConsole({ logs }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  return (
    <div className="console-wrapper card scanline">
      <div className="card-header">
        <div className="card-header-title">ATTACK CONSOLE</div>
        <div className="console-controls">
          <span className="console-dot red"></span>
          <span className="console-dot amber"></span>
          <span className="console-dot green"></span>
        </div>
      </div>

      <div className="console-body" ref={containerRef}>
        {/* Boot header */}
        <div className="console-boot">
          <div className="text-dim">THREAT-SIM CONSOLE v1.0 // LIVE FEED</div>
          <div className="text-dim">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <div className="text-dim">Target: /home/user/ransomware_sim/sim_workspace/org_files/</div>
          <div className="text-dim">Mode: SIMULATION — No actual harm to host system</div>
          <div className="text-dim">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <br />
        </div>

        {/* Log entries */}
        {logs.map((log) => {
          const cfg = TYPE_CONFIG[log.type] || TYPE_CONFIG.log
          return (
            <div
              key={log.id}
              className={`console-line ${log.type === 'detection' || log.type === 'error' ? 'console-line-highlight' : ''}`}
              style={{ '--line-color': cfg.color }}
            >
              <span className="console-time">{log.time}</span>
              <span className="console-prefix" style={{ color: cfg.color }}>
                {cfg.prefix}
              </span>
              <span
                className="console-msg"
                style={{
                  color: cfg.color,
                  textShadow: cfg.glow ? `0 0 8px ${cfg.color}` : 'none'
                }}
              >
                {log.message}
              </span>
            </div>
          )
        })}

        {/* Blinking cursor */}
        <div className="console-cursor">
          <span className="text-dim">$&nbsp;</span>
          <span className="cursor-blink">█</span>
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
