import React, { useState, useEffect, useCallback } from 'react';
import { Coins, Lock, Plus, Minus, Settings, ArrowUpCircle, ArrowDownCircle, X, Check, Target, Trash2, Gift, Pencil, Download, Upload, ClipboardList, Send, ThumbsDown } from 'lucide-react';
import { storageAdapter } from './storageAdapter';

const KIDS = ['Ryan', 'Emma'];
const ACCENTS = {
  Ryan: { c: '#3FA796', bg: 'rgba(63,167,150,0.14)', ring: 'rgba(63,167,150,0.45)' },
  Emma: { c: '#E85D75', bg: 'rgba(232,93,117,0.14)', ring: 'rgba(232,93,117,0.45)' },
};
const GOLD = '#E8B94A';

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
function withDefaults(parsed) {
  if (!parsed) return defaultData;
  return {
    ...defaultData,
    ...parsed,
    balances: { Ryan: 0, Emma: 0, ...(parsed.balances || {}) },
    buckets: { Ryan: [], Emma: [], ...(parsed.buckets || {}) },
    transactions: parsed.transactions || [],
    rewardCatalog: parsed.rewardCatalog || defaultData.rewardCatalog,
    taskCatalog: parsed.taskCatalog || defaultData.taskCatalog,
    taskRequests: parsed.taskRequests || [],
  };
}

const defaultData = {
  pin: '1234',
  balances: { Ryan: 0, Emma: 0 },
  buckets: { Ryan: [], Emma: [] },
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
};

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function describeTx(t) {
  switch (t.type) {
    case 'bucket_create':
      return { label: `Started goal: ${t.bucketName}`, amountLabel: '', color: '#8B94A3', Icon: Target };
    case 'bucket_deposit':
      return { label: `Moved into ${t.bucketName}`, amountLabel: `${t.amount}`, color: '#8B94A3', Icon: Target };
    case 'bucket_withdraw':
      return { label: `Took back from ${t.bucketName}`, amountLabel: `+${t.amount}`, color: '#8B94A3', Icon: Target };
    case 'bucket_claim':
      return { label: `Reward approved: ${t.bucketName}`, amountLabel: `${t.amount} spent`, color: GOLD, Icon: Gift };
    case 'claim_request':
      return { label: `Asked to claim: ${t.bucketName}`, amountLabel: '', color: '#8B94A3', Icon: Gift };
    case 'claim_rejected':
      return { label: `Claim declined: ${t.bucketName}`, amountLabel: '', color: '#E85D75', Icon: ThumbsDown };
    case 'bucket_delete':
      return { label: `Removed goal: ${t.bucketName}`, amountLabel: t.amount > 0 ? `+${t.amount}` : '', color: '#8B94A3', Icon: Trash2 };
    case 'bucket_edit':
      return { label: `Changed ${t.bucketName} goal to ${t.newTarget}`, amountLabel: '', color: '#8B94A3', Icon: Pencil };
    case 'task_request':
      return { label: `Requested: ${t.reason}`, amountLabel: '', color: '#8B94A3', Icon: Send };
    case 'task_approved':
      return { label: `Approved: ${t.reason}`, amountLabel: `+${t.amount}`, color: '#3FA796', Icon: Check };
    case 'task_rejected':
      return { label: `Declined: ${t.reason}`, amountLabel: '', color: '#E85D75', Icon: ThumbsDown };
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
      <div className="text-sm text-center" style={{ color: count < 0 ? '#E85D75' : '#5B6373', fontFamily: 'Inter, sans-serif' }}>
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
        <div className="text-xs tracking-wide mt-1" style={{ color: accent.c }}>
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
    <div className="rounded-lg p-3 mb-2" style={{ background: '#1F2836', border: '1px solid #2A3444' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target size={16} style={{ color: accent.c, flexShrink: 0 }} />
          <span className="text-base font-medium truncate" style={{ color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}>
            {bucket.name}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm tabular-nums" style={{ color: '#8B94A3', fontFamily: "'JetBrains Mono', monospace" }}>
            {bucket.saved}/{bucket.target}
          </span>
          <button onClick={() => { setEditing((e) => !e); setEditTarget(String(bucket.target)); }} style={{ color: '#5B6373' }}>
            <Pencil size={15} />
          </button>
          <button onClick={() => onDelete(bucket.id)} style={{ color: '#5B6373' }}>
            <Trash2 size={15} />
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
            className="flex-1 min-w-0 rounded-md px-2 py-1 text-sm outline-none"
            style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button onClick={saveTarget} className="text-sm px-2 py-1 rounded-md flex-shrink-0" style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}` }}>
            Save
          </button>
          <button onClick={() => setEditing(false)} style={{ color: '#5B6373' }}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: '#151C27' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: reached ? GOLD : accent.c }}
        />
      </div>

      {reached ? (
        bucket.claimPending ? (
          <div
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm"
            style={{ color: GOLD, border: `1px dashed ${GOLD}`, fontFamily: 'Inter, sans-serif' }}
          >
            <Gift size={15} /> Waiting for parent approval
          </div>
        ) : (
          <button
            onClick={() => onClaim(bucket.id)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-semibold"
            style={{ background: GOLD, color: '#1B2430', fontFamily: 'Inter, sans-serif' }}
          >
            <Gift size={15} /> Goal reached — ask to claim!
          </button>
        )
      ) : open ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            placeholder="Coins"
            className="flex-1 min-w-0 rounded-md px-2 py-1 text-sm outline-none"
            style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button onClick={deposit} className="text-sm px-2 py-1 rounded-md flex-shrink-0" style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}` }}>
            Add
          </button>
          {bucket.saved > 0 && (
            <button onClick={withdraw} className="text-sm px-2 py-1 rounded-md flex-shrink-0" style={{ color: '#8B94A3', border: '1px solid #2A3444' }}>
              Take out
            </button>
          )}
          <button onClick={() => setOpen(false)} style={{ color: '#5B6373' }}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-sm py-1.5 rounded-md"
          style={{ color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
        >
          Move coins in / out
        </button>
      )}
    </div>
  );
}

