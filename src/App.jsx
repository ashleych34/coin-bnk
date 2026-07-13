import React, { useState, useEffect, useCallback } from 'react';
import { Coins, Lock, Plus, Minus, Settings, ArrowUpCircle, ArrowDownCircle, X, Check, Target, Trash2, Gift, Pencil, Download, Upload, ClipboardList, Send, ThumbsDown, Palette, CreditCard, ChevronDown, ChevronUp, Sun, CheckCircle2, Circle } from 'lucide-react';
import { storageAdapter } from './storageAdapter';

const KIDS = ['Ryan', 'Emma'];
const TEST_KID = 'Test';
const ACCENTS = {
  Ryan: { c: '#3FA796', bg: 'rgba(63,167,150,0.14)', ring: 'rgba(63,167,150,0.45)' },
  Emma: { c: '#E85D75', bg: 'rgba(232,93,117,0.14)', ring: 'rgba(232,93,117,0.45)' },
  Test: { c: '#9B7EDE', bg: 'rgba(155,126,222,0.14)', ring: 'rgba(155,126,222,0.45)' },
};
const GOLD = 'var(--gold)';

// --- Themes ---------------------------------------------------------------
// Only the "chrome" (background/surface/border/text) and the gold accent
// are themeable. Ryan's teal and Emma's coral stay fixed across all themes
// so they remain reliable identity colors, and red/green stay fixed since
// they're used as universal negative/positive indicators throughout the ledger.
const THEMES = {
  midnight: {
    label: 'Midnight',
    swatch: '#E8B94A',
    bg: '#151C27',
    surface: '#1F2836',
    border: '#2A3444',
    textMuted: '#8B94A3',
    textDim: '#5B6373',
    textPrimary: '#D8DCE3',
    textBright: '#F1EFEA',
    textOnGold: '#1B2430',
    gold: '#E8B94A',
    goldRgb: '232,185,74',
  },
  ocean: {
    label: 'Ocean',
    swatch: '#4FC3E8',
    bg: '#0F1B2B',
    surface: '#16263B',
    border: '#223349',
    textMuted: '#8FA3B8',
    textDim: '#5C7086',
    textPrimary: '#D7E4EE',
    textBright: '#F0F6FA',
    textOnGold: '#0B1D2B',
    gold: '#4FC3E8',
    goldRgb: '79,195,232',
  },
  sunset: {
    label: 'Sunset',
    swatch: '#F4A259',
    bg: '#241A2E',
    surface: '#2F2138',
    border: '#453354',
    textMuted: '#B8A3C4',
    textDim: '#7A6688',
    textPrimary: '#EDE1F0',
    textBright: '#FBF3FB',
    textOnGold: '#2A1520',
    gold: '#F4A259',
    goldRgb: '244,162,89',
  },
  forest: {
    label: 'Forest',
    swatch: '#6FCF97',
    bg: '#131F1A',
    surface: '#1B2A23',
    border: '#274036',
    textMuted: '#9BB3A8',
    textDim: '#5F776C',
    textPrimary: '#DCEBE3',
    textBright: '#F2FAF6',
    textOnGold: '#0F2018',
    gold: '#6FCF97',
    goldRgb: '111,207,151',
  },
  daylight: {
    label: 'Daylight',
    swatch: '#E8A93F',
    bg: '#F5F3EE',
    surface: '#FFFFFF',
    border: '#E4E0D8',
    textMuted: '#7A7466',
    textDim: '#A39C8C',
    textPrimary: '#3A362F',
    textBright: '#1F1C17',
    textOnGold: '#2A1E08',
    gold: '#E8A93F',
    goldRgb: '232,169,63',
  },
};
const THEME_KEY = 'coinbank-theme';
const DEFAULT_THEME = 'midnight';

function getStoredTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return THEMES[t] ? t : DEFAULT_THEME;
  } catch (e) {
    return DEFAULT_THEME;
  }
}

function themeVars(themeName) {
  const t = THEMES[themeName] || THEMES[DEFAULT_THEME];
  return {
    '--bg': t.bg,
    '--surface': t.surface,
    '--border': t.border,
    '--text-muted': t.textMuted,
    '--text-dim': t.textDim,
    '--text-primary': t.textPrimary,
    '--text-bright': t.textBright,
    '--text-on-gold': t.textOnGold,
    '--gold': t.gold,
    '--gold-rgb': t.goldRgb,
    background: t.bg,
    minHeight: '100vh',
  };
}

// --- Unique ID helper (Date.now() alone can collide within the same millisecond) ---
let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `${Date.now()}-${uidCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

// --- Storage adapter ------------------------------------------------------
// All persistence goes through the adapter in ./storageAdapter.js (Supabase).
// To change backends, edit only that file.

// Fill in any missing fields so older saved data (or a partial backup) is safe to load.
// Keep the stored document from growing forever. The full ledger keeps the
// most recent entries; pending requests/transfers are always kept, but old
// resolved (approved/rejected/accepted/declined) ones are capped.
const HISTORY_LIMIT = 400;
const RESOLVED_LIMIT = 50;

// Local date as YYYY-MM-DD — used to scope daily plans to "today".
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pruneData(d) {
  const keepRecentResolved = (list) => [
    ...list.filter((r) => r.status === 'pending'),
    ...list.filter((r) => r.status !== 'pending').slice(0, RESOLVED_LIMIT),
  ];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const prunePlans = (plans) =>
    Object.fromEntries(Object.entries(plans || {}).map(([k, list]) => [k, (list || []).filter((it) => it.ts > weekAgo)]));
  return {
    ...d,
    transactions: d.transactions.slice(0, HISTORY_LIMIT),
    taskRequests: keepRecentResolved(d.taskRequests),
    debtRequests: keepRecentResolved(d.debtRequests),
    transfers: keepRecentResolved(d.transfers),
    dailyPlans: prunePlans(d.dailyPlans),
  };
}

function withDefaults(parsed) {
  if (!parsed) return defaultData;
  return {
    ...defaultData,
    ...parsed,
    balances: { Ryan: 0, Emma: 0, Test: 0, ...(parsed.balances || {}) },
    debits: { Ryan: 0, Emma: 0, Test: 0, ...(parsed.debits || {}) },
    buckets: { Ryan: [], Emma: [], Test: [], ...(parsed.buckets || {}) },
    transactions: parsed.transactions || [],
    rewardCatalog: parsed.rewardCatalog || defaultData.rewardCatalog,
    taskCatalog: parsed.taskCatalog || defaultData.taskCatalog,
    taskRequests: parsed.taskRequests || [],
    debtRequests: parsed.debtRequests || [],
    transfers: parsed.transfers || [],
    dailyPlans: { Ryan: [], Emma: [], Test: [], ...(parsed.dailyPlans || {}) },
  };
}

const defaultData = {
  pin: '1234',
  balances: { Ryan: 0, Emma: 0, Test: 0 },
  debits: { Ryan: 0, Emma: 0, Test: 0 },
  buckets: { Ryan: [], Emma: [], Test: [] },
  transactions: [],
  rewardCatalog: [
    { id: 'reward-seed-1', name: 'Lego set', target: 160 },
  ],
  taskCatalog: [
    { id: 'task-seed-1', name: 'Practice piano', coins: 1, kids: [] },
    { id: 'task-seed-2', name: 'Finish Chinese homework', coins: 1, kids: [] },
    { id: 'task-seed-3', name: 'Practice cello', coins: 1, kids: [] },
    { id: 'task-seed-4', name: 'Practice viola', coins: 1, kids: [] },
  ],
  taskRequests: [],
  debtRequests: [],
  transfers: [],
  dailyPlans: { Ryan: [], Emma: [], Test: [] },
};

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function describeTx(t) {
  switch (t.type) {
    case 'bucket_create':
      return { label: `Started goal: ${t.bucketName}`, amountLabel: '', color: 'var(--text-muted)', Icon: Target };
    case 'bucket_deposit':
      return { label: `Moved into ${t.bucketName}`, amountLabel: `${t.amount}`, color: 'var(--text-muted)', Icon: Target };
    case 'bucket_withdraw':
      return { label: `Took back from ${t.bucketName}`, amountLabel: `+${t.amount}`, color: 'var(--text-muted)', Icon: Target };
    case 'bucket_claim':
      return { label: `Reward approved: ${t.bucketName}`, amountLabel: `${t.amount} spent`, color: GOLD, Icon: Gift };
    case 'claim_request':
      return { label: `Asked to claim: ${t.bucketName}`, amountLabel: '', color: 'var(--text-muted)', Icon: Gift };
    case 'claim_rejected':
      return { label: `Claim declined: ${t.bucketName}`, amountLabel: '', color: '#E85D75', Icon: ThumbsDown };
    case 'bucket_delete':
      return { label: `Removed goal: ${t.bucketName}`, amountLabel: t.amount > 0 ? `+${t.amount}` : '', color: 'var(--text-muted)', Icon: Trash2 };
    case 'bucket_edit':
      return { label: `Changed ${t.bucketName} goal to ${t.newTarget}`, amountLabel: '', color: 'var(--text-muted)', Icon: Pencil };
    case 'task_request':
      return { label: `Requested: ${t.reason}`, amountLabel: '', color: 'var(--text-muted)', Icon: Send };
    case 'task_approved':
      return { label: `Approved: ${t.reason}`, amountLabel: `+${t.amount}`, color: '#3FA796', Icon: Check };
    case 'task_rejected':
      return { label: `Declined: ${t.reason}`, amountLabel: '', color: '#E85D75', Icon: ThumbsDown };
    case 'debt_request':
      return { label: `Asked to get now: ${t.reason}`, amountLabel: '', color: 'var(--text-muted)', Icon: CreditCard };
    case 'debt_approved':
      return { label: `Got now: ${t.reason}`, amountLabel: t.amount > 0 ? `${t.amount} owed` : 'no debt needed', color: t.amount > 0 ? '#E85D75' : '#3FA796', Icon: CreditCard };
    case 'debt_rejected':
      return { label: `Declined: ${t.reason}`, amountLabel: '', color: '#E85D75', Icon: ThumbsDown };
    case 'debt_paydown':
      return { label: 'Paid down debt', amountLabel: `-${t.amount}`, color: '#3FA796', Icon: CreditCard };
    case 'transfer_sent':
      return { label: `Sent to ${t.toKid}${t.reason ? `: ${t.reason}` : ''}`, amountLabel: `-${t.amount}`, color: '#E85D75', Icon: Send };
    case 'transfer_received':
      return { label: `Received from ${t.fromKid}${t.reason ? `: ${t.reason}` : ''}`, amountLabel: `+${t.amount}`, color: '#3FA796', Icon: Gift };
    case 'transfer_declined':
      return { label: `${t.toKid} declined${t.reason ? `: ${t.reason}` : ''}`, amountLabel: `+${t.amount} back`, color: 'var(--text-muted)', Icon: ThumbsDown };
    default:
      return {
        label: t.reason || (t.amount >= 0 ? 'Coins added' : 'Coins deducted'),
        amountLabel: `${t.amount >= 0 ? '+' : ''}${t.amount}`,
        color: t.amount >= 0 ? '#3FA796' : '#E85D75',
        Icon: t.amount >= 0 ? ArrowUpCircle : ArrowDownCircle,
      };
  }
}

function CoinStack({ count, accent }) {
  if (count <= 0) {
    return (
      <div className="text-lg text-center" style={{ color: count < 0 ? '#E85D75' : 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
        {count < 0 ? `Owes ${Math.abs(count)} coins` : 'No coins yet'}
      </div>
    );
  }
  const capped = Math.min(count, 40);
  const rows = Math.ceil(capped / 8) || 1;
  return (
    <div className="flex flex-col-reverse items-center gap-1">
      {Array.from({ length: rows }).map((_, r) => {
        const inRow = Math.min(8, capped - r * 8);
        return (
          <div key={r} className="flex gap-1">
            {Array.from({ length: Math.max(inRow, 0) }).map((_, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full border"
                style={{
                  background: `linear-gradient(135deg, ${GOLD}, #B8862F)`,
                  borderColor: '#8a6a24',
                  boxShadow: '0 1px 0 rgba(0,0,0,0.35)',
                }}
              />
            ))}
          </div>
        );
      })}
      {count > 40 && (
        <div className="text-base tracking-wide mt-1" style={{ color: accent.c }}>
          +{count - 40} more
        </div>
      )}
    </div>
  );
}

