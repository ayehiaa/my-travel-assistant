/** Collapsible step-by-step guide for creating an Alpaca paper account and API keys (specs/026). No client state. */

const STEPS: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: 'Create an Alpaca account',
    body: (
      <>
        Go to{' '}
        <a href="https://alpaca.markets" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--blue-700)] underline">
          alpaca.markets
        </a>{' '}
        and sign up with your email. A <strong>paper-trading</strong> account (simulated money) is available without
        funding or identity verification. Whether you can open a LIVE brokerage account depends on your country — UK
        residents should check Alpaca&apos;s site. For testing, use Paper.
      </>
    ),
  },
  { title: 'Verify your email and log in', body: 'Open the confirmation email from Alpaca, then log in to the dashboard.' },
  {
    title: 'Switch to your Paper account',
    body: 'Check the account switcher at the top-left of the dashboard says “Paper Trading” (your paper account), not a live account.',
  },
  {
    title: 'Generate API keys',
    body: 'On the paper dashboard home, find “API Keys” on the right-hand side and click Generate New Keys (or Regenerate).',
  },
  {
    title: 'Copy both keys',
    body: (
      <>
        Copy the <strong>Key ID</strong> (paper keys start with <code className="rounded bg-gray-100 px-1 font-mono text-xs">PK</code>)
        and the <strong>Secret Key</strong>. The secret is shown only once — if you lose it, regenerate the keys.
      </>
    ),
  },
  {
    title: 'Connect here',
    body: 'Paste both keys below, leave “Paper Trading” switched ON, and click Connect.',
  },
  {
    title: 'Optional safety settings',
    body: 'In Settings → Risk & safety, keep Dry run ON for your first run. After connecting, press “Disable margin & shorting” on this card as a safeguard.',
  },
]

export default function AlpacaSetupGuide() {
  return (
    <details className="group mb-5 rounded-lg border border-[var(--rule)] bg-[var(--paper-2,#f9fafb)] p-3">
      <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
        How to set up Alpaca (5 minutes)
      </summary>
      <ol className="mt-3 space-y-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--blue-700)] text-xs font-bold text-white">
              {i + 1}
            </span>
            <div className="text-sm text-[var(--ink-2)]">
              <p className="font-semibold text-[var(--ink)]">{step.title}</p>
              <p className="mt-0.5 leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>Keep your keys private.</strong> Never share them with anyone — including the owner of this app. You can
        revoke them at any time in Alpaca by regenerating the keys (then reconnect here with the new ones).
      </div>
    </details>
  )
}
