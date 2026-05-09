// app.jsx — Sojourn app shell with nav + screens + Tweaks
const { useState: useStateA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "yellow",
  "density": "comfy",
  "role": "main"
}/*EDITMODE-END*/;

function App() {
  const [screen, setScreen] = useStateA('dashboard');
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [activeMain, setActiveMain] = useStateA('u1'); // for assistant switcher

  const accentMap = {
    yellow: { cta:'#ffb400', ctaInk:'#0a1f4d' },
    coral:  { cta:'#ff6f5e', ctaInk:'#ffffff' },
    mint:   { cta:'#2bc28a', ctaInk:'#ffffff' },
    sky:    { cta:'#4cc4f5', ctaInk:'#0a1f4d' },
  };
  const a = accentMap[t.accent] || accentMap.yellow;
  const styleVars = { '--cta': a.cta, '--cta-ink': a.ctaInk, '--yellow': a.cta };

  const isLanding = screen === 'landing';
  const isLogin   = screen === 'login';
  const noChrome  = isLanding || isLogin;

  return (
    <div className={`app density-${t.density}`} style={styleVars} data-screen-label={screen}>
      {!noChrome && (
        <Nav screen={screen} setScreen={setScreen}
             role={t.role} activeMain={activeMain} setActiveMain={setActiveMain} />
      )}
      <main className={noChrome ? '' : 'page'} data-screen-label={screen}>
        {screen === 'dashboard' && <Dashboard role={t.role} goSearch={()=>setScreen('search')} />}
        {screen === 'search'    && <Search    goSummary={()=>setScreen('dashboard')} />}
        {screen === 'timeline'  && <Timeline />}
        {screen === 'audit'     && <Audit />}
        {screen === 'settings'  && <Settings />}
        {screen === 'landing'   && <Landing  goLogin={()=>setScreen('login')} />}
        {screen === 'login'     && <Login    goDashboard={()=>setScreen('dashboard')} goLanding={()=>setScreen('landing')} />}
      </main>

      <TweaksPanel title="Tweaks" defaultPos={{right:24,bottom:24}}>
        <TweakSection title="Brand">
          <TweakRadio label="Accent" value={t.accent} onChange={v=>setTweak('accent', v)}
            options={[
              {value:'yellow', label:'Yellow'},
              {value:'coral',  label:'Coral'},
              {value:'mint',   label:'Mint'},
              {value:'sky',    label:'Sky'},
            ]}/>
        </TweakSection>
        <TweakSection title="Account role">
          <TweakRadio label="Role" value={t.role} onChange={v=>setTweak('role', v)}
            options={[{value:'main',label:'Main'},{value:'assistant',label:'Assistant'}]}/>
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio label="Cards" value={t.density} onChange={v=>setTweak('density', v)}
            options={[{value:'comfy',label:'Comfy'},{value:'compact',label:'Compact'}]}/>
        </TweakSection>
        <TweakSection title="Jump to screen">
          <TweakButton onClick={()=>setScreen('landing')}>Public landing</TweakButton>
          <TweakButton onClick={()=>setScreen('login')}>Login</TweakButton>
          <TweakButton onClick={()=>setScreen('dashboard')}>Dashboard</TweakButton>
          <TweakButton onClick={()=>setScreen('search')}>Search · multi-city</TweakButton>
          <TweakButton onClick={()=>setScreen('timeline')}>Timeline</TweakButton>
          <TweakButton onClick={()=>setScreen('settings')}>Settings</TweakButton>
          <TweakButton onClick={()=>setScreen('audit')}>Audit log</TweakButton>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function Nav({screen, setScreen, role, activeMain, setActiveMain}) {
  const M = window.MOCK;
  const tabs = [
    {id:'dashboard', label:'Dashboard'},
    {id:'search',    label:'Plan a trip'},
    {id:'timeline',  label:'Timeline'},
    {id:'audit',     label:'Audit log'},
    ...(role === 'main' ? [{id:'settings', label:'Settings'}] : []),
  ];
  const me = role === 'main' ? M.accounts.main : M.accounts.assistant;
  const viewing = role === 'assistant'
    ? M.assistantViewing.find(a=>a.id===activeMain) || M.assistantViewing[0]
    : null;
  return (
    <header className="nav">
      <div className="nav-brand" onClick={()=>setScreen('dashboard')} style={{cursor:'pointer'}}>
        <div className="logo">S</div>
        Sojourn
      </div>
      <nav className="nav-tabs">
        {tabs.map(tab => (
          <button key={tab.id} className={screen===tab.id?'active':''} onClick={()=>setScreen(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="nav-right">
        {role === 'assistant' ? (
          <div className="acct-switch">
            <span className="acct-switch-label">Viewing</span>
            <select value={activeMain} onChange={e=>setActiveMain(e.target.value)}>
              {M.assistantViewing.map(a => (
                <option key={a.id} value={a.id}>{a.displayName}</option>
              ))}
            </select>
            <span className="acct-on-behalf">on behalf of {viewing?.displayName?.split(' ')[0]}</span>
          </div>
        ) : (
          <span className="nav-user">{me.displayName.split(' ')[0]} · Main</span>
        )}
        <div className="avatar" style={{background: me.color || 'var(--yellow)'}}>{me.initials}</div>
      </div>
    </header>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