function BucketRow({ kid, bucket, balance, onDeposit, onWithdraw, onClaim, onDelete, onEditTarget }) {
  const accent = ACCENTS[kid];
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState('');
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState(String(bucket.target));
  const pct = Math.min(100, Math.round((bucket.saved / bucket.target) * 100));
  const reached = bucket.saved >= bucket.target;

  const deposit = () => {
    const n = parseInt(amt, 10);
    if (!n || n <= 0 || n > balance) return;
    onDeposit(bucket.id, n);
    setAmt('');
    setOpen(false);
  };
  const withdraw = () => {
    const n = parseInt(amt, 10);
    if (!n || n <= 0 || n > bucket.saved) return;
    onWithdraw(bucket.id, n);
    setAmt('');
    setOpen(false);
  };
  const saveTarget = () => {
    const n = parseInt(editTarget, 10);
    if (!n || n <= 0) return;
    onEditTarget(bucket.id, n);
    setEditing(false);
  };

  return (
    <div className="rounded-lg p-3 mb-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target size={19} style={{ color: accent.c, flexShrink: 0 }} />
          <span className="text-xl font-medium truncate" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
            {bucket.name}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg tabular-nums" style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            {bucket.saved}/{bucket.target}
          </span>
          <button onClick={() => { setEditing((e) => !e); setEditTarget(String(bucket.target)); }} className="p-1.5 -m-1.5" style={{ color: 'var(--text-dim)' }}>
            <Pencil size={18} />
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete the "${bucket.name}" goal?${bucket.saved > 0 ? ` The ${bucket.saved} saved coins go back to your credit.` : ''}`)) {
                onDelete(bucket.id);
              }
            }}
            className="p-1.5 -m-1.5"
            style={{ color: 'var(--text-dim)' }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {editing && (
        <div className="flex items-center gap-1.5 mb-2">
          <input
            type="number"
            min="1"
            value={editTarget}
            onChange={(e) => setEditTarget(e.target.value)}
            placeholder="New goal amount"
            className="flex-1 min-w-0 rounded-md px-2.5 py-1.5 text-lg outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button onClick={saveTarget} className="text-lg px-2.5 py-1.5 rounded-md flex-shrink-0" style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}` }}>
            Save
          </button>
          <button onClick={() => setEditing(false)} className="p-1.5 -m-1.5" style={{ color: 'var(--text-dim)' }}>
            <X size={19} />
          </button>
        </div>
      )}

      <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: reached ? GOLD : accent.c }}
        />
      </div>

      {reached && bucket.claimPending && (
        <div
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md text-lg"
          style={{ color: GOLD, border: `1px dashed ${GOLD}`, fontFamily: 'Inter, sans-serif' }}
        >
          <Gift size={18} /> Waiting for parent approval
        </div>
      )}

      {reached && !bucket.claimPending && (
        <button
          onClick={() => onClaim(bucket.id)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md text-lg font-semibold mb-2"
          style={{ background: GOLD, color: 'var(--text-on-gold)', fontFamily: 'Inter, sans-serif' }}
        >
          <Gift size={18} /> Goal reached — ask to claim!
        </button>
      )}

      {!bucket.claimPending && (
        open ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            placeholder="Coins"
            className="flex-1 min-w-0 rounded-md px-2.5 py-1.5 text-lg outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button onClick={deposit} className="text-lg px-2.5 py-1.5 rounded-md flex-shrink-0" style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}` }}>
            Add
          </button>
          {bucket.saved > 0 && (
            <button onClick={withdraw} className="text-lg px-2.5 py-1.5 rounded-md flex-shrink-0" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Take out
            </button>
          )}
          <button onClick={() => setOpen(false)} className="p-1.5 -m-1.5" style={{ color: 'var(--text-dim)' }}>
            <X size={19} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-lg py-2 rounded-md"
          style={{ color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
        >
          Move coins in / out
        </button>
        )
      )}
    </div>
  );
}

