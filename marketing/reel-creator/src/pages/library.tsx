import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useReels, SERIES_MAP } from '@/hooks/use-reels';
import { format } from 'date-fns';
import { Search, Edit2, Trash2, Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SERIES_COLORS: Record<string, string> = {
  medical: '#22D3EE',
  legal: '#A78BFA',
  conference: '#34D399',
  immigration: '#F59E0B',
  education: '#FB923C',
  general: '#64748B',
};

export default function Library() {
  const { reels, deleteReel, isLoaded } = useReels();
  const [search, setSearch] = useState('');
  const [seriesFilter, setSeriesFilter] = useState('all');
  const [, setLocation] = useLocation();

  if (!isLoaded) return null;

  const filtered = reels.filter((reel) => {
    const matchSearch = reel.title.toLowerCase().includes(search.toLowerCase()) ||
      reel.hook.toLowerCase().includes(search.toLowerCase());
    const matchSeries = seriesFilter === 'all' || reel.series === seriesFilter;
    return matchSearch && matchSeries;
  });

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#02050B', color: '#F8FAFC' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '32px', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '4px' }}>
              Reel Library
            </h1>
            <p style={{ fontSize: '13px', color: 'rgba(248,250,252,0.35)' }}>
              {reels.length} reel{reels.length !== 1 ? 's' : ''} total
            </p>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(248,250,252,0.3)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search reels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: '#080D17',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  color: '#F8FAFC',
                  fontSize: '13px',
                  height: '38px',
                  padding: '0 14px 0 34px',
                  outline: 'none',
                  width: '200px',
                }}
              />
            </div>

            <Select value={seriesFilter} onValueChange={setSeriesFilter}>
              <SelectTrigger style={{
                background: '#080D17',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                color: '#F8FAFC',
                fontSize: '13px',
                height: '38px',
                width: '160px',
              }}>
                <SelectValue placeholder="All Series" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Series</SelectItem>
                {Object.entries(SERIES_MAP).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Link href="/builder" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#22D3EE',
              color: '#02050B',
              borderRadius: '8px',
              padding: '0 16px',
              height: '38px',
              fontSize: '13px',
              fontWeight: 700,
              textDecoration: 'none',
            }}>
              <Plus size={14} strokeWidth={2.5} />
              New Reel
            </Link>
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '80px 24px',
            background: '#080D17',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: '16px',
          }}>
            <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
              {reels.length === 0 ? 'No reels yet' : 'No reels match your search'}
            </p>
            <p style={{ fontSize: '13px', color: 'rgba(248,250,252,0.3)', marginBottom: '20px' }}>
              {reels.length === 0 ? 'Create your first reel to see it here.' : 'Try adjusting your filters.'}
            </p>
            {reels.length === 0 ? (
              <Link href="/builder" style={{
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
              }}>
                <Plus size={14} /> Create first reel
              </Link>
            ) : (
              <button
                onClick={() => { setSearch(''); setSeriesFilter('all'); }}
                style={{ background: 'none', border: 'none', color: '#22D3EE', fontSize: '13px', cursor: 'pointer' }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Grid */}
        {filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
            {filtered.map((reel) => {
              const color = SERIES_COLORS[reel.series] || '#64748B';
              return (
                <div
                  key={reel.id}
                  style={{
                    background: '#080D17',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
                >
                  {/* Color top bar */}
                  <div style={{ height: '3px', background: color }} />

                  {/* Body */}
                  <div style={{ padding: '18px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        color,
                        background: `${color}18`,
                        border: `1px solid ${color}30`,
                        borderRadius: '4px',
                        padding: '2px 8px',
                      }}>
                        {SERIES_MAP[reel.series as keyof typeof SERIES_MAP]}
                      </span>
                    </div>

                    <h3 style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#F8FAFC',
                      marginBottom: '6px',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {reel.title}
                    </h3>

                    <p style={{
                      fontSize: '12px',
                      color: 'rgba(248,250,252,0.35)',
                      lineHeight: 1.55,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      marginBottom: '16px',
                    }}>
                      {reel.hook || '—'}
                    </p>

                    <div style={{ fontSize: '10px', color: 'rgba(248,250,252,0.2)', fontFamily: 'monospace' }}>
                      {format(new Date(reel.createdAt), 'MMM d, yyyy · h:mm a')}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                      onClick={() => setLocation(`/builder/${reel.id}`)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: 'none',
                        border: 'none',
                        borderRight: '1px solid rgba(255,255,255,0.06)',
                        color: 'rgba(248,250,252,0.45)',
                        fontSize: '12px',
                        fontWeight: 600,
                        height: '42px',
                        cursor: 'pointer',
                        transition: 'color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#F8FAFC'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(248,250,252,0.45)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >
                      <Edit2 size={12} /> Edit
                    </button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          style={{
                            width: '52px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'none',
                            border: 'none',
                            color: 'rgba(248,250,252,0.25)',
                            cursor: 'pointer',
                            transition: 'color 0.15s, background 0.15s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#F87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.05)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(248,250,252,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this reel?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{reel.title}" will be permanently deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteReel(reel.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
