// landing.jsx — Sojourn public marketing page
function Landing({ goLogin }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <div className="logo">S</div>
          <span>Sojourn</span>
        </div>
        <nav className="landing-nav-links">
          <a href="#how">How it works</a>
          <a href="#assist">Assistants</a>
          <a href="#srt">90-day rule</a>
        </nav>
        <div className="landing-nav-cta">
          <button className="btn btn-ghost-on-dark btn-sm" onClick={goLogin}>Sign in</button>
          <button className="btn btn-cta btn-sm" onClick={goLogin}>Start free</button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-text">
          <span className="landing-eyebrow">⬢ A travel planner that respects the 90-day rule</span>
          <h1>
            Every trip.<br/>
            Every day abroad.<br/>
            <span className="accent">One quiet planner.</span>
          </h1>
          <p>
            Sojourn is the calmer way to plan flights, log past trips, and track how many days
            you've spent outside the UK — built for people whose calendar matters legally.
          </p>
          <div className="landing-hero-cta">
            <button className="btn btn-cta btn-lg" onClick={goLogin}>Start planning · free →</button>
            <a className="landing-link" onClick={goLogin}>Sign in to existing account →</a>
          </div>
          <div className="landing-trust">
            <span>· Built around the Statutory Residence Test</span>
            <span>· British Airways flights surfaced first</span>
            <span>· Read-only audit trail for every change</span>
          </div>
        </div>

        <div className="landing-hero-visual">
          <div className="float-card card-a">
            <div className="float-head">
              <div className="float-flag">🇫🇷</div>
              <div>
                <div className="float-title">LHR → CDG</div>
                <div className="float-sub">04 Jun · BA304</div>
              </div>
              <div className="float-days"><strong>4</strong><small>d</small></div>
            </div>
          </div>
          <div className="float-card card-b">
            <div className="float-head">
              <div className="float-flag">🇩🇪🇫🇷</div>
              <div>
                <div className="float-title">3-city · DUS · CDG</div>
                <div className="float-sub">03 Jul · multi-city</div>
              </div>
              <div className="float-days"><strong>7</strong><small>d</small></div>
            </div>
          </div>
          <div className="float-card card-c">
            <div className="float-head">
              <div className="float-flag">🇦🇪</div>
              <div>
                <div className="float-title">LHR → DXB</div>
                <div className="float-sub">22 Jul · EK0002</div>
              </div>
              <div className="float-days"><strong>13</strong><small>d</small></div>
            </div>
          </div>
          <div className="float-meter">
            <div className="float-meter-label">Annual days abroad</div>
            <div className="float-meter-num">73<span className="of">/90</span></div>
            <div className="float-meter-bar"><div style={{width:'81%'}} /></div>
            <div className="float-meter-foot">17 days remaining · till 5 Apr 2027</div>
          </div>
        </div>
      </section>

      <section className="landing-strip">
        <div>
          <strong>2,400+</strong>
          <span>days logged abroad</span>
        </div>
        <div>
          <strong>47</strong>
          <span>countries on the platform</span>
        </div>
        <div>
          <strong>90</strong>
          <span>day SRT cap, baked in</span>
        </div>
        <div>
          <strong>0</strong>
          <span>spreadsheets required</span>
        </div>
      </section>

      <section id="how" className="landing-features">
        <div className="lf-head">
          <span className="landing-eyebrow">⬢ How Sojourn works</span>
          <h2>Three things, done properly.</h2>
        </div>
        <div className="lf-grid">
          <div className="lf-card">
            <div className="lf-num">01</div>
            <h3>Plan a trip</h3>
            <p>Round-trip or multi-city up to three legs. Pick origins, destinations and morning-or-evening — we surface British Airways first, then everything else, side-by-side.</p>
            <div className="lf-mini">
              <div className="lf-pill on">Round trip</div>
              <div className="lf-pill">Multi-city · 3 legs</div>
            </div>
          </div>
          <div className="lf-card">
            <div className="lf-num">02</div>
            <h3>Log past trips</h3>
            <p>Whether booked elsewhere or taken before Sojourn, log every prior trip in seconds. Days outside the UK roll into your annual counter automatically.</p>
            <div className="lf-mini">
              <div className="lf-pill manual">Manual entry</div>
              <div className="lf-pill">Auto day-count</div>
            </div>
          </div>
          <div className="lf-card">
            <div className="lf-num">03</div>
            <h3>Stay under 90</h3>
            <p>Set your reference date once. We compute the rolling 12-month total and warn before you cross it — green, amber, or stop.</p>
            <div className="lf-mini">
              <div className="lf-pill on">73 / 90 days</div>
            </div>
          </div>
        </div>
      </section>

      <section id="assist" className="landing-assistants">
        <div className="la-text">
          <span className="landing-eyebrow">⬢ For people with people</span>
          <h2>Let your assistant do the planning.</h2>
          <p>
            Invite an assistant by email. They get their own login and book everything on your behalf —
            same trips, same counter, full audit trail. You stay in control; they save the time.
          </p>
          <ul className="la-list">
            <li><span className="check">✓</span> Read-only audit log of every change</li>
            <li><span className="check">✓</span> Switch between multiple principals from one account</li>
            <li><span className="check">✓</span> Unlink any time — no data is shared, only delegated</li>
          </ul>
        </div>
        <div className="la-visual">
          <div className="la-card">
            <div className="la-row main">
              <div className="avatar-big" style={{background:'#1a73d6'}}>Z</div>
              <div>
                <div className="la-name">Ziad Elsayed</div>
                <div className="la-mail">ziad@example.com</div>
              </div>
              <span className="role-pill main">Main</span>
            </div>
            <div className="la-divider">delegates to</div>
            <div className="la-row">
              <div className="avatar-big" style={{background:'#ec4ea0'}}>S</div>
              <div>
                <div className="la-name">Sara Hassan</div>
                <div className="la-mail">sara@example.com</div>
              </div>
              <span className="role-pill">Assistant</span>
            </div>
            <div className="la-row">
              <div className="avatar-big" style={{background:'#2bc28a'}}>M</div>
              <div>
                <div className="la-name">Maya Chen</div>
                <div className="la-mail">maya@example.com</div>
              </div>
              <span className="role-pill">Assistant</span>
            </div>
          </div>
        </div>
      </section>

      <section id="srt" className="landing-srt">
        <span className="landing-eyebrow">⬢ The 90-day rule, baked in</span>
        <h2>Why most spreadsheets get this wrong.</h2>
        <div className="srt-grid">
          <div className="srt-card">
            <div className="srt-h">Rolling, not calendar</div>
            <p>The SRT counts days in a moving 12-month window — not Jan-to-Dec. Sojourn rolls automatically every day.</p>
          </div>
          <div className="srt-card">
            <div className="srt-h">Inclusive of partial days</div>
            <p>Departure and arrival dates count. Our day-counter does the inclusive math so you don't have to.</p>
          </div>
          <div className="srt-card">
            <div className="srt-h">One source of truth</div>
            <p>Booked, manually-logged, assistant-added — every trip touches the same counter. No double-counting, no gaps.</p>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <h2>Plan your next trip without the maths.</h2>
        <p>Free to start. Add assistants when you need them.</p>
        <div className="landing-cta-row">
          <button className="btn btn-cta btn-lg" onClick={goLogin}>Start free →</button>
          <a className="landing-link" onClick={goLogin}>I already have an account</a>
        </div>
      </section>

      <footer className="landing-foot">
        <div className="landing-brand">
          <div className="logo small">S</div>
          <span>Sojourn</span>
        </div>
        <div className="landing-foot-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Status</a>
          <a href="#">hello@sojourn.travel</a>
        </div>
        <div className="landing-foot-credit">© 2026 Sojourn Ltd · Built for people on the move</div>
      </footer>
    </div>
  );
}

Object.assign(window, { Landing });
