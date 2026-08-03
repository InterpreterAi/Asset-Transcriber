import { Link } from 'wouter';
import { useReels, SERIES_MAP } from '@/hooks/use-reels';
import { format } from 'date-fns';
import { Plus, Play, ArrowRight } from 'lucide-react';
import { InterpreterAILogo } from '@/components/brand/InterpreterAILogo';

const SERIES_COLORS: Record<string, string> = {
  medical: '#22D3EE',
  legal: '#A78BFA',
  conference: '#34D399',
  immigration: '#F59E0B',
  education: '#FB923C',
  general: '#64748B',
};

export default function Home() {
  const { reels, isLoaded } = useReels();

  if (!isLoaded) return null;

  const totalReels = reels.length;
  const recentReels = reels.slice(0, 6);

  const seriesCount = Object.fromEntries(
    Object.keys(SERIES_MAP).map((k) => [k, reels.filter((r) => r.series === k).length])
  );

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#02050B', color: '#F8FAFC' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px' }}>

        {/* ── Hero ── */}
        <div style={{ marginBottom: '64px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(34,211,238,0.08)',
            border: '1px solid rgba(34,211,238,0.2)',
            borderRadius: '100px',
            padding: '5px 12px',
            marginBottom: '20px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22D3EE' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#22D3EE', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Reel Studio
            </span>
          </div>

          <h1 style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '14px' }}>
            Create reels that<br />
            <span style={{ color: '#22D3EE' }}>convert interpreters.</span>
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(248,250,252,0.45)', maxWidth: '480px', lineHeight: 1.6, marginBottom: '28px' }}>
            Every reel ends with the same locked brand outro. Consistent. Professional. Trusted.
          </p>

          <Link
            href="/builder"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#22D3EE',
              color: '#02050B',
              borderRadius: '9px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 700,
              textDecoration: 'none',
              letterSpacing: '0.01em',
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Create New Reel
          </Link>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '56px' }}>
          {[
            { label: 'Reels created', value: totalReels },
            { label: 'Series active', value: Object.values(seriesCount).filter(Boolean).length },
            { label: '62 languages', value: '∞', note: 'reach' },
          ].map(({ label, value, note }) => (
            <div
              key={label}
              style={{
                background: '#080D17',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '24px',
              }}
            >
              <div style={{ fontSize: '36px', fontWeight: 800, letterSpacing: '-0.03em', color: '#F8FAFC', lineHeight: 1 }}>
                {value}
                {note && <span style={{ fontSize: '14px', color: '#22D3EE', fontWeight: 600, marginLeft: '6px' }}>{note}</span>}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(248,250,252,0.35)', marginTop: '6px', letterSpacing: '0.02em' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Series breakdown ── */}
        <div style={{ marginBottom: '56px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,250,252,0.3)', marginBottom: '16px' }}>
            Content Series
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {Object.entries(SERIES_MAP).map(([key, label]) => {
              const count = seriesCount[key] || 0;
              const color = SERIES_COLORS[key] || '#64748B';
              return (
                <div
                  key={key}
                  style={{
                    background: '#080D17',
                    border: `1px solid rgba(255,255,255,0.05)`,
                    borderLeft: `3px solid ${color}`,
                    borderRadius: '8px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(248,250,252,0.7)' }}>{label}</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: count > 0 ? color : 'rgba(255,255,255,0.15)' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent reels ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,250,252,0.3)' }}>
              Recent Reels
            </h2>
            {totalReels > 6 && (
              <Link href="/library" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#22D3EE', textDecoration: 'none' }}>
                View all <ArrowRight size={12} />
              </Link>
            )}
          </div>

          {reels.length === 0 ? (
            <div style={{
              background: '#080D17',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '60px 24px',
              textAlign: 'center',
            }}>
              <div style={{ marginBottom: '12px', opacity: 0.3 }}>
                <InterpreterAILogo variant="mark" height={40} />
              </div>
              <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No reels yet</p>
              <p style={{ fontSize: '13px', color: 'rgba(248,250,252,0.35)', marginBottom: '20px' }}>
                Your first reel is one click away.
              </p>
              <Link
                href="/builder"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#22D3EE',
                  color: '#02050B',
                  borderRadius: '7px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                <Plus size={14} /> Create first reel
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {recentReels.map((reel) => {
                const color = SERIES_COLORS[reel.series] || '#64748B';
                return (
                  <Link
                    key={reel.id}
                    href={`/builder/${reel.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: '1px solid transparent',
                      transition: 'background 0.15s, border-color 0.15s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.background = '#080D17';
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
                    }}
                    >
                      <div style={{ width: '3px', height: '36px', borderRadius: '2px', background: color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {reel.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(248,250,252,0.35)' }}>
                          {SERIES_MAP[reel.series as keyof typeof SERIES_MAP]} · {format(new Date(reel.createdAt), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <Play size={14} style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
