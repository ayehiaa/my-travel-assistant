// search.jsx — Round-trip + Multi-city flight search
const { useState: useStateS } = React;

function Search({ goSummary }) {
  const M = window.MOCK;
  const [tripType, setTripType] = useStateS('round_trip');
  const [legs, setLegs] = useStateS([
    { from:'LHR', to:'JFK', date:'2026-05-18', slot:'morning' },
    { from:'JFK', to:'LHR', date:'2026-05-25', slot:'evening' },
  ]);

  const [searched, setSearched] = useStateS(false);
  const [selected, setSelected] = useStateS([null, null, null]);

  function setLeg(i, patch) {
    setLegs(prev => {
      const next = prev.map((l,idx) => idx===i ? { ...l, ...patch } : l);
      // Auto-fill: leg N origin = leg N-1 destination (multi-city)
      if (tripType === 'multi_city' && patch.to !== undefined) {
        for (let j = i+1; j < next.length; j++) {
          if (j === i+1) next[j] = { ...next[j], from: patch.to };
        }
      }
      return next;
    });
  }
  function addLeg() {
    if (legs.length >= 3) return;
    const last = legs[legs.length-1];
    setLegs([...legs, { from: last.to, to: legs[0].from, date:'', slot:'morning' }]);
  }
  function removeLeg(i) {
    setLegs(legs.filter((_,idx) => idx !== i));
  }
  function switchType(type) {
    setTripType(type);
    setSearched(false);
    setSelected([null, null, null]);
    if (type === 'round_trip') {
      setLegs([
        { from:'LHR', to:'JFK', date:'2026-05-18', slot:'morning' },
        { from:'JFK', to:'LHR', date:'2026-05-25', slot:'evening' },
      ]);
    } else {
      setLegs([
        { from:'LHR', to:'DUS', date:'2026-07-03', slot:'morning' },
        { from:'DUS', to:'CDG', date:'2026-07-07', slot:'evening' },
        { from:'CDG', to:'LHR', date:'2026-07-10', slot:'evening' },
      ]);
    }
  }

  function handleSearch(e) {
    e && e.preventDefault();
    setSearched(true);
    if (tripType === 'round_trip') {
      setSelected([M.outboundResults[0], M.returnResults[0]]);
    } else {
      // pick a default per leg
      setSelected(legs.map(()=> M.outboundResults[0]));
    }
  }

  const allLegsSelected = tripType === 'round_trip'
    ? selected[0] && selected[1]
    : legs.every((_, i) => selected[i]);

  const totalDays = legs.length
    ? Math.max(0, Math.round((new Date(legs[legs.length-1].date) - new Date(legs[0].date))/86400000))
    : 0;

  return (
    <div>
      <section className="search-hero">
        <h2>Where are you going?</h2>
        <p>Round-trip or multi-city · British Airways flights surface first.</p>

        <div className="trip-type-tabs">
          <button className={tripType==='round_trip'?'on':''} onClick={()=>switchType('round_trip')}>Round trip</button>
          <button className={tripType==='multi_city'?'on':''} onClick={()=>switchType('multi_city')}>Multi-city · up to 3 legs</button>
        </div>

        {tripType === 'round_trip' ? (
          <RoundTripBar legs={legs} setLeg={setLeg} onSubmit={handleSearch} />
        ) : (
          <MultiCityStack legs={legs} setLeg={setLeg} addLeg={addLeg} removeLeg={removeLeg} onSubmit={handleSearch} />
        )}
      </section>

      {!searched && (
        <div className="empty" style={{padding:60}}>
          <div style={{fontSize:48,marginBottom:8}}>✈</div>
          <strong style={{fontSize:18,color:'var(--ink)'}}>
            {tripType==='round_trip' ? 'Pick a route, hit search' : `Add ${legs.length<3?'up to 3':'your 3'} legs, hit search`}
          </strong>
          <div style={{marginTop:6}}>
            {tripType==='round_trip'
              ? 'Outbound on the left, return on the right.'
              : 'One column per leg — pick a flight for each.'}
          </div>
        </div>
      )}

      {searched && (
        <>
          <ResultsGrid legs={legs} selected={selected} setSelected={setSelected} tripType={tripType} />
          {allLegsSelected && (
            <TripSummary legs={legs} selected={selected} tripType={tripType}
                         totalDays={totalDays} goSummary={goSummary} />
          )}
        </>
      )}
    </div>
  );
}

