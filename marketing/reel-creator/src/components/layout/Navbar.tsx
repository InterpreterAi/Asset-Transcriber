import { Link, useLocation } from 'wouter';
import { InterpreterAILogo } from '@/components/brand/InterpreterAILogo';
import { Plus } from 'lucide-react';

export function Navbar() {
  const [location] = useLocation();

  const navLink = (href: string, label: string) => {
    const isActive = href === '/'
      ? location === '/'
      : location === href || location.startsWith(href + '/');

    return (
      <Link
        href={href}
        className={`text-sm font-medium transition-colors ${
          isActive
            ? 'text-white'
            : 'text-white/40 hover:text-white/70'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        width: '100%',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(2,5,11,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          height: '56px',
          alignItems: 'center',
          padding: '0 24px',
          gap: '32px',
        }}
      >
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0, color: '#FFFFFF' }}>
          <InterpreterAILogo variant="wordmark" height={28} />
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'rgba(248,250,252,0.3)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            paddingLeft: '10px',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
          }}>
            Reel Studio
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1 }}>
          {navLink('/', 'Dashboard')}
          {navLink('/library', 'Library')}
          {navLink('/builder', 'Builder')}
        </nav>

        {/* CTA */}
        <Link
          href="/builder"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#22D3EE',
            color: '#02050B',
            borderRadius: '7px',
            padding: '7px 14px',
            fontSize: '12px',
            fontWeight: 700,
            textDecoration: 'none',
            flexShrink: 0,
            letterSpacing: '0.01em',
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
          New Reel
        </Link>
      </div>
    </header>
  );
}
