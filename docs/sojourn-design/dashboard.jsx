// dashboard.jsx — Sojourn dashboard with annual days abroad + multi-city + manual entry
const { useState } = React;

function Dashboard({ role, goSearch }) {
  const M = window.MOCK;
  const [showPastModal, setShowPastModal] = useState(false);
  const me = role === 'main' ? M.accounts.main : M.accounts.assistant;

  const used = M.settings.annualDaysAbroad;
  const max  = M.settings.annualMax;
  const pct  = Math.min(100, (used / max) * 100);
  const remaining = max - used;
  const refDate = new Date(M.settings.referenceDate)
    .toLocaleDateString('en-GB',{ day:'numeric', month:'short', year:'numeric' });

  const totalCountries = new Set([...M.upcoming, ...M.past].map(t=>t.country)).size;
  const totalDays26 = [...M.upcoming, ...M.past]
    .filter(t => new Date(t.legs[0].departure_at).getFullYear() === 2026)
    .reduce((s,t)=>s + t.days_outside_uk, 0);
  const journeysThisYear = [...M.upcoming, ...M.past]
    .filter(t => new Date(t.legs[0].departure_at).getFullYear() === 2026).length;

  return (
    <div>
      {/* HERO */}
      <section className="hero">
        <div className="hero-text">
          <div className="hero-eyebrow">
            <span className="dot" />
            90-day rule · window ends {refDate}
          </div>
          <h1>Hello, <span className="accent">{me.displayName.split(' ')[0]}</span><br/>where to next?</h1>
          <p>Plan flights, log every day abroad, stay on the right side of the SRT — without spreadsheets.</p>
          <div className="hero-cta">
            <button className="btn btn-cta btn-lg" onClick={goSearch}>+ Plan a new trip</button>
            <button className="btn btn-lg btn-ghost-on-dark" onClick={()=>setShowPastModal(true)}>+ Log a past trip</button>
          </div>
        </div>
        <div className="days-card">
          <div className="label">Annual days abroad · till {refDate}</div>
          <div className="big">{used}<span className="of"> / {max}</span></div>
          <div className="meter"><div className="meter-fill" style={{width:`${pct}%`}} /></div>
          <div className="legend">
            <span>Used {Math.round(pct)}%</span>
            <span>{remaining} days remaining</span>
          </div>
        </div>
      </section>

      {/* QUICK STATS */}
      <section className="stats">
        <Stat tone="coral"    icon="✈"  label="Upcoming trips"   value={String(M.upcoming.length)} delta={`${M.upcoming.filter(t=>t.trip_type==='multi_city').length} multi-city`} />
        <Stat tone="mint"     icon="🌍" label="Countries · 2026" value={String(totalCountries)}     delta="3 continents" />
        <Stat tone="sky"      icon="∑"  label="Days abroad · 2026" value={`${totalDays26}/${M.settings.annualMax}`} delta={`max ${M.settings.annualMax} per rolling year`} />
        <Stat tone="lavender" icon="◷"  label="Journeys this year" value={String(journeysThisYear)} delta="upcoming + completed" />
      </section>

      {/* YEAR STRIP */}
      <section className="year-strip">
        <div className="year-strip-head">
          <h3 className="h3">2026 · A year in motion</h3>
          <span className="muted" style={{fontSize:13}}>{M.upcoming.length + M.past.length} trips logged · {totalDays26} days abroad</span>
        </div>
        <YearTrack />
      </section>

      {/* UPCOMING */}
      <div className="section-head">
        <h2 className="h2">Upcoming trips</h2>
        <div className="right">
          <span className="eyebrow">{M.upcoming.length} on the board</span>
        </div>
      </div>
      <div className="trips-grid">
        {M.upcoming.map(t => <TripCard key={t.id} t={t} />)}
        <button className="empty" onClick={goSearch} style={{cursor:'pointer'}}>
          <div style={{fontSize:36,marginBottom:6}}>+</div>
          <strong>Plan another trip</strong>
          <div style={{fontSize:13,marginTop:4}}>Round trip or multi-city</div>
        </button>
      </div>

      {/* PAST */}
      <div className="section-head">
        <h2 className="h2">Past trips</h2>
        <div className="right">
          <button className="btn btn-ghost btn-sm" onClick={()=>setShowPastModal(true)}>+ Add past trip</button>
          <span className="eyebrow" style={{marginLeft:10}}>{M.past.length} logged · {M.past.reduce((s,t)=>s+t.days_outside_uk,0)} days</span>
        </div>
      </div>
      <div className="past-list">
        {M.past.map(t => <PastRow key={t.id} t={t} />)}
      </div>

      {showPastModal && <AddPastTripModal onClose={()=>setShowPastModal(false)} />}
    </div>
  );
}

function Stat({tone, icon, label, value, delta}) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="ic">{icon}</div>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB',{ day:'2-digit', month:'short' }).toUpperCase();
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB',{ hour:'2-digit', minute:'2-digit' });
}
function legLabel(i, total, type) {
  if (type === 'round_trip') return i === 0 ? 'OUT' : 'RTN';
  return `L${i+1}`;
}