function RoundTripBar({ legs, setLeg, onSubmit }) {
  const M = window.MOCK;
  const [out, ret] = legs;
  const days = Math.max(1, Math.round((new Date(ret.date) - new Date(out.date))/86400000));
  return (
    <>
      <form className="search-bar" onSubmit={onSubmit}>
        <AirportField label="From" value={out.from} onChange={v=>setLeg(0,{from:v, })} />
        <AirportField label="To"   value={out.to}   onChange={v=>{setLeg(0,{to:v}); setLeg(1,{from:v});}} />
        <DateField    label="Depart" value={out.date} onChange={v=>setLeg(0,{date:v})} />
        <DateField    label="Return" value={ret.date} onChange={v=>setLeg(1,{date:v})} sub={`${days}d`} />
        <button type="submit" className="btn btn-cta btn-lg">Search →</button>
      </form>
      <div className="slot-toggles">
        <SlotPills label="Outbound" value={out.slot} onChange={v=>setLeg(0,{slot:v})} />
        <SlotPills label="Return"   value={ret.slot} onChange={v=>setLeg(1,{slot:v})} />
      </div>
    </>
  );
}

function MultiCityStack({ legs, setLeg, addLeg, removeLeg, onSubmit }) {
  return (
    <form className="multi-stack" onSubmit={onSubmit}>
      {legs.map((leg, i) => (
        <div className="multi-row" key={i}>
          <div className="multi-row-head">
            <span className="leg-tag">Leg {i+1}</span>
            {i >= 1 && (
              <button type="button" className="multi-x" onClick={()=>removeLeg(i)}>×</button>
            )}
          </div>
          <AirportField compact label="From" value={leg.from} onChange={v=>setLeg(i,{from:v})} />
          <span className="leg-arrow">→</span>
          <AirportField compact label="To"   value={leg.to}   onChange={v=>setLeg(i,{to:v})} />
          <DateField    compact label="Date" value={leg.date} onChange={v=>setLeg(i,{date:v})} />
          <SlotPills    inline  label="Time" value={leg.slot} onChange={v=>setLeg(i,{slot:v})} />
        </div>
      ))}
      <div className="multi-actions">
        {legs.length < 3 ? (
          <button type="button" className="add-leg" onClick={addLeg}>+ Add leg</button>
        ) : <span className="muted" style={{fontSize:12}}>Maximum 3 legs</span>}
        <button type="submit" className="btn btn-cta btn-lg">Search all legs →</button>
      </div>
    </form>
  );
}

function AirportField({ label, value, onChange, compact }) {
  const M = window.MOCK;
  const info = M.airport(value);
  return (
    <label className={`search-field ${compact?'compact':''}`}>
      <span className="lbl">{label}</span>
      <select value={value} onChange={e=>onChange(e.target.value)}>
        {Object.entries(M.AIRPORTS).map(([code,info])=>(
          <option key={code} value={code}>{code} · {info.city}</option>
        ))}
      </select>
      <span className="sub">{info.flag} {info.city}, {info.country}</span>
    </label>
  );
}

function DateField({ label, value, onChange, compact, sub }) {
  return (
    <label className={`search-field ${compact?'compact':''}`}>
      <span className="lbl">{label}</span>
      <input type="date" value={value} onChange={e=>onChange(e.target.value)} />
      <span className="sub">{value ? new Date(value).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : 'Pick a date'} {sub && `· ${sub}`}</span>
    </label>
  );
}

function SlotPills({ label, value, onChange, inline }) {
  return (
    <div className={`slot-group ${inline?'inline':''}`}>
      <span style={{opacity:.85}}>{label}</span>
      <div className="slot-pills">
        <button type="button" className={value==='morning'?'on':''} onClick={()=>onChange('morning')}>AM · 06–13</button>
        <button type="button" className={value==='evening'?'on':''} onClick={()=>onChange('evening')}>PM · 13–24</button>
      </div>
    </div>
  );
}

