interface Stat {
  tone: 'coral' | 'mint' | 'sky' | 'lavender'
  icon: string
  label: string
  value: string
  delta: string
}

const TONE_COLORS: Record<Stat['tone'], { bg: string; color: string }> = {
  coral:   { bg: 'var(--coral-soft)',   color: 'var(--coral)'   },
  mint:    { bg: 'var(--mint-soft)',    color: 'var(--mint)'    },
  sky:     { bg: 'var(--sky-soft)',     color: '#1a8fc2'        },
  lavender:{ bg: 'var(--lavender-soft)',color: 'var(--lavender)'},
}

function StatTile({ tone, icon, label, value, delta }: Stat) {
  const colors = TONE_COLORS[tone]
  return (
    <div style={{
      background: 'var(--paper)',
      border: '1px solid var(--rule)',
      borderRadius: 'var(--r)',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', marginBottom: 6, fontSize: 18, background: colors.bg, color: colors.color }}>
        {icon}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginTop: 2 }}>{delta}</div>
    </div>
  )
}

interface Props {
  upcomingCount: number
  multiCityCount: number
  countriesThisYear: number
  totalDaysThisYear: number
  annualMax: number
  journeysThisYear: number
  currentYear: number
}

export default function StatRow({ upcomingCount, multiCityCount, countriesThisYear, totalDaysThisYear, annualMax, journeysThisYear, currentYear }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
      <StatTile
        tone="coral"
        icon="✈"
        label="Upcoming trips"
        value={String(upcomingCount)}
        delta={`${multiCityCount} multi-city`}
      />
      <StatTile
        tone="mint"
        icon="🌍"
        label={`Countries · ${currentYear}`}
        value={String(countriesThisYear)}
        delta="this calendar year"
      />
      <StatTile
        tone="sky"
        icon="∑"
        label={`Days abroad · ${currentYear}`}
        value={`${totalDaysThisYear}/${annualMax}`}
        delta="max 90 per rolling year"
      />
      <StatTile
        tone="lavender"
        icon="◷"
        label="Journeys this year"
        value={String(journeysThisYear)}
        delta="upcoming + completed"
      />
    </div>
  )
}