function TripCard({t}) {
  const isMulti = t.trip_type === 'multi_city';
  const isManual = t.source === 'manual';
  const first = t.legs[0], last = t.legs[t.legs.length-1];
  const editedBy = t.last_modified_by !== t.created_by ? t.last_modified_by : null;

  return (
    <article className="trip">
      <div className="trip-cover" style={{background: t.cover}}>
        <span className="label">
          {isMulti && <span className="trip-tag">{t.legs.length}-city</span>}
          {isManual && <span className="trip-tag manual">Manual</span>}
          {!isMulti && !isManual && t.tag}
        </span>
        <span className="days-pill">{t.days_outside_uk}d abroad</span>
        <span className="city">{t.flag} {t.city}</span>
      </div>
      <div className="trip-body">
        <div className="trip-route">
          {t.route.split(' → ').map((code, i, arr) => (
            <React.Fragment key={i}>
              <span>{code}</span>
              {i < arr.length-1 && <span className="arr">→</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="trip-meta">
          <span><strong>{fmtDate(first.departure_at)}</strong> – {fmtDate(last.departure_at)}</span>
          <span>{t.country}</span>
        </div>
        {isManual ? (
          <div className="trip-flights manual-note">
            <em>Manually added · flight details not recorded</em>
          </div>
        ) : (
          <div className="trip-flights">
            {t.legs.map((leg, i) => (
              <div className="leg" key={i}>
                <span className="badge">{legLabel(i, t.legs.length, t.trip_type)}</span>
                <span className="num">{leg.flight_number}</span>
                <span className="when">{fmtDate(leg.departure_at)} · {fmtTime(leg.departure_at)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="trip-foot">
          <span>Added by {t.created_by}{editedBy && <> · Edited by {editedBy}</>}</span>
          <span style={{color:'var(--blue-700)',fontWeight:700,cursor:'pointer'}}>Manage →</span>
        </div>
      </div>
    </article>
  );
}

function PastRow({t}) {
  const first = t.legs[0], last = t.legs[t.legs.length-1];
  const isMulti = t.trip_type === 'multi_city';
  return (
    <div className="past-row">
      <div className="swatch" style={{background: t.cover}}>
        <span>{t.flag}</span>
      </div>
      <div>
        <div className="route">
          {t.route.split(' → ').map((c,i,a)=>(
            <React.Fragment key={i}>
              <span className="code">{c}</span>
              {i<a.length-1 && <span className="sep">→</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="place">
          {t.city}, {t.country}
          {isMulti && <span className="micro-tag">multi</span>}
          {t.source==='manual' && <span className="micro-tag manual">manual</span>}
        </div>
      </div>
      <div className="when">
        <strong>{fmtDate(first.departure_at)} – {fmtDate(last.departure_at)}</strong>
        <small>{t.legs.map(l=>l.flight_number||'—').join(' · ')}</small>
      </div>
      <div className="when">
        <small>SAVED BY</small>
        {t.created_by}
      </div>
      <div className="days-cell">
        <span className="n">{t.days_outside_uk}</span>
        <span className="lbl">days</span>
      </div>
      <div className="right"><span className="chev">›</span></div>
    </div>
  );
}

function YearTrack() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const M = window.MOCK;
  const all = [...M.past, ...M.upcoming].filter(t => new Date(t.legs[0].departure_at).getFullYear() === 2026);
  const dayOfYear = (d) => {
    const date = new Date(d); const start = new Date(date.getFullYear(),0,0);
    return (date - start) / 86400000;
  };
  const today = new Date(); const todayPct = (dayOfYear(today)/365)*100;
  return (
    <div className="year-track">
      {months.map(m => <div key={m} className="year-month">{m}</div>)}
      {all.map((t,i) => {
        const start = (dayOfYear(t.legs[0].departure_at)/365)*100;
        const end   = (dayOfYear(t.legs[t.legs.length-1].departure_at)/365)*100;
        const w = Math.max(end-start, 1.4);
        const upcoming = new Date(t.legs[0].departure_at) > today;
        return (
          <div key={t.id} className="year-bar"
               title={`${t.route} · ${t.days_outside_uk}d`}
               style={{
                 left:`${start}%`, width:`${w}%`,
                 top: 22 + (i % 3) * 22,
                 background: t.cover,
                 opacity: upcoming ? 1 : .85,
               }}>
            {t.flag} {t.dest} · {t.days_outside_uk}d
          </div>
        );
      })}
      <div className="year-now" style={{left:`${todayPct}%`}} />
    </div>
  );
}

/* ─── Add past trip modal ───────────────────────────────────────── */
function AddPastTripModal({ onClose }) {
  const M = window.MOCK;
  const [from, setFrom] = useState('LHR');
  const [to, setTo] = useState('');
  const [dep, setDep] = useState('');
  const [ret, setRet] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const valid = from && to && dep && ret && ret > dep;
  const days = valid ? Math.max(0, Math.round((new Date(ret) - new Date(dep))/86400000) - 1) : 0;

  return (
    <div className="modal-shade" onMouseDown={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head">
          <h3>Add a past trip</h3>
          <p>For trips taken before Sojourn, or booked elsewhere. Flight details optional.</p>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="modal-row">
            <div className="modal-field">
              <label>From</label>
              <select value={from} onChange={e=>setFrom(e.target.value)}>
                {Object.entries(M.AIRPORTS).map(([code,info])=>(
                  <option key={code} value={code}>{code} · {info.city}</option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label>To</label>
              <select value={to} onChange={e=>setTo(e.target.value)}>
                <option value="">Choose destination…</option>
                {Object.entries(M.AIRPORTS).filter(([c])=>c!==from).map(([code,info])=>(
                  <option key={code} value={code}>{code} · {info.city}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-row">
            <div className="modal-field">
              <label>Departure date</label>
              <input type="date" max={yesterday} value={dep} onChange={e=>setDep(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Return date</label>
              <input type="date" max={today} min={dep || undefined} disabled={!dep} value={ret} onChange={e=>setRet(e.target.value)} />
            </div>
          </div>
          {valid && (
            <div className="modal-summary">
              <span>{from} → {to} → {from}</span>
              <strong>{days} day{days!==1?'s':''} outside UK</strong>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-cta" disabled={!valid} onClick={onClose}>Save trip ✓</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
