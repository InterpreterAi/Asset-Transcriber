import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useReels, SERIES_MAP, type Reel } from '@/hooks/use-reels';
import { downloadFinishedMp4 } from '@/lib/finishedExports';
import { format } from 'date-fns';
import { Search, Edit2, Trash2, Plus, Layers, Download } from 'lucide-react';
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
  '1': '#22D3EE',
  '2': '#A78BFA',
  '3': '#34D399',
  '4': '#F59E0B',
  '5': '#FB923C',
  '6': '#67E8F9',
  '7': '#F87171',
  '8': '#C084FC',
  '9': '#4ADE80',
  '10': '#FBBF24',
};

type LibraryGroup = {
  key: string;
  label: string;
  tag: string;
  reels: Reel[];
  isBatch: boolean;
};

function ReelCard({
  reel,
  color,
  onEdit,
  onDelete,
}: {
  reel: Reel;
  color: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const canDownload = Boolean(reel.downloadUrl);

  return (
    <div
      style={{
        background: '#080D17',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
    >
      <div style={{ height: '3px', background: color }} />
      <div style={{ padding: '18px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
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
          {canDownload ? (
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#22D3EE',
              background: 'rgba(34,211,238,0.1)',
              border: '1px solid rgba(34,211,238,0.25)',
              borderRadius: '4px',
              padding: '2px 8px',
            }}>
              Ready MP4
            </span>
          ) : null}
          {reel.variationIndex && reel.variationIndex > 0 ? (
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#FFD700',
              background: 'rgba(255,215,0,0.1)',
              border: '1px solid rgba(255,215,0,0.25)',
              borderRadius: '4px',
              padding: '2px 8px',
            }}>
              V{reel.variationIndex}
            </span>
          ) : null}
          {reel.scheduleTag ? (
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'rgba(248,250,252,0.55)',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '4px',
              padding: '2px 8px',
            }}>
              {reel.scheduleTag}
            </span>
          ) : null}
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

      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {canDownload ? (
          <button
            type="button"
            onClick={() =>
              downloadFinishedMp4(
                reel.downloadUrl!,
                reel.downloadFilename || 'InterpreterAI-reel.mp4',
              )
            }
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'rgba(34,211,238,0.08)',
              border: 'none',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              color: '#22D3EE',
              fontSize: '12px',
              fontWeight: 700,
              height: '42px',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,211,238,0.16)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,211,238,0.08)';
            }}
          >
            <Download size={13} /> Download
          </button>
        ) : (
          <button
            onClick={onEdit}
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
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#F8FAFC';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(248,250,252,0.45)';
              (e.currentTarget as HTMLButtonElement).style.background = 'none';
            }}
          >
            <Edit2 size={12} /> Edit
          </button>
        )}

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
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#F87171';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.05)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(248,250,252,0.25)';
                (e.currentTarget as HTMLButtonElement).style.background = 'none';
              }}
            >
              <Trash2 size={13} />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this reel?</AlertDialogTitle>
              <AlertDialogDescription>
                &quot;{reel.title}&quot; will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
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
}

export default function Library() {
  const { reels, deleteReel, isLoaded } = useReels();
  const [search, setSearch] = useState('');
  const [seriesFilter, setSeriesFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'all' | 'batches' | 'singles'>('all');
  const [, setLocation] = useLocation();

  const filtered = useMemo(() => {
    return reels.filter((reel) => {
      const matchSearch =
        reel.title.toLowerCase().includes(search.toLowerCase()) ||
        reel.hook.toLowerCase().includes(search.toLowerCase()) ||
        (reel.scheduleTag || '').toLowerCase().includes(search.toLowerCase());
      const matchSeries = seriesFilter === 'all' || reel.series === seriesFilter;
      const isBatch = Boolean(reel.batchId);
      const matchView =
        viewMode === 'all' ||
        (viewMode === 'batches' && isBatch) ||
        (viewMode === 'singles' && !isBatch);
      return matchSearch && matchSeries && matchView;
    });
  }, [reels, search, seriesFilter, viewMode]);

  const groups = useMemo((): LibraryGroup[] => {
    const batchMap = new Map<string, Reel[]>();
    const singles: Reel[] = [];

    for (const reel of filtered) {
      if (reel.batchId) {
        const list = batchMap.get(reel.batchId) ?? [];
        list.push(reel);
        batchMap.set(reel.batchId, list);
      } else {
        singles.push(reel);
      }
    }

    const batchGroups: LibraryGroup[] = [...batchMap.entries()].map(([batchId, items]) => {
      const sorted = [...items].sort((a, b) => (a.variationIndex ?? 0) - (b.variationIndex ?? 0));
      const tag = sorted.find((r) => r.scheduleTag)?.scheduleTag || 'Untitled batch';
      return {
        key: batchId,
        label: `${tag} · ${sorted.length} variations`,
        tag,
        reels: sorted,
        isBatch: true,
      };
    });

    batchGroups.sort((a, b) => (b.reels[0]?.createdAt ?? 0) - (a.reels[0]?.createdAt ?? 0));

    const singleGroup: LibraryGroup | null =
      singles.length > 0
        ? {
            key: 'singles',
            label: 'Individual reels',
            tag: '',
            reels: singles,
            isBatch: false,
          }
        : null;

    return singleGroup ? [...batchGroups, singleGroup] : batchGroups;
  }, [filtered]);

  if (!isLoaded) return null;

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#02050B', color: '#F8FAFC' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '32px', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '4px' }}>
              Reel Library
            </h1>
            <p style={{ fontSize: '13px', color: 'rgba(248,250,252,0.35)' }}>
              {reels.length} reel{reels.length !== 1 ? 's' : ''} · organize batches for social scheduling
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(248,250,252,0.3)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search reels or tags..."
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

            <Select value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
              <SelectTrigger style={{
                background: '#080D17',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                color: '#F8FAFC',
                fontSize: '13px',
                height: '38px',
                width: '140px',
              }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="batches">Batches</SelectItem>
                <SelectItem value="singles">Singles</SelectItem>
              </SelectContent>
            </Select>

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

            <Link href="/" style={{
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
              New commercial
            </Link>
          </div>
        </div>

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
              {reels.length === 0
                ? 'Create a reel or batch-generate variations for scheduling.'
                : 'Try adjusting your filters.'}
            </p>
            {reels.length === 0 ? (
              <Link href="/" style={{
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
                <Plus size={14} /> Open Creative Studio
              </Link>
            ) : (
              <button
                onClick={() => { setSearch(''); setSeriesFilter('all'); setViewMode('all'); }}
                style={{ background: 'none', border: 'none', color: '#22D3EE', fontSize: '13px', cursor: 'pointer' }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {groups.map((group) => (
          <div key={group.key} style={{ marginBottom: 36 }}>
            {group.isBatch ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
              }}>
                <Layers size={14} color="#FFD700" />
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#FFD700', margin: 0, letterSpacing: '-0.01em' }}>
                  {group.label}
                </h2>
              </div>
            ) : (
              <h2 style={{
                fontSize: 12, fontWeight: 700, color: 'rgba(248,250,252,0.35)', margin: '0 0 14px',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {group.label}
              </h2>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {group.reels.map((reel) => {
                const color = SERIES_COLORS[reel.series] || '#64748B';
                return (
                  <ReelCard
                    key={reel.id}
                    reel={reel}
                    color={color}
                    onEdit={() => setLocation(`/`)}
                    onDelete={() => deleteReel(reel.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
