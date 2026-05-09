// timeline.jsx — Gantt-style timeline of all trips, 6 mo back / 6 mo forward
const { useState: useStateT } = React;

function Timeline() {
  const M = window.MOCK;
  const today = new Date();
  const months = [];
  for (let i = -6; i <= 5; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push(d);
  }
  const start = months[0];
  const end = new Date(months[months.length-1].getFullYear(), months[months.length-1].getMonth() + 1, 1);
  const totalMs = end - start;

  const allTrips = [...M.upcoming, ...M.past]
    .filter(t => {
      const d = new Date(t.legs[0].departure_at);
      return d >= start && d < end;
    })
    .sort((a,b) => new Date(a.legs[0].departure_at) - new Date(b.legs[0].departure_at));

  const upcomingCt = allTrips.filter(t => new Date(t.legs[0].departure_at) > today).length;
  const pastCt     = allTrips.length - upcomingCt;
  const countries  = new Set(allTrips.map(t => t.country)).size;

  const pct = (date) => ((new Date(date) - start) / totalMs) * 100;

  // Lay out trips into rows that don't overlap
  const rows = [];
  for (const t of allTrips) {
    const s = pct(t.legs[0].departure_at);
    const e = pct(t.legs[t.legs.length-1].departure_at);
    let placed = false;
    for (const row of rows) {
      const lastEnd = row[row.length-1].endPct;
      if (s > lastEnd + 2.5) {
        row.push({ trip: t, startPct: s, endPct: e });
        placed = true; break;
      }
    }
    if (!placed) rows.push([{ trip: t, startPct: s, endPct: e }]);
  }

  const todayPct = pct(today);
  const refDate = new Date(M.settings.referenceDate);

  const [hover, setHover] = useStateT(null);

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">12-month view · {start.toLocaleDateString('en-GB',{month:'short',year:'numeric'})} → {months[months.length-1].toLocaleDateString('en-GB',{month:'short',year:'numeric'})}</span>
          <h1 className="h1">Timeline</h1>
        </div>
        <div className="page-head-right">
          <button className="btn btn-ghost btn-sm">Export ical</button>
          <button className="btn btn-cta btn-sm">+ New trip</button>
        </div>
      </div>

      <section className="tl-stats">
        <Stat tone="coral"    icon="↗" label="Upcoming" value={String(upcomingCt)} delta="next 6 months" />
        <Stat tone="lavender" icon="↙" label="Past"     value={String(pastCt)}     delta="last 6 months" />
        <Stat tone="mint"     icon="🌍" label="Countries" value={String(countries)} delta="visited / planned" />
        <Stat tone="sky"      icon="∑" label="Annual days" value={`${M.settings.annualDaysAbroad}/${M.settings.annualMax}`} delta={`till ${refDate.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`} />
      </section>

      <section className="tl-card">
        <div className="tl-card-head">
          <h3>All trips · stacked by overlap</h3>
          <div className="tl-legend">
            <span className="dot upcoming" /> Upcoming
            <span className="dot past" /> Past
            <span className="dot today" /> Today
          </div>
        </div>

        <div className="tl-canvas">
          <div className="tl-months">
            {months.map((m, i) => {
              const left = (i / months.length) * 100;
              const isCurrent = m.getMonth()===today.getMonth() && m.getFullYear()===today.getFullYear();
              return (
                <div key={i} className={`tl-month ${isCurrent?'current':''}`} style={{left:`${left}%`,width:`${100/months.length}%`}}>
                  <span>{m.toLocaleDateString('en-GB',{month:'short'})}</span>
                  <small>{m.getFullYear() !== today.getFullYear() ? m.getFullYear() : ''}</small>
                </div>
              );
            })}
          </div>

          <div className="tl-rows" style={{height: rows.length * 56 + 16}}>
            {/* month grid lines */}
            {months.map((m,i) => (
              <div key={i} className="tl-grid" style={{left:`${(i/months.length)*100}%`}} />
            ))}
            {/* today line */}
            <div className="tl-today" style={{left:`${todayPct}%`}}>
              <div className="tl-today-flag">TODAY</div>
            </div>
            {/* trip bars */}
            {rows.map((row, r) => (
              row.map(({trip, startPct, endPct}) => {
                const isUpcoming = new Date(trip.legs[0].departure_at) > today;
                const w = Math.max(endPct - startPct, 1.6);
                return (
                  <div
                    key={trip.id}
                    className={`tl-bar ${isUpcoming?'upcoming':'past'} ${trip.trip_type==='multi_city'?'multi':''}`}
                    style={{
                      left:`${startPct}%`,
                      width:`${w}%`,
                      top: 8 + r * 56,
                      background: trip.cover,
                    }}
                    onMouseEnter={()=>setHover(trip.id)}
                    onMouseLeave={()=>setHover(null)}
                  >
                    <span className="flag">{trip.flag}</span>
                    <span className="route">{trip.route}</span>
                    <span className="days">{trip.days_outside_uk}d</span>
                    {trip.source==='manual' && <span className="manual-dot" title="Manually added">●</span>}
                    {hover===trip.id && (
                      <div className="tl-tooltip">
                        <div className="tt-route">{trip.flag} {trip.city}, {trip.country}</div>
                        <div className="tt-dates">
                          {new Date(trip.legs[0].departure_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                          {' – '}
                          {new Date(trip.legs[trip.legs.length-1].departure_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                        </div>
                        <div className="tt-meta">
                          {trip.trip_type==='multi_city' ? `${trip.legs.length}-city · ` : ''}
                          {trip.days_outside_uk} days outside UK
                          {trip.source==='manual' ? ' · manual' : ''}
                        </div>
                        <div className="tt-route" style={{fontFamily:'var(--mono)',fontSize:11,opacity:.85,marginTop:4}}>{trip.route}</div>
                      </div>
                    )}
                  </div>
                );
              })
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { Timeline });
