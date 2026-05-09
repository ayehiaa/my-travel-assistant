// audit-login.jsx — Audit log and Login screens
function Audit() {
  const M = window.MOCK;
  return (
    <div>
      <div className="section-head" style={{marginTop:0}}>
        <div>
          <div className="eyebrow" style={{marginBottom:8}}>System · append-only · visible to all signed-in users</div>
          <h1 className="h1">Audit log.</h1>
        </div>
        <div className="right">
          <span className="eyebrow">{M.audit.length} entries</span>
        </div>
      </div>

      <div className="audit-table">
        <div className="audit-row head">
          <span>When</span>
          <span>Who</span>
          <span>Event</span>
          <span style={{textAlign:'right'}}>Action</span>
        </div>
        {M.audit.map((e, i) => (
          <div key={i} className="audit-row">
            <div className="audit-when">
              {e.when.split(' · ')[0]}
              <small>{e.when.split(' · ')[1]}</small>
            </div>
            <div className="audit-who">
              <div className="av" style={{background: e.avBg}}>
                {e.who[0]}
              </div>
              <div className="name">
                <strong>{e.who}</strong>
                <span className="role">{e.role}</span>
              </div>
            </div>
            <div>{e.what}</div>
            <div style={{textAlign:'right'}}>
              <span className={`audit-action ${e.action}`}>{e.action}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Login({ goDashboard, goLanding }) {
  return (
    <div className="login">
      <div className="login-left">
        <div className="login-brand" onClick={goLanding} style={{cursor:'pointer'}}>
          <div className="logo">S</div>
          Sojourn
        </div>
        <div className="login-headline">
          Track every <span className="accent">day</span> you spent <span className="accent">abroad.</span>
        </div>
        <div>
          <div style={{fontSize:13,opacity:.8,marginBottom:14,letterSpacing:'0.06em',textTransform:'uppercase'}}>Recent destinations</div>
          <div className="login-stamps">
            <div className="stamp">JFK · 18 MAY</div>
            <div className="stamp">CDG · 04 JUN</div>
            <div className="stamp">DXB · 22 JUL</div>
            <div className="stamp">BKK · 12 SEP</div>
          </div>
        </div>
      </div>
      <div className="login-right">
        <h2>Welcome back.</h2>
        <p>Sign in to your travel ledger.</p>
        <div className="field">
          <label>Email</label>
          <input type="email" placeholder="you@example.com" defaultValue="ziad@example.com" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" placeholder="••••••••" defaultValue="••••••••" />
        </div>
        <button className="btn btn-cta btn-lg" style={{width:'100%',justifyContent:'center',marginTop:6}} onClick={goDashboard}>Sign in →</button>
        <div className="divider">or</div>
        <button className="btn-google" onClick={goDashboard}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <p style={{textAlign:'center',marginTop:24,fontSize:13}}>
          Don't have an account? <a style={{color:'var(--blue-700)',fontWeight:600,cursor:'pointer'}} onClick={goLanding}>See what Sojourn does →</a>
        </p>
      </div>
    </div>
  );
}

Object.assign(window, { Audit, Login });
