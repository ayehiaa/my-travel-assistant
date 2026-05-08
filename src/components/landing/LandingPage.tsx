import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Sticky nav ──────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <span className="text-white font-semibold text-lg tracking-tight">Sojourn</span>
          <Link
            href="/login"
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="bg-slate-950 pt-36 pb-28 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-10 flex justify-center">
            <img
              src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1000&q=80"
              alt="Airplane in flight"
              className="w-full max-w-2xl rounded-2xl object-cover ring-1 ring-white/10 shadow-2xl shadow-blue-900/40"
              style={{ aspectRatio: '2/1' }}
            />
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.08] mb-6">
            Your trusted<br />
            <span className="text-blue-400">travel tracker</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Track every day you spend outside the UK — without the spreadsheets.
          </p>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors text-base shadow-lg shadow-blue-900/40"
          >
            Get started
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>

        {/* Stat strip */}
        <div className="max-w-2xl mx-auto mt-20 grid grid-cols-3 gap-4">
          {[
            { value: '183', label: 'Days abroad' },
            { value: '5', label: 'Countries visited' },
            { value: '3', label: 'Legs per trip' },
          ].map(s => (
            <div key={s.label} className="text-center bg-slate-900 border border-slate-800 rounded-xl px-4 py-5">
              <div className="text-3xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature 1: Days counter ──────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-3">Residence tracking</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-5 leading-tight">
              Always know your SRT position
            </h2>
            <p className="text-gray-500 text-lg leading-relaxed mb-8">
              Sojourn automatically calculates your days outside the UK for every trip and keeps a running total — so you&apos;re never caught off guard at tax time.
            </p>
            <ul className="space-y-3.5">
              {[
                'Automatic day count per trip and in total',
                'Annual total benchmarked against your reference date',
                'Upcoming and past trips in one dashboard',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-gray-700">
                  <span className="mt-0.5 shrink-0 w-5 h-5 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Mockup */}
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">Days outside UK</span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">2025</span>
                </div>
                <div className="flex items-end gap-3 mb-3">
                  <span className="text-5xl font-bold text-gray-900">42</span>
                  <span className="text-gray-400 mb-1.5 text-sm">/ 183 days</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '23%' }} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-gray-400">
                  <span>23% used</span>
                  <span>141 remaining</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Upcoming trips', value: '3' },
                  { label: 'Past trips', value: '7' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div className="text-xs text-gray-400 mb-1">{s.label}</div>
                    <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs text-gray-400 mb-2">Upcoming</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-900">LHR → FCO</span>
                  <span className="text-gray-500">15 Jun — 22 Jun</span>
                  <span className="text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded">7d</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 2: Flight search ─────────────────────────────────────── */}
      <section className="py-24 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Mockup */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm order-2 lg:order-1">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">From</div>
                  <div className="font-semibold text-gray-900 text-sm">LHR · London Heathrow</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">To</div>
                  <div className="font-semibold text-gray-900 text-sm">CDG · Paris Charles de Gaulle</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Departure</div>
                  <div className="font-semibold text-gray-900 text-sm">15 Jun 2025</div>
                </div>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                  <div className="flex-1 py-3 text-center bg-blue-600 text-white font-medium">Morning</div>
                  <div className="flex-1 py-3 text-center text-gray-400 bg-gray-50">Evening</div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-2">
                {[
                  { code: 'BA304', time: '07:15 → 09:35', price: '£189', isBA: true, selected: true },
                  { code: 'AF1281', time: '09:00 → 11:20', price: '£142', isBA: false, selected: false },
                  { code: 'EZ8823', time: '11:45 → 14:05', price: '£98', isBA: false, selected: false },
                ].map(f => (
                  <div
                    key={f.code}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      f.selected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-semibold text-gray-900 text-sm">{f.code}</span>
                        {f.isBA && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">BA</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{f.time}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 text-sm">{f.price}</div>
                      {f.selected && <div className="text-[10px] text-blue-600 font-medium">Selected ✓</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-3">Flight search</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-5 leading-tight">
              Search flights, log trips in one flow
            </h2>
            <p className="text-gray-500 text-lg leading-relaxed mb-8">
              Search live flight data, pick your preferred option, and save the trip — all without leaving the app. British Airways preference and time-slot filtering built in.
            </p>
            <ul className="space-y-3.5">
              {[
                'Live flight data via Google Flights',
                'Morning and evening time-slot filtering',
                'British Airways flights highlighted automatically',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-gray-700">
                  <span className="mt-0.5 shrink-0 w-5 h-5 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Feature 3: Timeline ──────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-slate-950">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Visual timeline</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-5 leading-tight">
              See your whole year at a glance
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              A 12-month visual timeline shows every trip as a bar — past trips faded, upcoming highlighted. Hover any bar for full trip details.
            </p>
            <ul className="space-y-3.5">
              {[
                '6 months back and 6 months forward',
                'Country flags colour-coded per destination',
                'Annual days abroad vs your reference date',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-slate-300">
                  <span className="mt-0.5 shrink-0 w-5 h-5 bg-slate-800 text-blue-400 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Timeline mockup */}
          <div className="bg-[#1e2130] border border-[#2d3348] rounded-2xl p-6">
            {/* Month headers */}
            <div className="flex mb-5 ml-20 text-[0.6rem] font-semibold uppercase tracking-widest text-slate-600">
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map(m => (
                <div key={m} className="flex-1 text-center">{m}</div>
              ))}
            </div>

            {/* Bars */}
            <div className="space-y-3">
              {[
                { label: 'LHR → DUS', flag: '🇩🇪', left: '4%',  width: '13%', past: true },
                { label: 'LHR → CDG', flag: '🇫🇷', left: '28%', width: '10%', past: true },
                { label: 'LHR → FCO', flag: '🇮🇹', left: '52%', width: '16%', past: false },
                { label: 'LHR → MAD', flag: '🇪🇸', left: '76%', width: '13%', past: false },
              ].map(bar => (
                <div key={bar.label} className="flex items-center h-9">
                  <div className="w-20 text-right pr-3 text-xs font-semibold text-slate-500 truncate">{bar.label}</div>
                  <div className="relative flex-1 h-9">
                    <div
                      className="absolute top-0.5 h-8 rounded-lg flex items-center justify-center"
                      style={{
                        left: bar.left,
                        width: bar.width,
                        border: `1.5px solid ${bar.past ? '#475569' : '#94a3b8'}`,
                        opacity: bar.past ? 0.45 : 1,
                        minWidth: 32,
                      }}
                    >
                      <span className="text-base leading-none select-none">{bar.flag}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Today indicator */}
            <div className="mt-5 pt-4 border-t border-[#2d3348] flex items-center gap-2.5 text-xs text-slate-500">
              <div className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
              <span>Today — 15 Mar 2025</span>
              <span className="ml-auto text-slate-600">4 countries visited</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 4: Multi-city ────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Mockup */}
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="space-y-3">
              {[
                { leg: 'Leg 1', from: 'LHR', to: 'DUS', date: '3 Jul 2025', flag: '🇩🇪', home: false },
                { leg: 'Leg 2', from: 'DUS', to: 'CDG', date: '7 Jul 2025', flag: '🇫🇷', home: false },
                { leg: 'Leg 3', from: 'CDG', to: 'LHR', date: '10 Jul 2025', flag: '🇬🇧', home: true },
              ].map(leg => (
                <div key={leg.leg} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{leg.leg}</span>
                    {leg.home && (
                      <span className="text-[10px] bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full font-semibold">↩ Home</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">{leg.from}</span>
                    <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span className="text-lg font-bold text-gray-900">{leg.to}</span>
                    <span className="text-xl ml-0.5">{leg.flag}</span>
                    <span className="ml-auto text-sm text-gray-400">{leg.date}</span>
                  </div>
                </div>
              ))}

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                <div className="text-sm font-bold text-blue-900 tracking-wide">LHR → DUS → CDG → LHR</div>
                <div className="text-xs text-blue-500 mt-0.5 font-medium">7 days outside UK · 2 countries</div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-3">Multi-city trips</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-5 leading-tight">
              Complex itineraries, handled properly
            </h2>
            <p className="text-gray-500 text-lg leading-relaxed mb-8">
              Log trips like LHR → DUS → CDG → LHR as a single multi-city itinerary. Sojourn tracks every leg, auto-fills connections, and calculates total days correctly.
            </p>
            <ul className="space-y-3.5">
              {[
                'Up to 3 legs per trip',
                'Next leg origin auto-filled from previous destination',
                'Return leg auto-fills your home airport',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-gray-700">
                  <span className="mt-0.5 shrink-0 w-5 h-5 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-28 px-4 bg-slate-950">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-5 leading-tight">
            Ready to take control?
          </h2>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors text-base shadow-xl shadow-blue-900/40"
          >
            Sign in to Sojourn
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-slate-950 border-t border-slate-800 py-6 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-slate-600 text-sm font-medium">Sojourn</span>
          <span className="text-slate-700 text-xs">© {new Date().getFullYear()} All rights reserved</span>
          <Link href="/login" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  )
}
