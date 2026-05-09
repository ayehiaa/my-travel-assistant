import Link from 'next/link'

export default function LandingPage() {
  return (
    <div style={{
      background: `
        radial-gradient(1100px 600px at 80% -10%, rgba(255,180,0,.18), transparent 60%),
        radial-gradient(900px 700px at -10% 90%, rgba(255,111,94,.18), transparent 55%),
        linear-gradient(180deg, #050d24 0%, #0a1f4d 100%)
      `,
      color: 'white',
      minHeight: '100vh',
      fontFamily: 'var(--sans)',
    }}>

      {/* ── Nav ── */}
      <header style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22 }}>
          <div style={{ width: 36, height: 36, background: 'var(--yellow)', color: 'var(--blue-900)', borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 800, transform: 'rotate(-6deg)', fontSize: 20 }}>S</div>
          Sojourn
        </div>
        <nav style={{ display: 'inline-flex', gap: 28, fontSize: 14, opacity: 0.85 }}>
          <a href="#how" style={{ cursor: 'pointer' }} className="hover:text-[--yellow] transition-colors">How it works</a>
          <a href="#assist" style={{ cursor: 'pointer' }} className="hover:text-[--yellow] transition-colors">Assistants</a>
          <a href="#srt" style={{ cursor: 'pointer' }} className="hover:text-[--yellow] transition-colors">90-day rule</a>
        </nav>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <Link href="/login" style={{ background: 'rgba(255,255,255,.1)', color: 'white', border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }} className="hover:bg-white/20 transition-colors">
            Sign in
          </Link>
          <Link href="/login" style={{ background: 'var(--yellow)', color: 'var(--blue-900)', boxShadow: '0 2px 0 #d99500', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }} className="hover:brightness-110 transition-all">
            Start free
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '60px 48px 80px', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 60, alignItems: 'center' }}>
        {/* Left */}
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 999, padding: '6px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.85)', marginBottom: 20 }}>
            ⬢ A travel planner that respects the 90-day rule
          </span>
          <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(48px,6vw,84px)', lineHeight: 1.0, letterSpacing: '-0.03em', margin: '0 0 22px' }}>
            Every trip.<br />
            Every day abroad.<br />
            <span style={{ color: 'var(--yellow)' }}>One quiet planner.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, opacity: 0.85, maxWidth: '50ch', margin: '0 0 28px' }}>
            Sojourn is the calmer way to plan flights, log past trips, and track how many days
            you&apos;ve spent outside the UK — built for people whose calendar matters legally.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <Link href="/login" style={{ background: 'var(--yellow)', color: 'var(--blue-900)', boxShadow: '0 2px 0 #d99500', borderRadius: 14, padding: '16px 24px', fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }} className="hover:brightness-110 transition-all">
              Start planning · free →
            </Link>
            <Link href="/login" style={{ fontSize: 14, fontWeight: 700, color: 'var(--yellow)' }} className="hover:text-white transition-colors">
              Sign in to existing account →
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 36, fontSize: 12, opacity: 0.65 }}>
            <span>· Built around the Statutory Residence Test</span>
            <span>· British Airways flights surfaced first</span>
            <span>· Read-only audit trail for every change</span>
          </div>
        </div>

        {/* Right — floating cards */}
        <div style={{ position: 'relative', height: 480 }}>
          {/* Card A */}
          <div style={{ position: 'absolute', top: 20, left: 20, transform: 'rotate(-3deg)', background: 'rgba(255,255,255,.96)', color: 'var(--ink)', borderRadius: 20, padding: '16px 18px', width: 280, boxShadow: '0 24px 60px -10px rgba(0,0,0,.4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 26 }}>🇫🇷</span>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>LHR → CDG</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>04 Jun · BA304</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1, letterSpacing: '-0.02em' }}>4</strong>
                <small style={{ color: 'var(--ink-3)', fontSize: 11 }}>d</small>
              </div>
            </div>
          </div>
          {/* Card B */}
          <div style={{ position: 'absolute', top: 130, right: 0, transform: 'rotate(2deg)', background: 'linear-gradient(135deg,white,var(--yellow-soft))', color: 'var(--ink)', borderRadius: 20, padding: '16px 18px', width: 290, boxShadow: '0 24px 60px -10px rgba(0,0,0,.4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 26 }}>🇩🇪🇫🇷</span>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>3-city · DUS · CDG</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>03 Jul · multi-city</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1, letterSpacing: '-0.02em' }}>7</strong>
                <small style={{ color: 'var(--ink-3)', fontSize: 11 }}>d</small>
              </div>
            </div>
          </div>
          {/* Card C */}
          <div style={{ position: 'absolute', top: 260, left: 60, transform: 'rotate(-1deg)', background: 'rgba(255,255,255,.96)', color: 'var(--ink)', borderRadius: 20, padding: '16px 18px', width: 280, boxShadow: '0 24px 60px -10px rgba(0,0,0,.4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 26 }}>🇦🇪</span>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>LHR → DXB</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>22 Jul · EK0002</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1, letterSpacing: '-0.02em' }}>13</strong>
                <small style={{ color: 'var(--ink-3)', fontSize: 11 }}>d</small>
              </div>
            </div>
          </div>
          {/* Meter card */}
          <div style={{ position: 'absolute', bottom: 0, right: 30, transform: 'rotate(2deg)', background: 'var(--ink)', color: 'white', borderRadius: 20, padding: '16px 20px', width: 260, boxShadow: '0 24px 60px -10px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 4 }}>Annual days abroad</div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 42, lineHeight: 1, letterSpacing: '-0.03em' }}>
              73<span style={{ fontSize: 18, opacity: 0.5, fontWeight: 500 }}>/90</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.18)', overflow: 'hidden', margin: '10px 0 6px' }}>
              <div style={{ height: '100%', width: '81%', background: 'linear-gradient(90deg,var(--mint),var(--yellow) 70%,var(--coral))' }} />
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>17 days remaining · till 5 Apr 2027</div>
          </div>
        </div>
      </section>

      {/* ── Stat strip ── */}
      <div style={{ background: 'rgba(0,0,0,.25)', borderTop: '1px solid rgba(255,255,255,.1)', borderBottom: '1px solid rgba(255,255,255,.1)', padding: '28px 48px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, textAlign: 'center' }}>
          {[
            { value: '2,400+', label: 'days logged abroad' },
            { value: '47',     label: 'countries on the platform' },
            { value: '90',     label: 'day SRT cap, baked in' },
            { value: '0',      label: 'spreadsheets required' },
          ].map(s => (
            <div key={s.label}>
              <strong style={{ display: 'block', fontFamily: 'var(--display)', fontWeight: 700, fontSize: 36, letterSpacing: '-0.02em', color: 'var(--yellow)' }}>{s.value}</strong>
              <span style={{ fontSize: 13, opacity: 0.7 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <section id="how" style={{ maxWidth: 1280, margin: '0 auto', padding: '90px 48px' }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>⬢ How Sojourn works</span>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(36px,4vw,56px)', letterSpacing: '-0.025em', margin: '16px 0 0' }}>Three things, done properly.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {[
            {
              num: '01', title: 'Plan a trip',
              body: 'Round-trip or multi-city up to three legs. Pick origins, destinations and morning-or-evening — we surface British Airways first, then everything else, side-by-side.',
              pills: [{ label: 'Round trip', on: true }, { label: 'Multi-city · 3 legs', on: false }],
            },
            {
              num: '02', title: 'Log past trips',
              body: 'Whether booked elsewhere or taken before Sojourn, log every prior trip in seconds. Days outside the UK roll into your annual counter automatically.',
              pills: [{ label: 'Manual entry', on: false, manual: true }, { label: 'Auto day-count', on: false }],
            },
            {
              num: '03', title: 'Stay under 90',
              body: 'Set your reference date once. We compute the rolling 12-month total and warn before you cross it — green, amber, or stop.',
              pills: [{ label: '73 / 90 days', on: true }],
            },
          ].map(card => (
            <div key={card.num} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 20, padding: '28px 26px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: -12, right: 22, background: 'var(--yellow)', color: 'var(--blue-900)', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999, letterSpacing: '0.06em' }}>{card.num}</span>
              <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', margin: '0 0 10px' }}>{card.title}</h3>
              <p style={{ color: 'rgba(255,255,255,.72)', fontSize: 14, lineHeight: 1.55, margin: '0 0 18px' }}>{card.body}</p>
              <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {card.pills.map(p => (
                  <span key={p.label} style={{
                    background: p.on ? 'var(--yellow)' : p.manual ? 'var(--lavender-soft)' : 'rgba(255,255,255,.06)',
                    color: p.on ? 'var(--blue-900)' : p.manual ? 'var(--lavender)' : 'inherit',
                    border: `1px solid ${p.on ? 'var(--yellow)' : p.manual ? 'var(--lavender)' : 'rgba(255,255,255,.14)'}`,
                    borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 600,
                  }}>{p.label}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Assistants ── */}
      <section id="assist" style={{ maxWidth: 1280, margin: '0 auto', padding: '60px 48px 90px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>⬢ For people with people</span>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(36px,4vw,56px)', letterSpacing: '-0.025em', margin: '16px 0' }}>Let your assistant do the planning.</h2>
          <p style={{ color: 'rgba(255,255,255,.78)', fontSize: 16, lineHeight: 1.55, marginBottom: 22, maxWidth: '50ch' }}>
            Invite an assistant by email. They get their own login and book everything on your behalf —
            same trips, same counter, full audit trail. You stay in control; they save the time.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Read-only audit log of every change', 'Switch between multiple principals from one account', 'Unlink any time — no data is shared, only delegated'].map(item => (
              <li key={item} style={{ fontSize: 14, opacity: 0.9 }}>
                <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--mint)', color: 'white', fontSize: 11, fontWeight: 800, marginRight: 10 }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: 'rgba(255,255,255,.96)', color: 'var(--ink)', borderRadius: 28, padding: 24, boxShadow: '0 30px 80px -10px rgba(0,0,0,.5)' }}>
          {[
            { initial: 'Z', bg: '#1a73d6', name: 'Ziad Elsayed', email: 'ziad@example.com', role: 'Main', isMain: true },
            { initial: 'S', bg: '#ec4ea0', name: 'Sara Hassan',  email: 'sara@example.com',  role: 'Assistant', isMain: false },
            { initial: 'M', bg: '#2bc28a', name: 'Maya Chen',   email: 'maya@example.com',  role: 'Assistant', isMain: false },
          ].map((row, i) => (
            <div key={row.name}>
              {i === 1 && (
                <div style={{ textAlign: 'center', padding: '10px 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)', position: 'relative' }}>
                  <span style={{ position: 'relative', zIndex: 1, background: 'white', padding: '0 8px' }}>delegates to</span>
                  <div style={{ position: 'absolute', top: '50%', left: 12, right: 12, height: 1, background: 'var(--rule)' }} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: 12, background: row.isMain ? 'var(--blue-100)' : 'var(--paper-2)', border: `1px solid ${row.isMain ? 'var(--blue-500)' : 'var(--rule)'}`, borderRadius: 14, marginTop: i > 1 ? 8 : 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: row.bg, color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, fontFamily: 'var(--display)' }}>{row.initial}</div>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16 }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{row.email}</div>
                </div>
                <span style={{ background: row.isMain ? 'var(--blue-100)' : 'var(--paper-3)', color: row.isMain ? 'var(--blue-700)' : 'var(--ink-2)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 999, textTransform: 'uppercase' }}>{row.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 90-day rule ── */}
      <section id="srt" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 48px 90px', textAlign: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>⬢ The 90-day rule, baked in</span>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(36px,4vw,56px)', letterSpacing: '-0.025em', margin: '16px 0 40px' }}>Why most spreadsheets get this wrong.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, textAlign: 'left' }}>
          {[
            { title: 'Rolling, not calendar', body: 'The SRT counts days in a moving 12-month window — not Jan-to-Dec. Sojourn rolls automatically every day.' },
            { title: 'Inclusive of partial days', body: 'Departure and arrival dates count. Our day-counter does the inclusive math so you don\'t have to.' },
            { title: 'One source of truth', body: 'Booked, manually-logged, assistant-added — every trip touches the same counter. No double-counting, no gaps.' },
          ].map(card => (
            <div key={card.title} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 20, padding: 24 }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', marginBottom: 10, color: 'var(--yellow)' }}>{card.title}</div>
              <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA block ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 48px 60px' }}>
        <div style={{ background: 'linear-gradient(135deg,var(--yellow),var(--coral))', color: 'var(--blue-900)', borderRadius: 28, padding: '60px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', width: 400, height: 400, right: -100, bottom: -200, background: 'radial-gradient(circle,rgba(10,31,77,.15),transparent 60%)', borderRadius: '50%' }} />
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(36px,4.5vw,60px)', letterSpacing: '-0.025em', margin: '0 0 12px', position: 'relative', zIndex: 2 }}>
            Plan your next trip without the maths.
          </h2>
          <p style={{ fontSize: 16, opacity: 0.8, margin: '0 0 28px', position: 'relative', zIndex: 2 }}>
            Free to start. Add assistants when you need them.
          </p>
          <div style={{ display: 'inline-flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
            <Link href="/login" style={{ background: 'var(--blue-900)', color: 'var(--yellow)', boxShadow: '0 2px 0 #050d24', borderRadius: 14, padding: '16px 24px', fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }} className="hover:bg-[--ink] transition-colors">
              Start free →
            </Link>
            <Link href="/login" style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue-900)' }} className="hover:opacity-70 transition-opacity">
              I already have an account
            </Link>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ maxWidth: 1280, margin: '0 auto', padding: '30px 48px 50px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 30, alignItems: 'center', borderTop: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18 }}>
          <div style={{ width: 28, height: 28, background: 'var(--yellow)', color: 'var(--blue-900)', borderRadius: 8, display: 'grid', placeItems: 'center', fontWeight: 800, transform: 'rotate(-6deg)', fontSize: 14 }}>S</div>
          Sojourn
        </div>
        <div style={{ display: 'inline-flex', gap: 24, justifyContent: 'center', fontSize: 13, opacity: 0.8 }}>
          {['Privacy', 'Terms', 'Status', 'hello@sojourn.travel'].map(l => (
            <a key={l} href="#" style={{ cursor: 'pointer' }} className="hover:text-[--yellow] transition-colors">{l}</a>
          ))}
        </div>
        <div style={{ fontSize: 12, opacity: 0.55 }}>© {new Date().getFullYear()} Sojourn Ltd · Built for people on the move</div>
      </footer>
    </div>
  )
}
