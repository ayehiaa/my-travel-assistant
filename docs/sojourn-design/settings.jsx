// settings.jsx — Assistants management + annual reference date
const { useState: useStateSt } = React;

function Settings() {
  const M = window.MOCK;
  const [assistants, setAssistants] = useStateSt(M.linkedAssistants);
  const [refDate, setRefDate] = useStateSt(M.settings.referenceDate);
  const [inviting, setInviting] = useStateSt(false);
  const [emailDraft, setEmailDraft] = useStateSt('');

  function addAssistant() {
    if (!emailDraft) return;
    setAssistants([...assistants, {
      id:`l${Date.now()}`,
      assistantUserId:`u${Date.now()}`,
      displayName: emailDraft.split('@')[0].replace(/[._]/g,' ').replace(/\b\w/g,l=>l.toUpperCase()),
      email: emailDraft,
      createdAt: new Date().toISOString().split('T')[0],
      pending: true,
    }]);
    setEmailDraft(''); setInviting(false);
  }
  function removeAssistant(id) { setAssistants(assistants.filter(a => a.id !== id)); }

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Account</span>
          <h1 className="h1">Settings</h1>
        </div>
      </div>

      <div className="settings-grid">
        {/* Profile card */}
        <section className="settings-card">
          <div className="settings-card-head">
            <h3>Your account</h3>
            <span className="role-pill main">Main account</span>
          </div>
          <div className="profile-row">
            <div className="avatar-big" style={{background: M.accounts.main.color}}>{M.accounts.main.initials}</div>
            <div>
              <div className="profile-name">{M.accounts.main.displayName}</div>
              <div className="profile-email">{M.accounts.main.email}</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}}>Edit profile</button>
          </div>
        </section>

        {/* Reference date card */}
        <section className="settings-card">
          <div className="settings-card-head">
            <h3>Annual days-abroad reference</h3>
            <span className="muted" style={{fontSize:12}}>Used for the 12-month rolling counter</span>
          </div>
          <div className="ref-body">
            <div>
              <div className="muted" style={{fontSize:13,marginBottom:6}}>Reference date</div>
              <input type="date" className="ref-input" value={refDate} onChange={e=>setRefDate(e.target.value)} />
              <div className="ref-help">
                We count days outside the UK for the 12 months ending on this date.
                Adjust to match your visa, residency rule, or tax-year window.
              </div>
            </div>
            <div className="ref-readout">
              <div className="muted" style={{fontSize:13}}>Window ends</div>
              <div className="ref-bigdate">{new Date(refDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
              <div className="ref-meter">
                <div className="ref-meter-fill" style={{width: `${(M.settings.annualDaysAbroad/M.settings.annualMax)*100}%`}} />
              </div>
              <div className="ref-meter-foot">
                <strong>{M.settings.annualDaysAbroad}</strong>/{M.settings.annualMax} days used
                <span>{M.settings.annualMax - M.settings.annualDaysAbroad} remaining</span>
              </div>
            </div>
          </div>
        </section>

        {/* Assistants card */}
        <section className="settings-card span-2">
          <div className="settings-card-head">
            <h3>Linked assistants</h3>
            <button className="btn btn-cta btn-sm" onClick={()=>setInviting(true)}>+ Invite assistant</button>
          </div>
          <p className="muted" style={{fontSize:13,marginTop:-6,marginBottom:14}}>
            Assistants can plan, edit, and view all your trips on your behalf. Every change they make is logged in the audit trail.
          </p>

          {inviting && (
            <div className="invite-row">
              <input type="email" placeholder="assistant@example.com" value={emailDraft} onChange={e=>setEmailDraft(e.target.value)} autoFocus />
              <button className="btn btn-ghost btn-sm" onClick={()=>{setInviting(false); setEmailDraft('');}}>Cancel</button>
              <button className="btn btn-cta btn-sm" onClick={addAssistant} disabled={!emailDraft}>Send invite</button>
            </div>
          )}

          <div className="assistants-list">
            {assistants.map(a => {
              const initials = a.displayName.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase();
              return (
                <div className="assistant-row" key={a.id}>
                  <div className="avatar-big small" style={{background: a.pending ? 'var(--ink-3)':'var(--coral)'}}>{initials}</div>
                  <div>
                    <div className="profile-name">{a.displayName}{a.pending && <span className="role-pill pending">Invite sent</span>}</div>
                    <div className="profile-email">{a.email}</div>
                  </div>
                  <div className="when-cell">
                    <small>LINKED</small>
                    {new Date(a.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>removeAssistant(a.id)}>Unlink</button>
                </div>
              );
            })}
            {!assistants.length && (
              <div className="muted" style={{padding:'24px 0',textAlign:'center'}}>No assistants linked yet.</div>
            )}
          </div>
        </section>

        {/* Danger zone */}
        <section className="settings-card span-2 danger">
          <div className="settings-card-head">
            <h3>Danger zone</h3>
          </div>
          <div className="danger-row">
            <div>
              <strong>Delete account</strong>
              <div className="muted" style={{fontSize:13,marginTop:2}}>This wipes all trips, audit history, and assistant links. Cannot be undone.</div>
            </div>
            <button className="btn btn-danger btn-sm">Delete account</button>
          </div>
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
