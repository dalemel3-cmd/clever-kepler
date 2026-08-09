import { useCallback, useEffect, useState } from 'react';
import { Users, Check, X, RefreshCw, ShieldCheck, Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';

/**
 * Approve or revoke coach accounts.
 *
 * Self-contained on purpose: it owns its own fetching so App.jsx doesn't grow another
 * five props. Every mutation here is also enforced by RLS - the UI hides what a coach
 * can't do, and the database refuses it regardless.
 */
export default function CoachAccessCard({ showToast, setConfirmModal, currentEmail }) {
  const [rows, setRows] = useState(null);   // null = still loading
  const [state, setState] = useState('loading'); // 'loading' | 'ready' | 'not-configured' | 'error'
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    const { data, error } = await supabase
      .from('coaches')
      .select('user_id, email, display_name, approved, requested_at, approved_at')
      .order('approved', { ascending: true })
      .order('requested_at', { ascending: true });

    if (error) {
      const msg = String(error.message || '');
      if (error.code === '42P01' || /does not exist|schema cache|not find the table/i.test(msg)) {
        setState('not-configured');
        return;
      }
      setState('error');
      return;
    }
    setRows(data || []);
    setState('ready');
  }, []);

  useEffect(() => { load(); }, [load]);

  const setApproved = async (row, approved) => {
    setBusyId(row.user_id);
    const patch = approved
      ? { approved: true, approved_at: new Date().toISOString() }
      : { approved: false, approved_at: null };
    const { error } = await supabase.from('coaches').update(patch).eq('user_id', row.user_id);
    setBusyId('');
    if (error) {
      showToast(`Could not update ${row.email}: ${error.message}`, 'error');
      return;
    }
    showToast(approved ? `Approved ${row.email}.` : `Revoked access for ${row.email}.`, approved ? 'success' : 'info');
    load();
  };

  const confirmRevoke = (row) => {
    setConfirmModal({
      isOpen: true,
      title: 'Revoke Coach Access',
      message: `Remove access for ${row.email}? They stay signed in on their devices until their session refreshes, then they'll see the waiting-for-approval screen.`,
      isDanger: true,
      actionText: 'Revoke Access',
      onConfirm: () => setApproved(row, false),
    });
  };

  const pending = (rows || []).filter(r => !r.approved);
  const approved = (rows || []).filter(r => r.approved);
  const isLastApproved = approved.length <= 1;

  return (
    <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', border: '1px solid rgba(139, 92, 246, 0.35)', background: 'rgba(139, 92, 246, 0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
            <Users size={22} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: '#c084fc' }}>COACH ACCESS</h2>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Approve new coaches, or revoke access. Creating an account grants nothing until approved here.
            </div>
          </div>
        </div>
        <button
          onClick={load}
          aria-label="Refresh coach list"
          style={{ padding: '9px 16px', fontSize: '12px', fontWeight: 700, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px' }}
        >
          <RefreshCw size={14} style={{ animation: state === 'loading' ? 'spin 1s linear infinite' : 'none' }} /> REFRESH
        </button>
      </div>

      {state === 'not-configured' && (
        <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.4)', color: '#fbbf24', fontSize: '13px', fontWeight: 600, lineHeight: 1.6 }}>
          Coach approval isn't set up in the database yet. Run <strong>db/003_coach_approval.sql</strong> in
          Supabase (see <strong>docs/RLS-RUNBOOK.md</strong>) to turn it on. Until then anyone who can sign in
          has full access.
        </div>
      )}

      {state === 'error' && (
        <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', fontSize: '13px', fontWeight: 600 }}>
          Couldn't load the coach list. Check the connection and hit refresh.
        </div>
      )}

      {state === 'ready' && (
        <>
          {pending.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} /> AWAITING APPROVAL ({pending.length})
              </span>
              {pending.map(row => (
                <div key={row.user_id} style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--white)' }}>{row.email}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Requested {row.requested_at ? new Date(row.requested_at).toLocaleString() : 'recently'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setApproved(row, true)}
                      disabled={busyId === row.user_id}
                      style={{ padding: '9px 18px', minHeight: '40px', fontSize: '13px', fontWeight: 800, background: 'var(--status-success)', color: '#04140b', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button
                      onClick={() => confirmRevoke(row)}
                      disabled={busyId === row.user_id}
                      aria-label={`Dismiss request from ${row.email}`}
                      style={{ padding: '9px 14px', minHeight: '40px', fontSize: '13px', fontWeight: 700, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: '10px', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--status-success)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={13} /> APPROVED COACHES ({approved.length})
            </span>
            {approved.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No approved coaches yet.
              </div>
            )}
            {approved.map(row => {
              const isSelf = currentEmail && row.email === currentEmail;
              return (
                <div key={row.user_id} style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--white)' }}>
                      {row.email}{isSelf && <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 800, color: 'var(--color-accent)', background: 'rgba(184,156,91,0.15)', border: '1px solid var(--color-accent)', padding: '2px 8px', borderRadius: '10px' }}>YOU</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Approved {row.approved_at ? new Date(row.approved_at).toLocaleDateString() : '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => confirmRevoke(row)}
                    disabled={busyId === row.user_id || (isSelf && isLastApproved)}
                    title={isSelf && isLastApproved ? 'You are the only approved coach — approve someone else first' : undefined}
                    style={{ padding: '9px 16px', minHeight: '40px', fontSize: '12px', fontWeight: 700, background: 'transparent', color: 'var(--status-error)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '10px', cursor: (isSelf && isLastApproved) ? 'not-allowed' : 'pointer', opacity: (isSelf && isLastApproved) ? 0.4 : 1 }}
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
            Every approved coach has full access, including Clear All Historical Data. There are no
            lesser roles — approve accordingly.
          </div>
        </>
      )}
    </div>
  );
}
