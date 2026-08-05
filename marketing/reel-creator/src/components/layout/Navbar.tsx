import { Link, useLocation } from 'wouter';
import { InterpreterAILogo } from '@/components/brand/InterpreterAILogo';
import { Plus } from 'lucide-react';

export function Navbar() {
  const [location] = useLocation();

  const navLink = (href: string, label: string) => {
    const isActive = href === '/'
      ? location === '/' || location.startsWith('/studio')
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
        background: 'rgba(5,7,12,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          height: '56px',
          alignItems: 'center',
          padding: '0 40px',
          gap: '32px',
        }}
      >
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
            Creative Studio
          </span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1 }}>
          {navLink('/', 'Studio')}
          {navLink('/library', 'Library')}
          {navLink('/outro', 'Brand Outro')}
        </nav>

        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#FFFFFF',
            color: '#05070C',
            borderRadius: '999px',
            padding: '0 16px',
            height: '34px',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          New commercial
        </Link>
      </div>
    </header>
  );
}