/* ─── Results ─────────────────────────────────────────────────── */
function ResultsGrid({ legs, selected, setSelected, tripType }) {
  const M = window.MOCK;
  const cols = tripType === 'round_trip' ? 2 : legs.length;
  const titles = tripType === 'round_trip'
    ? ['Outbound','Return']
    : legs.map((_,i)=>`Leg ${i+1}`);
  const colors = ['var(--blue-700)','var(--coral)','var(--lavender)'];
  return (
    <div className="results-grid" style={{gridTemplateColumns:`repeat(${cols},1fr)`}}>
      {legs.map((leg, i) => {
        const results = (i % 2 === 0) ? M.outboundResults : M.returnResults;
        return (
          <div className="results-col" key={i}>
            <div className="results-col-meta">
              <h3 style={{color: colors[i % colors.length]}}>
                {titles[i]} · <span style={{fontFamily:'var(--mono)',fontSize:13,fontWeight:500,color:'var(--ink-3)'}}>{leg.from} → {leg.to}</span>
              </h3>
              <span>{results.length} flights · BA priority</span>
            </div>
            <div className="results-list">
              {results.map(o => (
                <Flight key={o.id} f={o}
                        selected={selected[i]?.id===o.id}
                        onClick={()=>{
                          const next = [...selected]; next[i] = o;
                          setSelected(next);
                        }}
                        from={leg.from} to={leg.to}/>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Flight({ f, selected, onClick, from, to }) {
  return (
    <div className={`flight ${selected?'selected':''}`} onClick={onClick}>
      <div className="flight-head">
        <div className="flight-airline">
          <div className="logo" style={{background: f.color}}>{f.code}</div>
          <div>
            <div className="name">
              <span>{f.name}</span>
              {f.isBA && <span className="ba-pill">BA Priority</span>}
            </div>
            <div className="num">{f.flt}</div>
          </div>
        </div>
        <div className="flight-price">£{f.price}</div>
      </div>
      <div className="flight-times">
        <span className="t tabular">{f.dep}</span>
        <div className="line"><span className="dot" /></div>
        <span className="t tabular">{f.arr}</span>
      </div>
      <div className="flight-meta">
        <span>{from}</span>
        <span className="center">{f.dur} · {f.stops}</span>
        <span className="right">{to}</span>
      </div>
    </div>
  );
}

/* ─── Trip Summary (review) ───────────────────────────────────── */
function TripSummary({ legs, selected, tripType, totalDays, goSummary }) {
  const M = window.MOCK;
  const route = [...legs.map(l=>l.from), legs[legs.length-1].to].join(' → ');
  const cities = [...legs.map(l=>M.airport(l.from).city), M.airport(legs[legs.length-1].to).city].join(' → ');
  const totalPrice = selected.filter(Boolean).reduce((s,f)=>s+f.price, 0);
  const newAnnual = M.settings.annualDaysAbroad + totalDays;

  return (
    <section className="summary-card">
      <div className="summary-head">
        <div className="summary-route">
          {legs[0].from} <span className="arr">→</span> {legs[legs.length-1].to}
          <div className="cities">{cities} · {tripType === 'round_trip' ? 'round trip' : `${legs.length}-city itinerary`}</div>
        </div>
        <div className="summary-days">
          <div className="label">Days outside UK</div>
          <div className="num">{totalDays}</div>
          <div className="sub">Annual will become {newAnnual} / {M.settings.annualMax}</div>
        </div>
      </div>
      <div className="summary-legs" style={{gridTemplateColumns:`repeat(${legs.length},1fr)`}}>
        {legs.map((leg, i) => {
          const f = selected[i]; if (!f) return null;
          const label = tripType==='round_trip'
            ? (i===0 ? 'Outbound' : 'Return')
            : `Leg ${i+1}`;
          return (
            <div className="summary-leg" key={i}>
              <div className="head">{label} · {fmtLong(leg.date)}</div>
              <div className="when">{f.dep} → {f.arr}</div>
              <div className="flt">{f.flt}<small> · {f.name}</small></div>
              <div className="route-mini">{leg.from} → {leg.to}</div>
            </div>
          );
        })}
      </div>
      <div className="summary-foot">
        <div style={{fontSize:13,color:'var(--ink-3)'}}>
          Total · <strong style={{color:'var(--ink)',fontFamily:'var(--display)',fontSize:18}}>£{totalPrice}</strong> &nbsp; · &nbsp; Saved by Ziad · {tripType==='multi_city'?'multi-city':'round-trip'}
        </div>
        <button className="btn btn-cta btn-lg" onClick={goSummary}>Save to my trips ✓</button>
      </div>
    </section>
  );
}

function fmtLong(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB',{ day:'numeric', month:'short', year:'numeric' });
}

Object.assign(window, { Search });