function BucketSection({ kid, balance, buckets, onAdd, onDeposit, onWithdraw, onClaim, onDelete, onEditTarget, rewardCatalog, debtRequests, onRequestAdvance }) {
  const accent = ACCENTS[kid];
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  const create = () => {
    const t = parseInt(target, 10);
    if (!name.trim() || !t || t <= 0) return;
    onAdd(name.trim(), t);
    setName('');
    setTarget('');
    setCreating(false);
  };

  const pickReward = (reward) => {
    setName(reward.name);
    setTarget(String(reward.target));
    setCreating(true);
  };

  const pendingAdvanceNames = new Set(
    (debtRequests || []).filter((r) => r.kid === kid && r.status === 'pending').map((r) => r.rewardName)
  );

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-lg uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
          Savings goals
        </h3>
        <span className="text-lg tabular-nums" style={{ color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
          {balance} credit
        </span>
      </div>

      {buckets.length === 0 && !creating && (
        <div className="text-xl px-1 mb-3" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
          No goals yet. Saving up for something? Start a bucket for it.
        </div>
      )}

      {buckets.map((b) => (
        <BucketRow
          key={b.id}
          kid={kid}
          bucket={b}
          balance={balance}
          onDeposit={onDeposit}
          onWithdraw={onWithdraw}
          onClaim={onClaim}
          onDelete={onDelete}
          onEditTarget={onEditTarget}
        />
      ))}

      {rewardCatalog && rewardCatalog.length > 0 && !creating && (
        <CollapsibleSection storageId={`rewards-${kid}`} title="Reward ideas from Mom" defaultOpen={false}>
        <div className="space-y-2 mb-3">
          {rewardCatalog.map((r) => {
            const pendingAdvance = pendingAdvanceNames.has(r.name);
            const short = Math.max(0, r.target - balance);
            return (
              <div
                key={r.id}
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Gift size={18} style={{ color: GOLD, flexShrink: 0 }} />
                  <span className="text-xl truncate" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                    {r.name}
                  </span>
                  <span className="text-lg flex-shrink-0" style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {r.target}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => pickReward(r)}
                    className="flex-1 text-base px-2 py-2 rounded-md flex items-center justify-center gap-1"
                    style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
                  >
                    <Target size={15} /> Save toward this
                  </button>
                  {pendingAdvance ? (
                    <span
                      className="flex-1 text-base px-2 py-2 rounded-md flex items-center justify-center"
                      style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)', fontFamily: 'Inter, sans-serif' }}
                    >
                      Waiting for approval
                    </span>
                  ) : (
                    <button
                      onClick={() => onRequestAdvance(r.name, r.target)}
                      className="flex-1 text-base px-2 py-2 rounded-md flex items-center justify-center gap-1"
                      style={{ color: '#E85D75', border: '1px solid #E85D75', fontFamily: 'Inter, sans-serif' }}
                    >
                      <CreditCard size={15} /> Get it now
                    </button>
                  )}
                </div>
                {short > 0 && (
                  <p className="text-base mt-1.5" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
                    "Get it now" would add {short} to your debit.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        </CollapsibleSection>
      )}

      {creating ? (
        <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: `1px solid ${accent.ring}` }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goal name (e.g. Lego set)"
            className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
          />
          <input
            type="number"
            min="1"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Coins needed (e.g. 160)"
            className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <div className="flex gap-2">
            <button onClick={create} className="flex-1 py-2 rounded-md text-lg font-semibold" style={{ background: accent.c, color: 'var(--bg)', fontFamily: 'Inter, sans-serif' }}>
              Create goal
            </button>
            <button onClick={() => setCreating(false)} className="px-3 py-2 rounded-md text-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xl"
          style={{ color: accent.c, border: `1px dashed ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
        >
          <Plus size={19} /> New goal
        </button>
      )}
    </div>
  );
}

function CollapsibleSection({ storageId, title, accentColor, defaultOpen = false, children }) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`coinbank-collapse-${storageId}`);
      return v === null ? defaultOpen : v === 'open';
    } catch (e) {
      return defaultOpen;
    }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(`coinbank-collapse-${storageId}`, next ? 'open' : 'closed');
    } catch (e) {
      // fine — just won't remember
    }
  };
  return (
    <div className="mt-6">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-1 mb-1"
        style={{ color: accentColor || 'var(--text-muted)' }}
      >
        <span className="text-lg uppercase tracking-[0.2em]" style={{ fontFamily: 'Inter, sans-serif' }}>
          {title}
        </span>
        {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function TodayPlan({ kid, plan, taskCatalog, taskRequests, onAdd, onToggle, onRemove, onRequest }) {
  const accent = ACCENTS[kid];
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCoins, setCustomCoins] = useState('');

  const today = todayStr();
  const items = (plan || []).filter((it) => it.date === today);
  const myCatalog = taskCatalog.filter((t) => !t.kids || t.kids.length === 0 || t.kids.includes(kid));
  const plannedTaskIds = new Set(items.filter((it) => it.taskId).map((it) => it.taskId));

  const requestStatus = (item) => {
    if (!item.requestId) return null;
    const req = taskRequests.find((r) => r.id === item.requestId);
    if (!req) return { label: 'Sent', color: 'var(--text-muted)' };
    if (req.status === 'pending') return { label: 'Waiting for Mom', color: GOLD };
    if (req.status === 'approved') return { label: `+${req.coins} earned!`, color: '#3FA796' };
    return { label: 'Declined', color: '#E85D75' };
  };

  const addCustom = () => {
    const coins = parseInt(customCoins, 10);
    if (!customName.trim() || !coins || coins <= 0) return;
    onAdd(customName.trim(), coins, null);
    setCustomName('');
    setCustomCoins('');
    setAdding(false);
  };

  const doneCount = items.filter((it) => it.done).length;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Sun size={20} style={{ color: GOLD }} />
          <h3 className="text-lg uppercase tracking-[0.2em]" style={{ color: 'var(--text-bright)', fontFamily: 'Inter, sans-serif' }}>
            My plan for today
          </h3>
        </div>
        {items.length > 0 && (
          <span className="text-lg tabular-nums" style={{ color: doneCount === items.length ? '#3FA796' : 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length === 0 && !adding && (
        <div className="text-xl px-1 mb-3" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
          What will you do today? Add your tasks and check them off!
        </div>
      )}

      <ul className="space-y-2 mb-2">
        {items.map((item) => {
          const status = requestStatus(item);
          return (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 gap-2"
              style={{
                background: item.done ? accent.bg : 'var(--surface)',
                border: `1px solid ${item.done ? accent.ring : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => !item.requestId && onToggle(item.id)}
                  className="flex-shrink-0"
                  style={{ color: item.done ? accent.c : 'var(--text-dim)' }}
                >
                  {item.done ? <CheckCircle2 size={26} /> : <Circle size={26} />}
                </button>
                <span
                  className="text-xl truncate"
                  style={{
                    color: item.done ? accent.c : 'var(--text-primary)',
                    textDecoration: item.done && status ? 'none' : item.done ? 'line-through' : 'none',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {item.name}
                </span>
                <span
                  className="text-base flex-shrink-0 px-2 py-0.5 rounded"
                  style={{ background: 'rgba(var(--gold-rgb), 0.14)', color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {item.coins}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {status ? (
                  <span className="text-base" style={{ color: status.color, fontFamily: 'Inter, sans-serif' }}>
                    {status.label}
                  </span>
                ) : item.done ? (
                  <button
                    onClick={() => onRequest(item.id)}
                    className="text-base px-2.5 py-1.5 rounded-md flex items-center gap-1"
                    style={{ background: GOLD, color: 'var(--text-on-gold)', fontFamily: 'Inter, sans-serif' }}
                  >
                    <Send size={13} /> Ask for coins
                  </button>
                ) : (
                  <button onClick={() => onRemove(item.id)} className="p-1.5 -m-1.5" style={{ color: 'var(--text-dim)' }}>
                    <X size={18} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: `1px solid ${accent.ring}` }}>
          {myCatalog.filter((t) => !plannedTaskIds.has(t.id)).length > 0 && (
            <>
              <p className="text-base mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                Pick from your list:
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {myCatalog.filter((t) => !plannedTaskIds.has(t.id)).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onAdd(t.name, t.coins, t.id)}
                    className="text-base px-3 py-2 rounded-full"
                    style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
                  >
                    {t.name} · {t.coins}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="text-base mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
            Or make your own:
          </p>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="What will you do?"
            className="w-full mb-2 rounded-md px-2 py-2 text-xl outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
          />
          <input
            type="number"
            min="1"
            value={customCoins}
            onChange={(e) => setCustomCoins(e.target.value)}
            placeholder="Coins it's worth"
            className="w-full mb-2 rounded-md px-2 py-2 text-xl outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <div className="flex gap-2">
            <button
              onClick={addCustom}
              disabled={!customName.trim() || !customCoins || parseInt(customCoins, 10) <= 0}
              className="flex-1 py-2 rounded-md text-lg font-semibold disabled:opacity-40"
              style={{ background: accent.c, color: 'var(--bg)', fontFamily: 'Inter, sans-serif' }}
            >
              Add to my plan
            </button>
            <button onClick={() => setAdding(false)} className="px-3 py-2 rounded-md text-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-lg"
          style={{ color: accent.c, border: `1px dashed ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
        >
          <Plus size={18} /> Add a task for today
        </button>
      )}
    </div>
  );
}

function TaskBoard({ kid, taskCatalog, taskRequests, onRequest, onRequestCustom }) {
  const accent = ACCENTS[kid];
  const myTasks = taskCatalog.filter((t) => !t.kids || t.kids.length === 0 || t.kids.includes(kid));
  const pendingTaskIds = new Set(
    taskRequests.filter((r) => r.kid === kid && r.status === 'pending' && r.taskId).map((r) => r.taskId)
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCoins, setCustomCoins] = useState('');

  const submitCustom = () => {
    const coins = parseInt(customCoins, 10);
    if (!customName.trim() || !coins || coins <= 0) return;
    onRequestCustom(customName.trim(), coins);
    setCustomName('');
    setCustomCoins('');
    setCustomOpen(false);
  };

  return (
    <div>
      {myTasks.length === 0 ? (
        <div className="text-xl px-1 mb-3" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
          No tasks set up yet. Ask a parent to add some, or suggest your own below.
        </div>
      ) : (
        <ul className="space-y-2 mb-3">
          {myTasks.map((task) => {
            const pending = pendingTaskIds.has(task.id);
            return (
              <li
                key={task.id}
                className="flex items-center justify-between rounded-lg px-3 py-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ClipboardList size={20} style={{ color: accent.c, flexShrink: 0 }} />
                  <span className="text-xl truncate" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                    {task.name}
                  </span>
                  <span
                    className="text-lg flex-shrink-0 px-2 py-0.5 rounded"
                    style={{ background: 'rgba(var(--gold-rgb), 0.14)', color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {task.coins}
                  </span>
                </div>
                {pending ? (
                  <span className="text-lg flex-shrink-0" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                    Waiting for approval
                  </span>
                ) : (
                  <button
                    onClick={() => onRequest(task.id)}
                    className="text-lg px-3 py-2 rounded-md flex-shrink-0 flex items-center gap-1"
                    style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
                  >
                    <Send size={16} /> I did this
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {customOpen ? (
        <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: `1px solid ${accent.ring}` }}>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="What did you do?"
            className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
          />
          <input
            type="number"
            min="1"
            value={customCoins}
            onChange={(e) => setCustomCoins(e.target.value)}
            placeholder="Coins you think it's worth"
            className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <div className="flex gap-2">
            <button onClick={submitCustom} className="flex-1 py-2 rounded-md text-lg font-semibold flex items-center justify-center gap-1" style={{ background: accent.c, color: 'var(--bg)', fontFamily: 'Inter, sans-serif' }}>
              <Send size={17} /> Send request
            </button>
            <button onClick={() => setCustomOpen(false)} className="px-3 py-2 rounded-md text-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCustomOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xl"
          style={{ color: accent.c, border: `1px dashed ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
        >
          <Plus size={19} /> Suggest something I did
        </button>
      )}
    </div>
  );
}

function TransferSection({ kid, balance, transfers, onSend, onAccept, onDecline }) {
  const accent = ACCENTS[kid];
  const [open, setOpen] = useState(false);
  const [toKid, setToKid] = useState('');
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');

  // Test account is isolated: it can't send to or receive from real kids.
  if (kid === TEST_KID) return null;

  const recipients = KIDS.filter((k) => k !== kid);
  const incoming = transfers.filter((t) => t.to === kid && t.status === 'pending');
  const outgoing = transfers.filter((t) => t.from === kid && t.status === 'pending');

  const send = () => {
    const n = parseInt(amt, 10);
    if (!toKid || !n || n <= 0 || n > balance) return;
    onSend(toKid, n, note);
    setAmt('');
    setNote('');
    setToKid('');
    setOpen(false);
  };

  return (
    <div className="mt-6">
      <h3 className="text-lg uppercase tracking-[0.2em] mb-3 px-1" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
        Give coins
      </h3>

      {incoming.map((t) => (
        <div
          key={t.id}
          className="rounded-lg px-3 py-2.5 mb-2"
          style={{ background: 'rgba(var(--gold-rgb), 0.1)', border: `1px solid ${GOLD}` }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xl" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                {t.from} wants to give you{' '}
                <span className="font-bold" style={{ color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}>{t.amount}</span>
                {t.amount === 1 ? ' coin' : ' coins'}
              </span>
              {t.note && (
                <p className="text-lg truncate" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                  "{t.note}"
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => onAccept(t.id)} className="p-2 rounded-md" style={{ background: 'rgba(63,167,150,0.18)', color: '#3FA796' }}>
                <Check size={20} />
              </button>
              <button onClick={() => onDecline(t.id)} className="p-2 rounded-md" style={{ background: 'rgba(232,93,117,0.18)', color: '#E85D75' }}>
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {outgoing.map((t) => (
        <div
          key={t.id}
          className="rounded-lg px-3 py-2.5 mb-2 text-lg"
          style={{ background: 'var(--surface)', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}
        >
          Waiting for {t.to} to accept {t.amount} {t.amount === 1 ? 'coin' : 'coins'}{t.note ? ` — "${t.note}"` : ''}
        </div>
      ))}

      {open ? (
        <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: `1px solid ${accent.ring}` }}>
          <div className="flex gap-2 mb-2">
            {recipients.map((r) => (
              <button
                key={r}
                onClick={() => setToKid(r)}
                className="flex-1 py-2 rounded-md text-lg"
                style={{
                  background: toKid === r ? ACCENTS[r].bg : 'transparent',
                  border: `1px solid ${toKid === r ? ACCENTS[r].ring : 'var(--border)'}`,
                  color: toKid === r ? ACCENTS[r].c : 'var(--text-muted)',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                To {r}
              </button>
            ))}
          </div>
          <input
            type="number"
            min="1"
            max={balance}
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            placeholder={`Coins (you have ${balance})`}
            className="w-full mb-2 rounded-md px-2 py-2 text-xl outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's it for? (e.g. Made breakfast)"
            className="w-full mb-2 rounded-md px-2 py-2 text-xl outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
          />
          <div className="flex gap-2">
            <button
              onClick={send}
              disabled={!toKid || !amt || parseInt(amt, 10) <= 0 || parseInt(amt, 10) > balance}
              className="flex-1 py-2 rounded-md text-lg font-semibold disabled:opacity-40 flex items-center justify-center gap-1"
              style={{ background: accent.c, color: 'var(--bg)', fontFamily: 'Inter, sans-serif' }}
            >
              <Send size={16} /> Send
            </button>
            <button onClick={() => setOpen(false)} className="px-3 py-2 rounded-md text-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-lg"
          style={{ color: accent.c, border: `1px dashed ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
        >
          <Send size={16} /> Give coins to {recipients.join(' or ')}
        </button>
      )}
    </div>
  );
}

function DebtCard({ kid, debit, balance, onPayDown }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState('');
  const maxPayable = Math.min(balance, debit);
  const canPayFull = balance >= debit;

  if (debit <= 0) return null;

  const pay = () => {
    const n = parseInt(amt, 10);
    if (!n || n <= 0 || n > maxPayable) return;
    onPayDown(n);
    setAmt('');
    setOpen(false);
  };

  const payFull = () => {
    onPayDown(debit);
    setOpen(false);
  };

  return (
    <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(232,93,117,0.1)', border: '1px solid #E85D75' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CreditCard size={19} style={{ color: '#E85D75' }} />
          <span className="text-lg uppercase tracking-[0.15em]" style={{ color: '#E85D75', fontFamily: 'Inter, sans-serif' }}>
            Debit
          </span>
        </div>
        <span className="text-2xl font-bold tabular-nums" style={{ color: '#E85D75', fontFamily: "'Fredoka', sans-serif" }}>
          {debit}
        </span>
      </div>
      <p className="text-lg mb-3" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
        You owe this many coins from getting a reward early.
      </p>
      {maxPayable <= 0 ? (
        <p className="text-lg" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
          Earn some credit, then you can pay this down.
        </p>
      ) : open ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            max={maxPayable}
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            placeholder={`Up to ${maxPayable}`}
            className="flex-1 min-w-0 rounded-md px-2 py-2 text-lg outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button onClick={pay} className="text-lg px-3 py-2 rounded-md flex-shrink-0" style={{ background: '#E85D75', color: '#fff' }}>
            Pay
          </button>
          <button onClick={() => setOpen(false)} className="p-1.5 -m-1.5" style={{ color: 'var(--text-dim)' }}>
            <X size={18} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          {canPayFull && (
            <button
              onClick={payFull}
              className="flex-1 text-lg py-2 rounded-md font-semibold"
              style={{ background: '#E85D75', color: '#fff', fontFamily: 'Inter, sans-serif' }}
            >
              Pay in full ({debit})
            </button>
          )}
          <button
            onClick={() => setOpen(true)}
            className="flex-1 text-lg py-2 rounded-md"
            style={{ color: '#E85D75', border: '1px solid #E85D75', fontFamily: 'Inter, sans-serif' }}
          >
            Pay partial ({maxPayable} available)
          </button>
        </div>
      )}
    </div>
  );
}

function KidPassbook({ kid, balance, debit, transactions, buckets, onAddBucket, onDeposit, onWithdraw, onClaim, onDeleteBucket, onEditBucket, taskCatalog, taskRequests, onRequestTask, onRequestCustomTask, rewardCatalog, debtRequests, onRequestAdvance, onPayDownDebt, onBack, onResetTest, transfers, onSendTransfer, onAcceptTransfer, onDeclineTransfer, dailyPlan, onAddPlanItem, onTogglePlanItem, onRemovePlanItem, onRequestPlanCoins }) {
  const accent = ACCENTS[kid];
  const kidTx = transactions.filter((t) => t.kid === kid).slice(0, 8);
  const isTest = kid === TEST_KID;
  return (
    <div className="max-w-md mx-auto">
      {isTest && (
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2.5 mb-4 gap-2"
          style={{ background: accent.bg, border: `1px solid ${accent.ring}` }}
        >
          <span className="text-lg" style={{ color: accent.c, fontFamily: 'Inter, sans-serif' }}>
            🧪 Test account — nothing here affects Ryan or Emma
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => {
                if (window.confirm('Reset the test account? All its test data will be cleared.')) onResetTest();
              }}
              className="text-base px-2.5 py-1.5 rounded-md"
              style={{ color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
            >
              Reset
            </button>
            <button
              onClick={onBack}
              className="text-base px-2.5 py-1.5 rounded-md"
              style={{ color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
            >
              ← Parent
            </button>
          </div>
        </div>
      )}
      <div
        className="rounded-2xl p-6 border"
        style={{ background: accent.bg, borderColor: accent.ring }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-lg uppercase tracking-[0.2em]" style={{ color: accent.c, fontFamily: 'Inter, sans-serif' }}>
            {kid}'s account
          </span>
          <Coins size={21} style={{ color: GOLD }} />
        </div>
        <div
          className="text-8xl font-bold mt-2 mb-4 tabular-nums"
          style={{ fontFamily: "'Fredoka', sans-serif", color: balance < 0 ? '#E85D75' : 'var(--text-bright)' }}
        >
          {balance}
        </div>
        <div className="text-lg mb-4" style={{ color: balance < 0 ? '#E85D75' : 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
          {balance < 0 ? 'coins owed' : `${balance === 1 ? 'coin' : 'coins'} credit`}
        </div>
        <CoinStack count={balance} accent={accent} />
      </div>

      <DebtCard kid={kid} debit={debit} balance={balance} onPayDown={onPayDownDebt} />

      <TodayPlan
        kid={kid}
        plan={dailyPlan}
        taskCatalog={taskCatalog}
        taskRequests={taskRequests}
        onAdd={onAddPlanItem}
        onToggle={onTogglePlanItem}
        onRemove={onRemovePlanItem}
        onRequest={onRequestPlanCoins}
      />

      <TransferSection
        kid={kid}
        balance={balance}
        transfers={transfers}
        onSend={onSendTransfer}
        onAccept={onAcceptTransfer}
        onDecline={onDeclineTransfer}
      />

      <CollapsibleSection storageId={`tasks-${kid}`} title="Task list from Mom" defaultOpen={false}>
        <TaskBoard kid={kid} taskCatalog={taskCatalog} taskRequests={taskRequests} onRequest={onRequestTask} onRequestCustom={onRequestCustomTask} />
      </CollapsibleSection>

      <BucketSection
        kid={kid}
        balance={balance}
        buckets={buckets}
        onAdd={onAddBucket}
        onDeposit={onDeposit}
        onWithdraw={onWithdraw}
        onClaim={onClaim}
        onDelete={onDeleteBucket}
        onEditTarget={onEditBucket}
        rewardCatalog={rewardCatalog}
        debtRequests={debtRequests}
        onRequestAdvance={onRequestAdvance}
      />

      <div className="mt-6">
        <h3
          className="text-lg uppercase tracking-[0.2em] mb-3 px-1"
          style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}
        >
          Recent activity
        </h3>
        {kidTx.length === 0 ? (
          <div className="text-xl px-1" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
            No entries yet. Ask a parent to add your first coins!
          </div>
        ) : (
          <ul className="space-y-2">
            {kidTx.map((t) => {
              const { label, amountLabel, color, Icon } = describeTx(t);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={21} style={{ color, flexShrink: 0 }} />
                    <span className="text-xl truncate" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                      {label}
                    </span>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 pl-2">
                    {amountLabel && (
                      <span
                        className="text-xl font-semibold tabular-nums"
                        style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {amountLabel}
                      </span>
                    )}
                    <span className="text-base" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
                      {fmtDate(t.ts)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function PinGate({ pin, onUnlock }) {
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (entry === pin) {
      onUnlock();
    } else {
      setError(true);
      setEntry('');
      setTimeout(() => setError(false), 900);
    }
  };

  const press = (d) => {
    if (entry.length >= 4) return;
    const next = entry + d;
    setEntry(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === pin) onUnlock();
        else {
          setError(true);
          setEntry('');
          setTimeout(() => setError(false), 900);
        }
      }, 120);
    }
  };

  return (
    <div className="max-w-xs mx-auto text-center pt-6">
      <Lock size={36} style={{ color: GOLD }} className="mx-auto mb-3" />
      <div className="text-xl mb-5" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
        Enter parent PIN
      </div>
      <div className={`flex justify-center gap-3 mb-6 ${error ? 'animate-pulse' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-3.5 h-3.5 rounded-full border-2"
            style={{
              borderColor: error ? '#E85D75' : GOLD,
              background: i < entry.length ? (error ? '#E85D75' : GOLD) : 'transparent',
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) =>
          d === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => (d === '⌫' ? setEntry(entry.slice(0, -1)) : press(d))}
              className="rounded-xl py-3 text-2xl font-medium transition-colors"
              style={{ background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {d}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ParentPanel({ data, setData, onOpenTest }) {
  const [unlocked, setUnlocked] = useState(false);
  const [selKid, setSelKid] = useState('Ryan');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState('add');
  const [showPinChange, setShowPinChange] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [toast, setToast] = useState('');

  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskCoins, setNewTaskCoins] = useState('');
  const [newTaskKids, setNewTaskKids] = useState([]);
  const [addingTask, setAddingTask] = useState(false);

  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardTarget, setNewRewardTarget] = useState('');
  const [addingReward, setAddingReward] = useState(false);

  const flashToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1600);
  };

  const [reqEdits, setReqEdits] = useState({});
  const getReqCoins = (req) => (reqEdits[req.id] !== undefined ? reqEdits[req.id] : req.coins);
  const setReqCoins = (reqId, val) => setReqEdits((prev) => ({ ...prev, [reqId]: val }));

  const pendingRequests = data.taskRequests.filter((r) => r.status === 'pending');

  const pendingClaims = KIDS.flatMap((kid) =>
    (data.buckets[kid] || []).filter((b) => b.claimPending).map((b) => ({ kid, bucket: b }))
  );

  const approveClaim = (kid, bucketId) => {
    setData((prev) => {
      const bucket = prev.buckets[kid].find((b) => b.id === bucketId);
      if (!bucket || !bucket.claimPending) return prev;
      const tx = { id: uid(), kid, type: 'bucket_claim', amount: bucket.saved, reason: bucket.name, bucketName: bucket.name, ts: Date.now() };
      return {
        ...prev,
        buckets: { ...prev.buckets, [kid]: prev.buckets[kid].filter((b) => b.id !== bucketId) },
        transactions: [tx, ...prev.transactions],
      };
    });
    flashToast('Reward approved');
  };

  const rejectClaim = (kid, bucketId) => {
    setData((prev) => {
      const bucket = prev.buckets[kid].find((b) => b.id === bucketId);
      if (!bucket || !bucket.claimPending) return prev;
      const tx = { id: uid(), kid, type: 'claim_rejected', amount: 0, reason: bucket.name, bucketName: bucket.name, ts: Date.now() };
      return {
        ...prev,
        buckets: {
          ...prev.buckets,
          [kid]: prev.buckets[kid].map((b) => (b.id === bucketId ? { ...b, claimPending: false } : b)),
        },
        transactions: [tx, ...prev.transactions],
      };
    });
    flashToast('Claim declined — coins stay in the goal');
  };

  const pendingDebts = data.debtRequests.filter((r) => r.status === 'pending');

  const approveDebt = (requestId) => {
    setData((prev) => {
      const req = prev.debtRequests.find((r) => r.id === requestId);
      if (!req || req.status !== 'pending') return prev;
      const currentCredit = prev.balances[req.kid];
      const fromCredit = Math.min(req.cost, currentCredit);
      const newDebit = req.cost - fromCredit;
      const tx = { id: uid(), kid: req.kid, type: 'debt_approved', amount: newDebit, reason: req.rewardName, ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [req.kid]: currentCredit - fromCredit },
        debits: { ...prev.debits, [req.kid]: prev.debits[req.kid] + newDebit },
        debtRequests: prev.debtRequests.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r)),
        transactions: [tx, ...prev.transactions],
      };
    });
    flashToast('Advance approved');
  };

  const rejectDebt = (requestId) => {
    setData((prev) => {
      const req = prev.debtRequests.find((r) => r.id === requestId);
      if (!req || req.status !== 'pending') return prev;
      const tx = { id: uid(), kid: req.kid, type: 'debt_rejected', amount: 0, reason: req.rewardName, ts: Date.now() };
      return {
        ...prev,
        debtRequests: prev.debtRequests.map((r) => (r.id === requestId ? { ...r, status: 'rejected' } : r)),
        transactions: [tx, ...prev.transactions],
      };
    });
    flashToast('Advance declined');
  };

  const approveRequest = (requestId) => {
    setData((prev) => {
      const req = prev.taskRequests.find((r) => r.id === requestId);
      if (!req || req.status !== 'pending') return prev;
      const finalCoins = parseInt(getReqCoins(req), 10) || req.coins;
      const tx = { id: uid(), kid: req.kid, type: 'task_approved', amount: finalCoins, reason: req.taskName, ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [req.kid]: prev.balances[req.kid] + finalCoins },
        taskRequests: prev.taskRequests.map((r) => (r.id === requestId ? { ...r, status: 'approved', coins: finalCoins } : r)),
        transactions: [tx, ...prev.transactions],
      };
    });
    flashToast('Approved — coins added');
  };

  const rejectRequest = (requestId) => {
    setData((prev) => {
      const req = prev.taskRequests.find((r) => r.id === requestId);
      if (!req || req.status !== 'pending') return prev;
      const tx = { id: uid(), kid: req.kid, type: 'task_rejected', amount: 0, reason: req.taskName, ts: Date.now() };
      return {
        ...prev,
        taskRequests: prev.taskRequests.map((r) => (r.id === requestId ? { ...r, status: 'rejected' } : r)),
        transactions: [tx, ...prev.transactions],
      };
    });
    flashToast('Request declined');
  };

  const addTask = () => {
    const coins = parseInt(newTaskCoins, 10);
    if (!newTaskName.trim() || !coins || coins <= 0) return;
    const kids = newTaskKids.length === 1 ? newTaskKids : [];
    const task = { id: uid(), name: newTaskName.trim(), coins, kids };
    setData((prev) => ({ ...prev, taskCatalog: [...prev.taskCatalog, task] }));
    setNewTaskName('');
    setNewTaskCoins('');
    setNewTaskKids([]);
    setAddingTask(false);
  };

  const deleteTask = (id) => {
    setData((prev) => ({ ...prev, taskCatalog: prev.taskCatalog.filter((t) => t.id !== id) }));
  };

  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskName, setEditTaskName] = useState('');
  const [editTaskCoins, setEditTaskCoins] = useState('');
  const [editTaskKids, setEditTaskKids] = useState([]);

  const startEditTask = (task) => {
    setEditingTaskId(task.id);
    setEditTaskName(task.name);
    setEditTaskCoins(String(task.coins));
    setEditTaskKids(task.kids || []);
  };

  const toggleEditTaskKid = (kid) => {
    setEditTaskKids((prev) => (prev.includes(kid) ? prev.filter((k) => k !== kid) : [...prev, kid]));
  };

  const saveEditTask = (id) => {
    const coins = parseInt(editTaskCoins, 10);
    if (!editTaskName.trim() || !coins || coins <= 0) return;
    const kids = editTaskKids.length === 1 ? editTaskKids : [];
    setData((prev) => ({
      ...prev,
      taskCatalog: prev.taskCatalog.map((t) => (t.id === id ? { ...t, name: editTaskName.trim(), coins, kids } : t)),
    }));
    setEditingTaskId(null);
  };

  const toggleNewTaskKid = (kid) => {
    setNewTaskKids((prev) => (prev.includes(kid) ? prev.filter((k) => k !== kid) : [...prev, kid]));
  };

  const addReward = () => {
    const target = parseInt(newRewardTarget, 10);
    if (!newRewardName.trim() || !target || target <= 0) return;
    const reward = { id: uid(), name: newRewardName.trim(), target };
    setData((prev) => ({ ...prev, rewardCatalog: [...prev.rewardCatalog, reward] }));
    setNewRewardName('');
    setNewRewardTarget('');
    setAddingReward(false);
  };

  const deleteReward = (id) => {
    setData((prev) => ({ ...prev, rewardCatalog: prev.rewardCatalog.filter((r) => r.id !== id) }));
  };

  const [editingRewardId, setEditingRewardId] = useState(null);
  const [editRewardName, setEditRewardName] = useState('');
  const [editRewardTarget, setEditRewardTarget] = useState('');

  const startEditReward = (reward) => {
    setEditingRewardId(reward.id);
    setEditRewardName(reward.name);
    setEditRewardTarget(String(reward.target));
  };

  const saveEditReward = (id) => {
    const target = parseInt(editRewardTarget, 10);
    if (!editRewardName.trim() || !target || target <= 0) return;
    setData((prev) => ({
      ...prev,
      rewardCatalog: prev.rewardCatalog.map((r) => (r.id === id ? { ...r, name: editRewardName.trim(), target } : r)),
    }));
    setEditingRewardId(null);
  };

  const applyTransaction = () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return;
    setData((prev) => {
      if (mode === 'add') {
        const tx = { id: uid(), kid: selKid, amount: amt, reason: reason.trim(), ts: Date.now() };
        return {
          ...prev,
          balances: { ...prev.balances, [selKid]: prev.balances[selKid] + amt },
          transactions: [tx, ...prev.transactions],
        };
      }
      // Deduct: take from credit first; anything beyond what's available
      // becomes debit instead of letting credit go negative.
      const currentCredit = prev.balances[selKid];
      const fromCredit = Math.min(amt, currentCredit);
      const overflow = amt - fromCredit;
      const tx = { id: uid(), kid: selKid, amount: -amt, reason: reason.trim(), ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [selKid]: currentCredit - fromCredit },
        debits: { ...prev.debits, [selKid]: prev.debits[selKid] + overflow },
        transactions: [tx, ...prev.transactions],
      };
    });
    flashToast(`${mode === 'add' ? 'Added' : 'Deducted'} ${amt} coin${amt === 1 ? '' : 's'} for ${selKid}`);
    setAmount('');
    setReason('');
  };

  const savePin = () => {
    if (newPin.length !== 4) return;
    setData((prev) => ({ ...prev, pin: newPin }));
    setNewPin('');
    setShowPinChange(false);
    flashToast('PIN updated');
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coin-bank-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashToast('Backup downloaded');
  };

  const fileInputRef = React.useRef(null);
  const triggerImport = () => fileInputRef.current && fileInputRef.current.click();
  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        setData(withDefaults(parsed));
        flashToast('Backup restored');
      } catch (err) {
        flashToast('Could not read that file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!unlocked) {
    return <PinGate pin={data.pin} onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="max-w-lg mx-auto">
      {toast && (
        <div
          className="mb-4 rounded-lg px-4 py-2.5 text-xl flex items-center gap-2"
          style={{ background: 'rgba(63,167,150,0.15)', border: '1px solid rgba(63,167,150,0.4)', color: '#3FA796', fontFamily: 'Inter, sans-serif' }}
        >
          <Check size={19} /> {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <span className="text-lg uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
          Parent control
        </span>
        <div className="flex items-center gap-2">
          <input type="file" accept="application/json" ref={fileInputRef} onChange={handleImportFile} className="hidden" />
          <button
            onClick={triggerImport}
            className="flex items-center gap-1 text-lg px-2.5 py-1.5 rounded-md"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}
          >
            <Upload size={17} /> Restore
          </button>
          <button
            onClick={exportData}
            className="flex items-center gap-1 text-lg px-2.5 py-1.5 rounded-md"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}
          >
            <Download size={17} /> Backup
          </button>
          <button
            onClick={() => setShowPinChange((s) => !s)}
            className="flex items-center gap-1 text-lg px-2.5 py-1.5 rounded-md"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}
          >
            <Settings size={17} /> PIN
          </button>
        </div>
      </div>

      <button
        onClick={onOpenTest}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-lg mb-6"
        style={{ background: ACCENTS.Test.bg, color: ACCENTS.Test.c, border: `1px solid ${ACCENTS.Test.ring}`, fontFamily: 'Inter, sans-serif' }}
      >
        🧪 Open Test Account (safe to play with)
      </button>

      {showPinChange && (
        <div className="mb-4 rounded-lg p-3 flex items-center gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            placeholder="New 4-digit PIN"
            className="flex-1 bg-transparent outline-none text-xl"
            style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button onClick={savePin} className="text-lg px-2.5 py-1.5 rounded-md" style={{ background: GOLD, color: 'var(--text-on-gold)' }}>
            Save
          </button>
          <button onClick={() => setShowPinChange(false)} className="p-1.5 -m-1.5" style={{ color: 'var(--text-dim)' }}>
            <X size={19} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {KIDS.map((kid) => (
          <div
            key={kid}
            className="rounded-xl p-4"
            style={{ background: ACCENTS[kid].bg, border: `1px solid ${ACCENTS[kid].ring}` }}
          >
            <div className="text-lg uppercase tracking-[0.15em] mb-1" style={{ color: ACCENTS[kid].c, fontFamily: 'Inter, sans-serif' }}>
              {kid}
            </div>
            <div className="text-5xl font-bold tabular-nums" style={{ fontFamily: "'Fredoka', sans-serif", color: data.balances[kid] < 0 ? '#E85D75' : 'var(--text-bright)' }}>
              {data.balances[kid]}
            </div>
            <div className="text-base" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
              credit
            </div>
            {data.debits[kid] > 0 && (
              <div className="text-2xl font-semibold tabular-nums mt-1" style={{ color: '#E85D75', fontFamily: "'Fredoka', sans-serif" }}>
                −{data.debits[kid]} <span className="text-base font-normal" style={{ fontFamily: 'Inter, sans-serif' }}>debit</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {(pendingRequests.length > 0 || pendingClaims.length > 0 || pendingDebts.length > 0) && (
        <div className="mb-6">
          <h3 className="text-lg uppercase tracking-[0.2em] mb-3 px-1" style={{ color: GOLD, fontFamily: 'Inter, sans-serif' }}>
            Pending requests ({pendingRequests.length + pendingClaims.length + pendingDebts.length})
          </h3>
          <ul className="space-y-2">
            {pendingRequests.map((req) => (
              <li
                key={req.id}
                className="rounded-lg px-3 py-3"
                style={{ background: 'rgba(var(--gold-rgb), 0.1)', border: `1px solid ${GOLD}` }}
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className="text-base uppercase font-semibold px-2 py-0.5 rounded flex-shrink-0"
                    style={{ background: ACCENTS[req.kid].bg, color: ACCENTS[req.kid].c }}
                  >
                    {req.kid}
                  </span>
                  <span className="text-xl" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', wordBreak: 'break-word' }}>
                    {req.taskName}
                  </span>
                  {req.custom && (
                    <span className="text-base flex-shrink-0 px-1.5 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
                      suggested
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={getReqCoins(req)}
                    onChange={(e) => setReqCoins(req.id, e.target.value)}
                    className="w-16 text-center rounded-md py-1.5 text-lg outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <button onClick={() => approveRequest(req.id)} className="p-2 rounded-md" style={{ background: 'rgba(63,167,150,0.18)', color: '#3FA796' }}>
                    <Check size={20} />
                  </button>
                  <button onClick={() => rejectRequest(req.id)} className="p-2 rounded-md" style={{ background: 'rgba(232,93,117,0.18)', color: '#E85D75' }}>
                    <X size={20} />
                  </button>
                </div>
              </li>
            ))}
            {pendingClaims.map(({ kid, bucket }) => (
              <li
                key={`claim-${bucket.id}`}
                className="rounded-lg px-3 py-3"
                style={{ background: 'rgba(var(--gold-rgb), 0.1)', border: `1px solid ${GOLD}` }}
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className="text-base uppercase font-semibold px-2 py-0.5 rounded flex-shrink-0"
                    style={{ background: ACCENTS[kid].bg, color: ACCENTS[kid].c }}
                  >
                    {kid}
                  </span>
                  <Gift size={19} style={{ color: GOLD, flexShrink: 0 }} />
                  <span className="text-xl" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', wordBreak: 'break-word' }}>
                    {bucket.name}
                  </span>
                  <span className="text-lg flex-shrink-0" style={{ color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}>
                    {bucket.saved} coins
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => approveClaim(kid, bucket.id)} className="p-2 rounded-md" style={{ background: 'rgba(63,167,150,0.18)', color: '#3FA796' }}>
                    <Check size={20} />
                  </button>
                  <button onClick={() => rejectClaim(kid, bucket.id)} className="p-2 rounded-md" style={{ background: 'rgba(232,93,117,0.18)', color: '#E85D75' }}>
                    <X size={20} />
                  </button>
                </div>
              </li>
            ))}
            {pendingDebts.map((req) => (
              <li
                key={`debt-${req.id}`}
                className="rounded-lg px-3 py-3"
                style={{ background: 'rgba(232,93,117,0.1)', border: '1px solid #E85D75' }}
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className="text-base uppercase font-semibold px-2 py-0.5 rounded flex-shrink-0"
                    style={{ background: ACCENTS[req.kid].bg, color: ACCENTS[req.kid].c }}
                  >
                    {req.kid}
                  </span>
                  <CreditCard size={18} style={{ color: '#E85D75', flexShrink: 0 }} />
                  <span className="text-xl" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', wordBreak: 'break-word' }}>
                    {req.rewardName}
                  </span>
                  <span className="text-lg flex-shrink-0" style={{ color: '#E85D75', fontFamily: "'JetBrains Mono', monospace" }}>
                    cost {req.cost}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => approveDebt(req.id)} className="p-2 rounded-md" style={{ background: 'rgba(63,167,150,0.18)', color: '#3FA796' }}>
                    <Check size={20} />
                  </button>
                  <button onClick={() => rejectDebt(req.id)} className="p-2 rounded-md" style={{ background: 'rgba(232,93,117,0.18)', color: '#E85D75' }}>
                    <X size={20} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex gap-2 mb-3">
          {KIDS.map((kid) => (
            <button
              key={kid}
              onClick={() => setSelKid(kid)}
              className="flex-1 py-2.5 rounded-lg text-xl font-medium transition-colors"
              style={{
                background: selKid === kid ? ACCENTS[kid].bg : 'transparent',
                border: `1px solid ${selKid === kid ? ACCENTS[kid].ring : 'var(--border)'}`,
                color: selKid === kid ? ACCENTS[kid].c : 'var(--text-muted)',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {kid}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setMode('add')}
            className="flex-1 py-2.5 rounded-lg text-xl font-medium flex items-center justify-center gap-1"
            style={{
              background: mode === 'add' ? 'rgba(63,167,150,0.18)' : 'transparent',
              border: `1px solid ${mode === 'add' ? '#3FA796' : 'var(--border)'}`,
              color: mode === 'add' ? '#3FA796' : 'var(--text-muted)',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <Plus size={19} /> Add
          </button>
          <button
            onClick={() => setMode('deduct')}
            className="flex-1 py-2.5 rounded-lg text-xl font-medium flex items-center justify-center gap-1"
            style={{
              background: mode === 'deduct' ? 'rgba(232,93,117,0.18)' : 'transparent',
              border: `1px solid ${mode === 'deduct' ? '#E85D75' : 'var(--border)'}`,
              color: mode === 'deduct' ? '#E85D75' : 'var(--text-muted)',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <Minus size={19} /> Deduct
          </button>
        </div>

        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-full mb-2 rounded-lg px-3 py-2.5 text-xl outline-none"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (e.g. Practiced piano)"
          className="w-full mb-3 rounded-lg px-3 py-2.5 text-xl outline-none"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
        />
        <button
          onClick={applyTransaction}
          disabled={!amount || parseInt(amount, 10) <= 0}
          className="w-full py-2.5 rounded-lg text-xl font-semibold disabled:opacity-40"
          style={{ background: GOLD, color: 'var(--text-on-gold)', fontFamily: 'Inter, sans-serif' }}
        >
          {mode === 'add' ? 'Add coins' : 'Deduct coins'}
        </button>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-lg uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
            Task catalog
          </h3>
        </div>
        <ul className="space-y-2 mb-2">
          {data.taskCatalog.map((task) => {
            const assignedLabel = task.kids && task.kids.length === 1 ? `${task.kids[0]} only` : 'Both';
            const assignedColor = task.kids && task.kids.length === 1 ? ACCENTS[task.kids[0]] : { bg: 'var(--border)', c: 'var(--text-muted)' };
            return (
              <li key={task.id}>
                <div
                  className="flex items-center justify-between rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ClipboardList size={19} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span className="text-xl truncate" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                      {task.name}
                    </span>
                    <span className="text-lg flex-shrink-0" style={{ color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}>
                      {task.coins}
                    </span>
                    <span className="text-base flex-shrink-0 px-1 rounded" style={{ background: assignedColor.bg, color: assignedColor.c }}>
                      {assignedLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => startEditTask(task)} className="p-1.5 -m-1.5" style={{ color: 'var(--text-dim)' }}>
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete the task "${task.name}"?`)) deleteTask(task.id);
                      }}
                      className="p-1.5 -m-1.5"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                {editingTaskId === task.id && (
                  <div className="mt-1.5 rounded-lg p-3" style={{ background: 'var(--surface)', border: `1px solid ${GOLD}` }}>
                    <input
                      type="text"
                      value={editTaskName}
                      onChange={(e) => setEditTaskName(e.target.value)}
                      placeholder="Task name"
                      className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
                    />
                    <input
                      type="number"
                      min="1"
                      value={editTaskCoins}
                      onChange={(e) => setEditTaskCoins(e.target.value)}
                      placeholder="Coins"
                      className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
                    />
                    <div className="flex gap-2 mb-2">
                      {KIDS.map((kid) => (
                        <button
                          key={kid}
                          onClick={() => toggleEditTaskKid(kid)}
                          className="flex-1 py-2 rounded-md text-lg"
                          style={{
                            background: editTaskKids.includes(kid) ? ACCENTS[kid].bg : 'transparent',
                            border: `1px solid ${editTaskKids.includes(kid) ? ACCENTS[kid].ring : 'var(--border)'}`,
                            color: editTaskKids.includes(kid) ? ACCENTS[kid].c : 'var(--text-muted)',
                            fontFamily: 'Inter, sans-serif',
                          }}
                        >
                          {kid} only
                        </button>
                      ))}
                    </div>
                    <div className="text-base mb-2" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
                      Leave both unselected to make it available to everyone.
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveEditTask(task.id)} className="flex-1 py-2 rounded-md text-lg font-semibold" style={{ background: GOLD, color: 'var(--text-on-gold)', fontFamily: 'Inter, sans-serif' }}>
                        Save changes
                      </button>
                      <button onClick={() => setEditingTaskId(null)} className="px-3 py-2 rounded-md text-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {addingTask ? (
          <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <input
              type="text"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              placeholder="Task name (e.g. Practice violin)"
              className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
            />
            <input
              type="number"
              min="1"
              value={newTaskCoins}
              onChange={(e) => setNewTaskCoins(e.target.value)}
              placeholder="Coins earned"
              className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
            />
            <div className="flex gap-2 mb-2">
              {KIDS.map((kid) => (
                <button
                  key={kid}
                  onClick={() => toggleNewTaskKid(kid)}
                  className="flex-1 py-2 rounded-md text-lg"
                  style={{
                    background: newTaskKids.includes(kid) ? ACCENTS[kid].bg : 'transparent',
                    border: `1px solid ${newTaskKids.includes(kid) ? ACCENTS[kid].ring : 'var(--border)'}`,
                    color: newTaskKids.includes(kid) ? ACCENTS[kid].c : 'var(--text-muted)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {kid} only
                </button>
              ))}
            </div>
            <div className="text-base mb-2" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
              Leave both unselected to make it available to everyone.
            </div>
            <div className="flex gap-2">
              <button onClick={addTask} className="flex-1 py-2 rounded-md text-lg font-semibold" style={{ background: GOLD, color: 'var(--text-on-gold)', fontFamily: 'Inter, sans-serif' }}>
                Add task
              </button>
              <button onClick={() => setAddingTask(false)} className="px-3 py-2 rounded-md text-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingTask(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xl"
            style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)', fontFamily: 'Inter, sans-serif' }}
          >
            <Plus size={19} /> New task
          </button>
        )}
      </div>

      <div className="mb-6">
        <h3 className="text-lg uppercase tracking-[0.2em] mb-3 px-1" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
          Reward catalog
        </h3>
        <ul className="space-y-2 mb-2">
          {data.rewardCatalog.map((r) => (
            <li key={r.id}>
              <div
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Gift size={19} style={{ color: GOLD, flexShrink: 0 }} />
                  <span className="text-xl truncate" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                    {r.name}
                  </span>
                  <span className="text-lg flex-shrink-0" style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {r.target} coins
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => startEditReward(r)} className="p-1.5 -m-1.5" style={{ color: 'var(--text-dim)' }}>
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete the reward "${r.name}"?`)) deleteReward(r.id);
                    }}
                    className="p-1.5 -m-1.5"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              {editingRewardId === r.id && (
                <div className="mt-1.5 rounded-lg p-3" style={{ background: 'var(--surface)', border: `1px solid ${GOLD}` }}>
                  <input
                    type="text"
                    value={editRewardName}
                    onChange={(e) => setEditRewardName(e.target.value)}
                    placeholder="Reward name"
                    className="w-full mb-2 rounded-md px-2 py-2 text-xl outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
                  />
                  <input
                    type="number"
                    min="1"
                    value={editRewardTarget}
                    onChange={(e) => setEditRewardTarget(e.target.value)}
                    placeholder="Coins needed"
                    className="w-full mb-2 rounded-md px-2 py-2 text-xl outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEditReward(r.id)} className="flex-1 py-2 rounded-md text-lg font-semibold" style={{ background: GOLD, color: 'var(--text-on-gold)', fontFamily: 'Inter, sans-serif' }}>
                      Save changes
                    </button>
                    <button onClick={() => setEditingRewardId(null)} className="px-3 py-2 rounded-md text-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {addingReward ? (
          <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <input
              type="text"
              value={newRewardName}
              onChange={(e) => setNewRewardName(e.target.value)}
              placeholder="Reward name (e.g. Nerf gun)"
              className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
            />
            <input
              type="number"
              min="1"
              value={newRewardTarget}
              onChange={(e) => setNewRewardTarget(e.target.value)}
              placeholder="Coins needed"
              className="w-full mb-2 rounded-md px-2.5 py-2 text-xl outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
            />
            <div className="flex gap-2">
              <button onClick={addReward} className="flex-1 py-2 rounded-md text-lg font-semibold" style={{ background: GOLD, color: 'var(--text-on-gold)', fontFamily: 'Inter, sans-serif' }}>
                Add reward
              </button>
              <button onClick={() => setAddingReward(false)} className="px-3 py-2 rounded-md text-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingReward(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xl"
            style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)', fontFamily: 'Inter, sans-serif' }}
          >
            <Plus size={19} /> New reward
          </button>
        )}
      </div>

      <h3 className="text-lg uppercase tracking-[0.2em] mb-3 px-1" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
        Full ledger
      </h3>
      {data.transactions.length === 0 ? (
        <div className="text-xl px-1" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
          No transactions yet.
        </div>
      ) : (
        <ul className="space-y-2 pb-4">
          {data.transactions.map((t) => {
            const { label, amountLabel, color, Icon } = describeTx(t);
            return (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-base uppercase font-semibold px-2 py-0.5 rounded flex-shrink-0"
                    style={{ background: ACCENTS[t.kid].bg, color: ACCENTS[t.kid].c }}
                  >
                    {t.kid}
                  </span>
                  <Icon size={19} style={{ color, flexShrink: 0 }} />
                  <span className="text-xl truncate" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                    {label}
                  </span>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 pl-2">
                  {amountLabel && (
                    <span
                      className="text-xl font-semibold tabular-nums"
                      style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {amountLabel}
                    </span>
                  )}
                  <span className="text-base" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
                    {fmtDate(t.ts)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ThemePicker({ themeName, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-lg"
        style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
      >
        <Palette size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 z-20 rounded-xl p-2 flex flex-col gap-1"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: '160px' }}
          >
            {Object.entries(THEMES).map(([key, t]) => (
              <button
                key={key}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-lg"
                style={{
                  background: themeName === key ? 'var(--bg)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <span
                  className="rounded-full flex-shrink-0"
                  style={{ width: 18, height: 18, background: t.swatch, border: '1px solid rgba(0,0,0,0.2)' }}
                />
                {t.label}
                {themeName === key && <Check size={16} style={{ color: t.swatch, marginLeft: 'auto' }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CoinBank() {
  const [data, setDataRaw] = useState(defaultData);
  const [themeName, setThemeName] = useState(getStoredTheme);

  const changeTheme = (name) => {
    setThemeName(name);
    try {
      localStorage.setItem(THEME_KEY, name);
    } catch (e) {
      // ignore — theme just won't persist this session
    }
  };
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('Ryan');
  const [syncError, setSyncError] = useState(null);
  // Tracks in-flight local writes so background refresh doesn't clobber them
  const pendingWrites = React.useRef(0);

  const refresh = useCallback(async () => {
    if (pendingWrites.current > 0) return; // don't overwrite unsaved local changes
    try {
      const parsed = await storageAdapter.load();
      if (parsed) setDataRaw(withDefaults(parsed));
      setSyncError(null);
    } catch (e) {
      setSyncError('Could not load the latest data. Check your internet connection.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoaded(true);
    })();
    // Poll for changes made on other devices (e.g. a kid submitting a request
    // while the parent's tab is open). Shared storage has no push updates.
    const interval = setInterval(refresh, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const setData = useCallback((updater) => {
    pendingWrites.current += 1;
    setDataRaw((prev) => {
      const next = pruneData(typeof updater === 'function' ? updater(prev) : updater);
      storageAdapter
        .save(next)
        .then(() => setSyncError(null))
        .catch(() => {
          setSyncError("Your last change didn't save. Check your internet connection and try again.");
        })
        .finally(() => {
          pendingWrites.current = Math.max(0, pendingWrites.current - 1);
        });
      return next;
    });
  }, []);

  const addBucket = useCallback((kid, name, target) => {
    const bucket = { id: uid(), name, target, saved: 0 };
    const tx = { id: uid(), kid, type: 'bucket_create', amount: 0, reason: name, bucketName: name, ts: Date.now() };
    setData((prev) => ({
      ...prev,
      buckets: { ...prev.buckets, [kid]: [...prev.buckets[kid], bucket] },
      transactions: [tx, ...prev.transactions],
    }));
  }, [setData]);

  const depositToBucket = useCallback((kid, bucketId, amount) => {
    setData((prev) => {
      if (amount > prev.balances[kid]) return prev;
      const bucket = prev.buckets[kid].find((b) => b.id === bucketId);
      const tx = { id: uid(), kid, type: 'bucket_deposit', amount: -amount, reason: bucket ? bucket.name : '', bucketName: bucket ? bucket.name : '', ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [kid]: prev.balances[kid] - amount },
        buckets: {
          ...prev.buckets,
          [kid]: prev.buckets[kid].map((b) => (b.id === bucketId ? { ...b, saved: b.saved + amount } : b)),
        },
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const withdrawFromBucket = useCallback((kid, bucketId, amount) => {
    setData((prev) => {
      const bucket = prev.buckets[kid].find((b) => b.id === bucketId);
      if (!bucket || amount > bucket.saved) return prev;
      const tx = { id: uid(), kid, type: 'bucket_withdraw', amount: amount, reason: bucket.name, bucketName: bucket.name, ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [kid]: prev.balances[kid] + amount },
        buckets: {
          ...prev.buckets,
          [kid]: prev.buckets[kid].map((b) => (b.id === bucketId ? { ...b, saved: b.saved - amount } : b)),
        },
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const claimBucket = useCallback((kid, bucketId) => {
    setData((prev) => {
      const bucket = prev.buckets[kid].find((b) => b.id === bucketId);
      if (!bucket || bucket.claimPending) return prev;
      const tx = { id: uid(), kid, type: 'claim_request', amount: 0, reason: bucket.name, bucketName: bucket.name, ts: Date.now() };
      return {
        ...prev,
        buckets: {
          ...prev.buckets,
          [kid]: prev.buckets[kid].map((b) => (b.id === bucketId ? { ...b, claimPending: true } : b)),
        },
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const deleteBucket = useCallback((kid, bucketId) => {
    setData((prev) => {
      const bucket = prev.buckets[kid].find((b) => b.id === bucketId);
      if (!bucket) return prev;
      const tx = { id: uid(), kid, type: 'bucket_delete', amount: bucket.saved, reason: bucket.name, bucketName: bucket.name, ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [kid]: prev.balances[kid] + bucket.saved },
        buckets: { ...prev.buckets, [kid]: prev.buckets[kid].filter((b) => b.id !== bucketId) },
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);


  const editBucketTarget = useCallback((kid, bucketId, newTarget) => {
    setData((prev) => {
      const bucket = prev.buckets[kid].find((b) => b.id === bucketId);
      if (!bucket) return prev;
      const tx = { id: uid(), kid, type: 'bucket_edit', amount: 0, reason: bucket.name, bucketName: bucket.name, newTarget, ts: Date.now() };
      return {
        ...prev,
        buckets: {
          ...prev.buckets,
          [kid]: prev.buckets[kid].map((b) => (b.id === bucketId ? { ...b, target: newTarget } : b)),
        },
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const requestTask = useCallback((kid, taskId) => {
    setData((prev) => {
      const task = prev.taskCatalog.find((t) => t.id === taskId);
      if (!task) return prev;
      const alreadyPending = prev.taskRequests.some((r) => r.kid === kid && r.taskId === taskId && r.status === 'pending');
      if (alreadyPending) return prev;
      const request = { id: uid(), kid, taskId, taskName: task.name, coins: task.coins, status: 'pending', ts: Date.now() };
      const tx = { id: uid(), kid, type: 'task_request', amount: 0, reason: task.name, ts: Date.now() };
      return {
        ...prev,
        taskRequests: [request, ...prev.taskRequests],
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const requestCustomTask = useCallback((kid, name, coins) => {
    setData((prev) => {
      const request = { id: uid(), kid, taskId: null, taskName: name, coins, status: 'pending', custom: true, ts: Date.now() };
      const tx = { id: uid(), kid, type: 'task_request', amount: 0, reason: `${name} (suggested)`, ts: Date.now() };
      return {
        ...prev,
        taskRequests: [request, ...prev.taskRequests],
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const requestAdvance = useCallback((kid, rewardName, cost) => {
    setData((prev) => {
      const alreadyPending = prev.debtRequests.some((r) => r.kid === kid && r.rewardName === rewardName && r.status === 'pending');
      if (alreadyPending) return prev;
      const request = { id: uid(), kid, rewardName, cost, status: 'pending', ts: Date.now() };
      const tx = { id: uid(), kid, type: 'debt_request', amount: 0, reason: `${rewardName} (${cost})`, ts: Date.now() };
      return {
        ...prev,
        debtRequests: [request, ...prev.debtRequests],
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const payDownDebt = useCallback((kid, amount) => {
    setData((prev) => {
      const applied = Math.min(amount, prev.balances[kid], prev.debits[kid]);
      if (applied <= 0) return prev;
      const tx = { id: uid(), kid, type: 'debt_paydown', amount: applied, reason: '', ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [kid]: prev.balances[kid] - applied },
        debits: { ...prev.debits, [kid]: prev.debits[kid] - applied },
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const addPlanItem = useCallback((kid, name, coins, taskId) => {
    setData((prev) => {
      const item = { id: uid(), name, coins, taskId: taskId || null, date: todayStr(), done: false, requestId: null, ts: Date.now() };
      return {
        ...prev,
        dailyPlans: { ...prev.dailyPlans, [kid]: [...(prev.dailyPlans[kid] || []), item] },
      };
    });
  }, [setData]);

  const togglePlanDone = useCallback((kid, itemId) => {
    setData((prev) => ({
      ...prev,
      dailyPlans: {
        ...prev.dailyPlans,
        [kid]: (prev.dailyPlans[kid] || []).map((it) =>
          it.id === itemId && !it.requestId ? { ...it, done: !it.done } : it
        ),
      },
    }));
  }, [setData]);

  const removePlanItem = useCallback((kid, itemId) => {
    setData((prev) => ({
      ...prev,
      dailyPlans: {
        ...prev.dailyPlans,
        [kid]: (prev.dailyPlans[kid] || []).filter((it) => !(it.id === itemId && !it.requestId)),
      },
    }));
  }, [setData]);

  const requestPlanCoins = useCallback((kid, itemId) => {
    setData((prev) => {
      const item = (prev.dailyPlans[kid] || []).find((it) => it.id === itemId);
      if (!item || !item.done || item.requestId) return prev;
      const requestId = uid();
      const request = {
        id: requestId,
        kid,
        taskId: item.taskId,
        taskName: item.name,
        coins: item.coins,
        status: 'pending',
        custom: !item.taskId,
        ts: Date.now(),
      };
      const tx = { id: uid(), kid, type: 'task_request', amount: 0, reason: item.name, ts: Date.now() };
      return {
        ...prev,
        taskRequests: [request, ...prev.taskRequests],
        transactions: [tx, ...prev.transactions],
        dailyPlans: {
          ...prev.dailyPlans,
          [kid]: prev.dailyPlans[kid].map((it) => (it.id === itemId ? { ...it, requestId } : it)),
        },
      };
    });
  }, [setData]);

  const sendTransfer = useCallback((fromKid, toKid, amount, note) => {
    setData((prev) => {
      if (amount <= 0 || amount > prev.balances[fromKid]) return prev;
      // Coins leave the sender immediately (held in escrow) so they can't be
      // spent twice while the recipient decides. Declining returns them.
      const transfer = { id: uid(), from: fromKid, to: toKid, amount, note: (note || '').trim(), status: 'pending', ts: Date.now() };
      const tx = { id: uid(), kid: fromKid, type: 'transfer_sent', amount, toKid, reason: transfer.note, ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [fromKid]: prev.balances[fromKid] - amount },
        transfers: [transfer, ...prev.transfers],
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const acceptTransfer = useCallback((transferId) => {
    setData((prev) => {
      const tr = prev.transfers.find((t) => t.id === transferId);
      if (!tr || tr.status !== 'pending') return prev;
      const tx = { id: uid(), kid: tr.to, type: 'transfer_received', amount: tr.amount, fromKid: tr.from, reason: tr.note, ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [tr.to]: prev.balances[tr.to] + tr.amount },
        transfers: prev.transfers.map((t) => (t.id === transferId ? { ...t, status: 'accepted' } : t)),
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const declineTransfer = useCallback((transferId) => {
    setData((prev) => {
      const tr = prev.transfers.find((t) => t.id === transferId);
      if (!tr || tr.status !== 'pending') return prev;
      const tx = { id: uid(), kid: tr.from, type: 'transfer_declined', amount: tr.amount, toKid: tr.to, reason: tr.note, ts: Date.now() };
      return {
        ...prev,
        balances: { ...prev.balances, [tr.from]: prev.balances[tr.from] + tr.amount },
        transfers: prev.transfers.map((t) => (t.id === transferId ? { ...t, status: 'declined' } : t)),
        transactions: [tx, ...prev.transactions],
      };
    });
  }, [setData]);

  const resetTestAccount = useCallback(() => {
    setData((prev) => ({
      ...prev,
      balances: { ...prev.balances, [TEST_KID]: 0 },
      debits: { ...prev.debits, [TEST_KID]: 0 },
      buckets: { ...prev.buckets, [TEST_KID]: [] },
      transactions: prev.transactions.filter((t) => t.kid !== TEST_KID),
      taskRequests: prev.taskRequests.filter((r) => r.kid !== TEST_KID),
      debtRequests: prev.debtRequests.filter((r) => r.kid !== TEST_KID),
      transfers: prev.transfers.filter((t) => t.from !== TEST_KID && t.to !== TEST_KID),
      dailyPlans: { ...prev.dailyPlans, [TEST_KID]: [] },
    }));
  }, [setData]);

  const tabs = [...KIDS, 'Parent'];

  return (
    <div
      className="min-h-screen w-full py-8 px-4"
      style={themeVars(themeName)}
    >
      <div className="max-w-lg mx-auto mb-8 relative">
        <div className="absolute right-0 top-0">
          <ThemePicker themeName={themeName} onChange={changeTheme} />
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Coins size={28} style={{ color: GOLD }} />
            <h1 className="text-4xl font-bold" style={{ fontFamily: "'Fredoka', sans-serif", color: 'var(--text-bright)' }}>
              The Coin Bank
            </h1>
          </div>
          <p className="text-lg" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
            A little passbook for big savers
          </p>
        </div>
      </div>

      {syncError && (
        <div className="max-w-lg mx-auto mb-6 rounded-lg px-4 py-3 flex items-start justify-between gap-3" style={{ background: 'rgba(232,93,117,0.12)', border: '1px solid #E85D75' }}>
          <span className="text-lg" style={{ color: '#E85D75', fontFamily: 'Inter, sans-serif' }}>
            {syncError}
          </span>
          <button onClick={() => setSyncError(null)} style={{ color: '#E85D75', flexShrink: 0 }}>
            <X size={19} />
          </button>
        </div>
      )}

      <div className="max-w-lg mx-auto flex gap-2 mb-8">
        {tabs.map((t) => {
          const pendingCount =
            data.taskRequests.filter((r) => r.status === 'pending').length +
            KIDS.reduce((sum, k) => sum + (data.buckets[k] || []).filter((b) => b.claimPending).length, 0) +
            data.debtRequests.filter((r) => r.status === 'pending').length;
          const incomingCount = t !== 'Parent'
            ? data.transfers.filter((tr) => tr.to === t && tr.status === 'pending').length
            : 0;
          return (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-3 rounded-xl text-xl font-medium transition-colors flex items-center justify-center gap-1.5 relative"
            style={{
              background: tab === t ? (t === 'Parent' ? 'rgba(var(--gold-rgb), 0.14)' : ACCENTS[t]?.bg) : 'var(--surface)',
              border: `1px solid ${tab === t ? (t === 'Parent' ? GOLD : ACCENTS[t]?.ring) : 'var(--border)'}`,
              color: tab === t ? (t === 'Parent' ? GOLD : ACCENTS[t]?.c) : 'var(--text-muted)',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {t === 'Parent' && <Lock size={17} />}
            {t}
            {t === 'Parent' && pendingCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 text-base font-bold rounded-full w-6 h-6 flex items-center justify-center"
                style={{ background: '#E85D75', color: '#fff' }}
              >
                {pendingCount}
              </span>
            )}
            {incomingCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 text-base font-bold rounded-full w-6 h-6 flex items-center justify-center"
                style={{ background: 'var(--gold)', color: 'var(--text-on-gold)' }}
              >
                {incomingCount}
              </span>
            )}
          </button>
          );
        })}
      </div>

      {!loaded ? (
        <div className="text-center text-xl" style={{ color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
          Loading passbook…
        </div>
      ) : tab === 'Parent' ? (
        <ParentPanel data={data} setData={setData} onOpenTest={() => setTab(TEST_KID)} />
      ) : (
        <KidPassbook
          kid={tab}
          balance={data.balances[tab]}
          transactions={data.transactions}
          buckets={data.buckets[tab]}
          onAddBucket={(name, target) => addBucket(tab, name, target)}
          onDeposit={(bucketId, amount) => depositToBucket(tab, bucketId, amount)}
          onWithdraw={(bucketId, amount) => withdrawFromBucket(tab, bucketId, amount)}
          onClaim={(bucketId) => claimBucket(tab, bucketId)}
          onDeleteBucket={(bucketId) => deleteBucket(tab, bucketId)}
          onEditBucket={(bucketId, newTarget) => editBucketTarget(tab, bucketId, newTarget)}
          taskCatalog={data.taskCatalog}
          taskRequests={data.taskRequests}
          onRequestTask={(taskId) => requestTask(tab, taskId)}
          onRequestCustomTask={(name, coins) => requestCustomTask(tab, name, coins)}
          rewardCatalog={data.rewardCatalog}
          debit={data.debits[tab]}
          debtRequests={data.debtRequests}
          onRequestAdvance={(rewardName, cost) => requestAdvance(tab, rewardName, cost)}
          onPayDownDebt={(amount) => payDownDebt(tab, amount)}
          onBack={() => setTab('Parent')}
          onResetTest={resetTestAccount}
          transfers={data.transfers}
          onSendTransfer={(toKid, amount, note) => sendTransfer(tab, toKid, amount, note)}
          onAcceptTransfer={(transferId) => acceptTransfer(transferId)}
          onDeclineTransfer={(transferId) => declineTransfer(transferId)}
          dailyPlan={data.dailyPlans[tab]}
          onAddPlanItem={(name, coins, taskId) => addPlanItem(tab, name, coins, taskId)}
          onTogglePlanItem={(itemId) => togglePlanDone(tab, itemId)}
          onRemovePlanItem={(itemId) => removePlanItem(tab, itemId)}
          onRequestPlanCoins={(itemId) => requestPlanCoins(tab, itemId)}
        />
      )}
    </div>
  );
}

// --- Site-wide password gate ------------------------------------------
// This is deliberately simple: it just keeps casual/accidental visitors
// with the URL out. It is NOT real security — the password lives in this
// public source file, so anyone determined to read the code can find it.
// For real protection (blocking direct API access, not just the UI), the
// next step up is Supabase Auth.
const SITE_PASSWORD = 'ChenFamily2026';
const GATE_KEY = 'coinbank-site-unlocked';

function SiteGate() {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return localStorage.getItem(GATE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  });
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);
  const [themeName] = useState(getStoredTheme);

  const submit = (e) => {
    e.preventDefault();
    if (entry === SITE_PASSWORD) {
      try {
        localStorage.setItem(GATE_KEY, 'true');
      } catch (e) {
        // localStorage unavailable (e.g. private browsing) — still unlock for this session
      }
      setUnlocked(true);
    } else {
      setError(true);
      setEntry('');
      setTimeout(() => setError(false), 900);
    }
  };

  if (unlocked) return <CoinBank />;

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4"
      style={themeVars(themeName)}
    >
      <form onSubmit={submit} className="max-w-xs w-full text-center">
        <Coins size={36} style={{ color: GOLD }} className="mx-auto mb-3" />
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Fredoka', sans-serif", color: 'var(--text-bright)' }}>
          The Coin Bank
        </h1>
        <p className="text-xl mb-6" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
          Enter the family password to continue
        </p>
        <input
          type="password"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          autoFocus
          className="w-full mb-3 rounded-lg px-3 py-3 text-xl outline-none text-center"
          style={{
            background: 'var(--surface)',
            border: `1px solid ${error ? '#E85D75' : 'var(--border)'}`,
            color: 'var(--text-primary)',
            fontFamily: 'Inter, sans-serif',
          }}
        />
        {error && (
          <p className="text-lg mb-3" style={{ color: '#E85D75', fontFamily: 'Inter, sans-serif' }}>
            That's not it — try again.
          </p>
        )}
        <button
          type="submit"
          className="w-full py-3 rounded-lg text-xl font-semibold"
          style={{ background: GOLD, color: 'var(--text-on-gold)', fontFamily: 'Inter, sans-serif' }}
        >
          Enter
        </button>
      </form>
    </div>
  );
}

export default SiteGate;