function BucketSection({ kid, balance, buckets, onAdd, onDeposit, onWithdraw, onClaim, onDelete, onEditTarget, rewardCatalog }) {
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

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm uppercase tracking-[0.2em]" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
          Savings goals
        </h3>
        <span className="text-sm tabular-nums" style={{ color: '#5B6373', fontFamily: "'JetBrains Mono', monospace" }}>
          {balance} unallocated
        </span>
      </div>

      {buckets.length === 0 && !creating && (
        <div className="text-base px-1 mb-3" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
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
        <div className="flex flex-wrap gap-2 mb-3">
          {rewardCatalog.map((r) => (
            <button
              key={r.id}
              onClick={() => pickReward(r)}
              className="text-sm px-2.5 py-1.5 rounded-full flex items-center gap-1"
              style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
            >
              <Gift size={13} /> {r.name} · {r.target}
            </button>
          ))}
        </div>
      )}

      {creating ? (
        <div className="rounded-lg p-3" style={{ background: '#1F2836', border: `1px solid ${accent.ring}` }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goal name (e.g. Lego set)"
            className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
            style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}
          />
          <input
            type="number"
            min="1"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Coins needed (e.g. 160)"
            className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
            style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <div className="flex gap-2">
            <button onClick={create} className="flex-1 py-1.5 rounded-md text-sm font-semibold" style={{ background: accent.c, color: '#151C27', fontFamily: 'Inter, sans-serif' }}>
              Create goal
            </button>
            <button onClick={() => setCreating(false)} className="px-3 py-1.5 rounded-md text-sm" style={{ color: '#8B94A3', border: '1px solid #2A3444' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-base"
          style={{ color: accent.c, border: `1px dashed ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
        >
          <Plus size={16} /> New goal
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
    <div className="mt-6">
      <h3 className="text-sm uppercase tracking-[0.2em] mb-3 px-1" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
        Earn coins
      </h3>
      {myTasks.length === 0 ? (
        <div className="text-base px-1 mb-3" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
          No tasks set up yet. Ask a parent to add some, or suggest your own below.
        </div>
      ) : (
        <ul className="space-y-2 mb-3">
          {myTasks.map((task) => {
            const pending = pendingTaskIds.has(task.id);
            return (
              <li
                key={task.id}
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: '#1F2836', border: '1px solid #2A3444' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ClipboardList size={17} style={{ color: accent.c, flexShrink: 0 }} />
                  <span className="text-base truncate" style={{ color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}>
                    {task.name}
                  </span>
                  <span
                    className="text-sm flex-shrink-0 px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(232,185,74,0.14)', color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {task.coins}
                  </span>
                </div>
                {pending ? (
                  <span className="text-sm flex-shrink-0" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
                    Waiting for approval
                  </span>
                ) : (
                  <button
                    onClick={() => onRequest(task.id)}
                    className="text-sm px-2.5 py-1.5 rounded-md flex-shrink-0 flex items-center gap-1"
                    style={{ background: accent.bg, color: accent.c, border: `1px solid ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
                  >
                    <Send size={13} /> I did this
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {customOpen ? (
        <div className="rounded-lg p-3" style={{ background: '#1F2836', border: `1px solid ${accent.ring}` }}>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="What did you do?"
            className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
            style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}
          />
          <input
            type="number"
            min="1"
            value={customCoins}
            onChange={(e) => setCustomCoins(e.target.value)}
            placeholder="Coins you think it's worth"
            className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
            style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <div className="flex gap-2">
            <button onClick={submitCustom} className="flex-1 py-1.5 rounded-md text-sm font-semibold flex items-center justify-center gap-1" style={{ background: accent.c, color: '#151C27', fontFamily: 'Inter, sans-serif' }}>
              <Send size={14} /> Send request
            </button>
            <button onClick={() => setCustomOpen(false)} className="px-3 py-1.5 rounded-md text-sm" style={{ color: '#8B94A3', border: '1px solid #2A3444' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCustomOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-base"
          style={{ color: accent.c, border: `1px dashed ${accent.ring}`, fontFamily: 'Inter, sans-serif' }}
        >
          <Plus size={16} /> Suggest something I did
        </button>
      )}
    </div>
  );
}

function KidPassbook({ kid, balance, transactions, buckets, onAddBucket, onDeposit, onWithdraw, onClaim, onDeleteBucket, onEditBucket, taskCatalog, taskRequests, onRequestTask, onRequestCustomTask, rewardCatalog }) {
  const accent = ACCENTS[kid];
  const kidTx = transactions.filter((t) => t.kid === kid).slice(0, 8);
  return (
    <div className="max-w-md mx-auto">
      <div
        className="rounded-2xl p-6 border"
        style={{ background: accent.bg, borderColor: accent.ring }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm uppercase tracking-[0.2em]" style={{ color: accent.c, fontFamily: 'Inter, sans-serif' }}>
            {kid}'s account
          </span>
          <Coins size={18} style={{ color: GOLD }} />
        </div>
        <div
          className="text-7xl font-bold mt-2 mb-4 tabular-nums"
          style={{ fontFamily: "'Fredoka', sans-serif", color: balance < 0 ? '#E85D75' : '#F1EFEA' }}
        >
          {balance}
        </div>
        <div className="text-sm mb-4" style={{ color: balance < 0 ? '#E85D75' : '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
          {balance < 0 ? 'coins owed' : `${balance === 1 ? 'coin' : 'coins'} unallocated`}
        </div>
        <CoinStack count={balance} accent={accent} />
      </div>

      <TaskBoard kid={kid} taskCatalog={taskCatalog} taskRequests={taskRequests} onRequest={onRequestTask} onRequestCustom={onRequestCustomTask} />

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
      />

      <div className="mt-6">
        <h3
          className="text-sm uppercase tracking-[0.2em] mb-3 px-1"
          style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}
        >
          Recent activity
        </h3>
        {kidTx.length === 0 ? (
          <div className="text-base px-1" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
            No entries yet. Ask a parent to add your first coins!
          </div>
        ) : (
          <ul className="space-y-2">
            {kidTx.map((t) => {
              const { label, amountLabel, color, Icon } = describeTx(t);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: '#1F2836', border: '1px solid #2A3444' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={18} style={{ color, flexShrink: 0 }} />
                    <span className="text-base truncate" style={{ color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}>
                      {label}
                    </span>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 pl-2">
                    {amountLabel && (
                      <span
                        className="text-base font-semibold tabular-nums"
                        style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {amountLabel}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
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
      <Lock size={32} style={{ color: GOLD }} className="mx-auto mb-3" />
      <div className="text-base mb-5" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
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
              className="rounded-xl py-3 text-xl font-medium transition-colors"
              style={{ background: '#1F2836', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {d}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ParentPanel({ data, setData }) {
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

  const applyTransaction = () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return;
    const signed = mode === 'add' ? amt : -amt;
    const tx = { id: uid(), kid: selKid, amount: signed, reason: reason.trim(), ts: Date.now() };
    setData((prev) => ({
      ...prev,
      balances: { ...prev.balances, [selKid]: prev.balances[selKid] + signed },
      transactions: [tx, ...prev.transactions],
    }));
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
          className="mb-4 rounded-lg px-4 py-2 text-base flex items-center gap-2"
          style={{ background: 'rgba(63,167,150,0.15)', border: '1px solid rgba(63,167,150,0.4)', color: '#3FA796', fontFamily: 'Inter, sans-serif' }}
        >
          <Check size={16} /> {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm uppercase tracking-[0.2em]" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
          Parent control
        </span>
        <div className="flex items-center gap-2">
          <input type="file" accept="application/json" ref={fileInputRef} onChange={handleImportFile} className="hidden" />
          <button
            onClick={triggerImport}
            className="flex items-center gap-1 text-sm px-2 py-1 rounded-md"
            style={{ color: '#8B94A3', border: '1px solid #2A3444', fontFamily: 'Inter, sans-serif' }}
          >
            <Upload size={14} /> Restore
          </button>
          <button
            onClick={exportData}
            className="flex items-center gap-1 text-sm px-2 py-1 rounded-md"
            style={{ color: '#8B94A3', border: '1px solid #2A3444', fontFamily: 'Inter, sans-serif' }}
          >
            <Download size={14} /> Backup
          </button>
          <button
            onClick={() => setShowPinChange((s) => !s)}
            className="flex items-center gap-1 text-sm px-2 py-1 rounded-md"
            style={{ color: '#8B94A3', border: '1px solid #2A3444', fontFamily: 'Inter, sans-serif' }}
          >
            <Settings size={14} /> PIN
          </button>
        </div>
      </div>

      {showPinChange && (
        <div className="mb-4 rounded-lg p-3 flex items-center gap-2" style={{ background: '#1F2836', border: '1px solid #2A3444' }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            placeholder="New 4-digit PIN"
            className="flex-1 bg-transparent outline-none text-base"
            style={{ color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button onClick={savePin} className="text-sm px-2 py-1 rounded-md" style={{ background: GOLD, color: '#1B2430' }}>
            Save
          </button>
          <button onClick={() => setShowPinChange(false)} className="text-sm px-1" style={{ color: '#5B6373' }}>
            <X size={16} />
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
            <div className="text-sm uppercase tracking-[0.15em] mb-1" style={{ color: ACCENTS[kid].c, fontFamily: 'Inter, sans-serif' }}>
              {kid}
            </div>
            <div className="text-4xl font-bold tabular-nums" style={{ fontFamily: "'Fredoka', sans-serif", color: data.balances[kid] < 0 ? '#E85D75' : '#F1EFEA' }}>
              {data.balances[kid]}
            </div>
          </div>
        ))}
      </div>

      {(pendingRequests.length > 0 || pendingClaims.length > 0) && (
        <div className="mb-6">
          <h3 className="text-sm uppercase tracking-[0.2em] mb-3 px-1" style={{ color: GOLD, fontFamily: 'Inter, sans-serif' }}>
            Pending requests ({pendingRequests.length + pendingClaims.length})
          </h3>
          <ul className="space-y-2">
            {pendingRequests.map((req) => (
              <li
                key={req.id}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 gap-2"
                style={{ background: 'rgba(232,185,74,0.1)', border: `1px solid ${GOLD}` }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-xs uppercase font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: ACCENTS[req.kid].bg, color: ACCENTS[req.kid].c }}
                  >
                    {req.kid}
                  </span>
                  <span className="text-base truncate" style={{ color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}>
                    {req.taskName}
                  </span>
                  {req.custom && (
                    <span className="text-xs flex-shrink-0 px-1 rounded" style={{ background: '#2A3444', color: '#8B94A3' }}>
                      suggested
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number"
                    min="0"
                    value={getReqCoins(req)}
                    onChange={(e) => setReqCoins(req.id, e.target.value)}
                    className="w-14 text-center rounded-md py-1 text-sm outline-none"
                    style={{ background: '#151C27', border: '1px solid #2A3444', color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <button onClick={() => approveRequest(req.id)} className="p-1.5 rounded-md" style={{ background: 'rgba(63,167,150,0.18)', color: '#3FA796' }}>
                    <Check size={17} />
                  </button>
                  <button onClick={() => rejectRequest(req.id)} className="p-1.5 rounded-md" style={{ background: 'rgba(232,93,117,0.18)', color: '#E85D75' }}>
                    <X size={17} />
                  </button>
                </div>
              </li>
            ))}
            {pendingClaims.map(({ kid, bucket }) => (
              <li
                key={`claim-${bucket.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 gap-2"
                style={{ background: 'rgba(232,185,74,0.1)', border: `1px solid ${GOLD}` }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-xs uppercase font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: ACCENTS[kid].bg, color: ACCENTS[kid].c }}
                  >
                    {kid}
                  </span>
                  <Gift size={16} style={{ color: GOLD, flexShrink: 0 }} />
                  <span className="text-base truncate" style={{ color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}>
                    {bucket.name}
                  </span>
                  <span className="text-sm flex-shrink-0" style={{ color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}>
                    {bucket.saved} coins
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => approveClaim(kid, bucket.id)} className="p-1.5 rounded-md" style={{ background: 'rgba(63,167,150,0.18)', color: '#3FA796' }}>
                    <Check size={17} />
                  </button>
                  <button onClick={() => rejectClaim(kid, bucket.id)} className="p-1.5 rounded-md" style={{ background: 'rgba(232,93,117,0.18)', color: '#E85D75' }}>
                    <X size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl p-4 mb-6" style={{ background: '#1F2836', border: '1px solid #2A3444' }}>
        <div className="flex gap-2 mb-3">
          {KIDS.map((kid) => (
            <button
              key={kid}
              onClick={() => setSelKid(kid)}
              className="flex-1 py-2 rounded-lg text-base font-medium transition-colors"
              style={{
                background: selKid === kid ? ACCENTS[kid].bg : 'transparent',
                border: `1px solid ${selKid === kid ? ACCENTS[kid].ring : '#2A3444'}`,
                color: selKid === kid ? ACCENTS[kid].c : '#8B94A3',
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
            className="flex-1 py-2 rounded-lg text-base font-medium flex items-center justify-center gap-1"
            style={{
              background: mode === 'add' ? 'rgba(63,167,150,0.18)' : 'transparent',
              border: `1px solid ${mode === 'add' ? '#3FA796' : '#2A3444'}`,
              color: mode === 'add' ? '#3FA796' : '#8B94A3',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <Plus size={16} /> Add
          </button>
          <button
            onClick={() => setMode('deduct')}
            className="flex-1 py-2 rounded-lg text-base font-medium flex items-center justify-center gap-1"
            style={{
              background: mode === 'deduct' ? 'rgba(232,93,117,0.18)' : 'transparent',
              border: `1px solid ${mode === 'deduct' ? '#E85D75' : '#2A3444'}`,
              color: mode === 'deduct' ? '#E85D75' : '#8B94A3',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <Minus size={16} /> Deduct
          </button>
        </div>

        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-full mb-2 rounded-lg px-3 py-2 text-base outline-none"
          style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (e.g. Practiced piano)"
          className="w-full mb-3 rounded-lg px-3 py-2 text-base outline-none"
          style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}
        />
        <button
          onClick={applyTransaction}
          disabled={!amount || parseInt(amount, 10) <= 0}
          className="w-full py-2 rounded-lg text-base font-semibold disabled:opacity-40"
          style={{ background: GOLD, color: '#1B2430', fontFamily: 'Inter, sans-serif' }}
        >
          {mode === 'add' ? 'Add coins' : 'Deduct coins'}
        </button>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-sm uppercase tracking-[0.2em]" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
            Task catalog
          </h3>
        </div>
        <ul className="space-y-2 mb-2">
          {data.taskCatalog.map((task) => {
            const assignedLabel = task.kids && task.kids.length === 1 ? `${task.kids[0]} only` : 'Both';
            const assignedColor = task.kids && task.kids.length === 1 ? ACCENTS[task.kids[0]] : { bg: '#2A3444', c: '#8B94A3' };
            return (
              <li key={task.id}>
                <div
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: '#1F2836', border: '1px solid #2A3444' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ClipboardList size={16} style={{ color: '#8B94A3', flexShrink: 0 }} />
                    <span className="text-base truncate" style={{ color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}>
                      {task.name}
                    </span>
                    <span className="text-sm flex-shrink-0" style={{ color: GOLD, fontFamily: "'JetBrains Mono', monospace" }}>
                      {task.coins}
                    </span>
                    <span className="text-xs flex-shrink-0 px-1 rounded" style={{ background: assignedColor.bg, color: assignedColor.c }}>
                      {assignedLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => startEditTask(task)} style={{ color: '#5B6373' }}>
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => deleteTask(task.id)} style={{ color: '#5B6373' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {editingTaskId === task.id && (
                  <div className="mt-1.5 rounded-lg p-3" style={{ background: '#1F2836', border: `1px solid ${GOLD}` }}>
                    <input
                      type="text"
                      value={editTaskName}
                      onChange={(e) => setEditTaskName(e.target.value)}
                      placeholder="Task name"
                      className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
                      style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}
                    />
                    <input
                      type="number"
                      min="1"
                      value={editTaskCoins}
                      onChange={(e) => setEditTaskCoins(e.target.value)}
                      placeholder="Coins"
                      className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
                      style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
                    />
                    <div className="flex gap-2 mb-2">
                      {KIDS.map((kid) => (
                        <button
                          key={kid}
                          onClick={() => toggleEditTaskKid(kid)}
                          className="flex-1 py-1.5 rounded-md text-sm"
                          style={{
                            background: editTaskKids.includes(kid) ? ACCENTS[kid].bg : 'transparent',
                            border: `1px solid ${editTaskKids.includes(kid) ? ACCENTS[kid].ring : '#2A3444'}`,
                            color: editTaskKids.includes(kid) ? ACCENTS[kid].c : '#8B94A3',
                            fontFamily: 'Inter, sans-serif',
                          }}
                        >
                          {kid} only
                        </button>
                      ))}
                    </div>
                    <div className="text-xs mb-2" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
                      Leave both unselected to make it available to everyone.
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveEditTask(task.id)} className="flex-1 py-1.5 rounded-md text-sm font-semibold" style={{ background: GOLD, color: '#1B2430', fontFamily: 'Inter, sans-serif' }}>
                        Save changes
                      </button>
                      <button onClick={() => setEditingTaskId(null)} className="px-3 py-1.5 rounded-md text-sm" style={{ color: '#8B94A3', border: '1px solid #2A3444' }}>
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
          <div className="rounded-lg p-3" style={{ background: '#1F2836', border: '1px solid #2A3444' }}>
            <input
              type="text"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              placeholder="Task name (e.g. Practice violin)"
              className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
              style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}
            />
            <input
              type="number"
              min="1"
              value={newTaskCoins}
              onChange={(e) => setNewTaskCoins(e.target.value)}
              placeholder="Coins earned"
              className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
              style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
            />
            <div className="flex gap-2 mb-2">
              {KIDS.map((kid) => (
                <button
                  key={kid}
                  onClick={() => toggleNewTaskKid(kid)}
                  className="flex-1 py-1.5 rounded-md text-sm"
                  style={{
                    background: newTaskKids.includes(kid) ? ACCENTS[kid].bg : 'transparent',
                    border: `1px solid ${newTaskKids.includes(kid) ? ACCENTS[kid].ring : '#2A3444'}`,
                    color: newTaskKids.includes(kid) ? ACCENTS[kid].c : '#8B94A3',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {kid} only
                </button>
              ))}
            </div>
            <div className="text-xs mb-2" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
              Leave both unselected to make it available to everyone.
            </div>
            <div className="flex gap-2">
              <button onClick={addTask} className="flex-1 py-1.5 rounded-md text-sm font-semibold" style={{ background: GOLD, color: '#1B2430', fontFamily: 'Inter, sans-serif' }}>
                Add task
              </button>
              <button onClick={() => setAddingTask(false)} className="px-3 py-1.5 rounded-md text-sm" style={{ color: '#8B94A3', border: '1px solid #2A3444' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingTask(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-base"
            style={{ color: '#8B94A3', border: '1px dashed #2A3444', fontFamily: 'Inter, sans-serif' }}
          >
            <Plus size={16} /> New task
          </button>
        )}
      </div>

      <div className="mb-6">
        <h3 className="text-sm uppercase tracking-[0.2em] mb-3 px-1" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
          Reward catalog
        </h3>
        <ul className="space-y-2 mb-2">
          {data.rewardCatalog.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: '#1F2836', border: '1px solid #2A3444' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Gift size={16} style={{ color: GOLD, flexShrink: 0 }} />
                <span className="text-base truncate" style={{ color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}>
                  {r.name}
                </span>
                <span className="text-sm flex-shrink-0" style={{ color: '#8B94A3', fontFamily: "'JetBrains Mono', monospace" }}>
                  {r.target} coins
                </span>
              </div>
              <button onClick={() => deleteReward(r.id)} style={{ color: '#5B6373', flexShrink: 0 }}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>

        {addingReward ? (
          <div className="rounded-lg p-3" style={{ background: '#1F2836', border: '1px solid #2A3444' }}>
            <input
              type="text"
              value={newRewardName}
              onChange={(e) => setNewRewardName(e.target.value)}
              placeholder="Reward name (e.g. Nerf gun)"
              className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
              style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}
            />
            <input
              type="number"
              min="1"
              value={newRewardTarget}
              onChange={(e) => setNewRewardTarget(e.target.value)}
              placeholder="Coins needed"
              className="w-full mb-2 rounded-md px-2 py-1.5 text-base outline-none"
              style={{ background: '#151C27', border: '1px solid #2A3444', color: '#D8DCE3', fontFamily: "'JetBrains Mono', monospace" }}
            />
            <div className="flex gap-2">
              <button onClick={addReward} className="flex-1 py-1.5 rounded-md text-sm font-semibold" style={{ background: GOLD, color: '#1B2430', fontFamily: 'Inter, sans-serif' }}>
                Add reward
              </button>
              <button onClick={() => setAddingReward(false)} className="px-3 py-1.5 rounded-md text-sm" style={{ color: '#8B94A3', border: '1px solid #2A3444' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingReward(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-base"
            style={{ color: '#8B94A3', border: '1px dashed #2A3444', fontFamily: 'Inter, sans-serif' }}
          >
            <Plus size={16} /> New reward
          </button>
        )}
      </div>

      <h3 className="text-sm uppercase tracking-[0.2em] mb-3 px-1" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
        Full ledger
      </h3>
      {data.transactions.length === 0 ? (
        <div className="text-base px-1" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
          No transactions yet.
        </div>
      ) : (
        <ul className="space-y-2 pb-4">
          {data.transactions.map((t) => {
            const { label, amountLabel, color, Icon } = describeTx(t);
            return (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: '#1F2836', border: '1px solid #2A3444' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-xs uppercase font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: ACCENTS[t.kid].bg, color: ACCENTS[t.kid].c }}
                  >
                    {t.kid}
                  </span>
                  <Icon size={16} style={{ color, flexShrink: 0 }} />
                  <span className="text-base truncate" style={{ color: '#D8DCE3', fontFamily: 'Inter, sans-serif' }}>
                    {label}
                  </span>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 pl-2">
                  {amountLabel && (
                    <span
                      className="text-base font-semibold tabular-nums"
                      style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {amountLabel}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
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

function CoinBank() {
  const [data, setDataRaw] = useState(defaultData);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('Ryan');
  // Tracks in-flight local writes so background refresh doesn't clobber them
  const pendingWrites = React.useRef(0);

  const refresh = useCallback(async () => {
    if (pendingWrites.current > 0) return; // don't overwrite unsaved local changes
    try {
      const parsed = await storageAdapter.load();
      if (parsed) setDataRaw(withDefaults(parsed));
    } catch (e) {
      // network/storage hiccup — keep current state, try again next cycle
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
      const next = typeof updater === 'function' ? updater(prev) : updater;
      storageAdapter
        .save(next)
        .catch(() => {})
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

  const tabs = [...KIDS, 'Parent'];

  return (
    <div
      className="min-h-screen w-full py-8 px-4"
      style={{ background: '#151C27' }}
    >
      <div className="max-w-lg mx-auto mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Coins size={24} style={{ color: GOLD }} />
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Fredoka', sans-serif", color: '#F1EFEA' }}>
            The Coin Bank
          </h1>
        </div>
        <p className="text-sm" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
          A little passbook for big savers
        </p>
      </div>

      <div className="max-w-lg mx-auto flex gap-2 mb-8">
        {tabs.map((t) => {
          const pendingCount =
            data.taskRequests.filter((r) => r.status === 'pending').length +
            KIDS.reduce((sum, k) => sum + (data.buckets[k] || []).filter((b) => b.claimPending).length, 0);
          return (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-base font-medium transition-colors flex items-center justify-center gap-1.5 relative"
            style={{
              background: tab === t ? (t === 'Parent' ? 'rgba(232,185,74,0.14)' : ACCENTS[t]?.bg) : '#1F2836',
              border: `1px solid ${tab === t ? (t === 'Parent' ? GOLD : ACCENTS[t]?.ring) : '#2A3444'}`,
              color: tab === t ? (t === 'Parent' ? GOLD : ACCENTS[t]?.c) : '#8B94A3',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {t === 'Parent' && <Lock size={14} />}
            {t}
            {t === 'Parent' && pendingCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                style={{ background: '#E85D75', color: '#fff' }}
              >
                {pendingCount}
              </span>
            )}
          </button>
          );
        })}
      </div>

      {!loaded ? (
        <div className="text-center text-base" style={{ color: '#5B6373', fontFamily: 'Inter, sans-serif' }}>
          Loading passbook…
        </div>
      ) : tab === 'Parent' ? (
        <ParentPanel data={data} setData={setData} />
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
const SITE_PASSWORD = 'YenFamily2026';
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
      style={{ background: '#151C27' }}
    >
      <form onSubmit={submit} className="max-w-xs w-full text-center">
        <Coins size={32} style={{ color: GOLD }} className="mx-auto mb-3" />
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Fredoka', sans-serif", color: '#F1EFEA' }}>
          The Coin Bank
        </h1>
        <p className="text-base mb-6" style={{ color: '#8B94A3', fontFamily: 'Inter, sans-serif' }}>
          Enter the family password to continue
        </p>
        <input
          type="password"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          autoFocus
          className="w-full mb-3 rounded-lg px-3 py-2.5 text-base outline-none text-center"
          style={{
            background: '#1F2836',
            border: `1px solid ${error ? '#E85D75' : '#2A3444'}`,
            color: '#D8DCE3',
            fontFamily: 'Inter, sans-serif',
          }}
        />
        {error && (
          <p className="text-sm mb-3" style={{ color: '#E85D75', fontFamily: 'Inter, sans-serif' }}>
            That's not it — try again.
          </p>
        )}
        <button
          type="submit"
          className="w-full py-2.5 rounded-lg text-base font-semibold"
          style={{ background: GOLD, color: '#1B2430', fontFamily: 'Inter, sans-serif' }}
        >
          Enter
        </button>
      </form>
    </div>
  );
}

export default SiteGate;
