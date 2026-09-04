
export function WardrobePanel() {
  return (
    <section className="card metric-card wardrobe-panel">
      <div className="card-head">
        <h3>The Closet (Wardrobe Lock)</h3>
        <span className="metric-pill" title="Current outfit">LIVE</span>
      </div>
      <p className="card-hint">
        Tracks Scarlett's current physical state and outfit. Use the Veto/Roulette below to reject planned outfits before they hit the prompt.
      </p>
      
      <div className="wardrobe-content">
        <div className="outfit-display">
          <h4>Currently Wearing:</h4>
          <ul>
            <li>Loading from live-outfit.md...</li>
          </ul>
        </div>
        
        <div className="wardrobe-controls">
          <button className="veto-btn" disabled title="Detecting change beat...">
            🎲 Veto / Roulette Planned Outfit
          </button>
          <button className="lock-btn" disabled>
            🔒 Lock Specific Look
          </button>
        </div>
      </div>

      <style>{`
        .wardrobe-panel { border-left: 3px solid #8b5cf6; }
        .wardrobe-content { margin-top: 12px; }
        .outfit-display { background: #0f172a; padding: 12px; border-radius: 4px; border: 1px solid #1e293b; margin-bottom: 12px;}
        .outfit-display h4 { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; margin: 0 0 8px 0;}
        .outfit-display ul { margin: 0; padding-left: 16px; color: #cbd5e1; font-size: 0.85rem;}
        .wardrobe-controls { display: flex; gap: 8px; }
        .veto-btn, .lock-btn { flex: 1; padding: 8px; border: none; border-radius: 4px; font-weight: bold; cursor: not-allowed; opacity: 0.6; }
        .veto-btn { background: #8b5cf6; color: white; }
        .lock-btn { background: #334155; color: #cbd5e1; }
      `}</style>
    </section>
  );
}
