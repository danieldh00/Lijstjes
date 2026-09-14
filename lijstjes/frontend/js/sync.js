import api from './api.js';
import * as storage from './storage.js';

const listeners = new Set();
const statusListeners = new Set();

let status = { state: navigator.onLine ? 'idle' : 'offline', pending: storage.getOutboxSize(), error: null };
let flushing = false;
let pollTimer = null;

function notify() {
  for (const cb of listeners) cb(storage.getSnapshot());
}

function setStatus(patch) {
  status = { ...status, ...patch, pending: storage.getOutboxSize() };
  for (const cb of statusListeners) cb(status);
}

function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function onStatus(cb) {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

async function flush() {
  if (flushing) return;
  const pending = storage.getOutboxSize();
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  flushing = true;
  setStatus({ state: 'syncing' });
  try {
    if (pending > 0) {
      const mutations = JSON.parse(JSON.stringify(storage.getOutbox()));
      const result = await api.sync(mutations);
      storage.applySyncResult(result);
    } else {
      const snapshot = await api.content();
      storage.replaceSnapshot(snapshot);
    }
    setStatus({ state: 'synced', error: null });
    notify();
  } catch (err) {
    setStatus({ state: 'error', error: err.message });
  } finally {
    flushing = false;
  }
}

function scheduleFlush(delay = 400) {
  clearTimeout(scheduleFlush._t);
  scheduleFlush._t = setTimeout(flush, delay);
}

function init() {
  window.addEventListener('online', () => {
    setStatus({ state: 'idle' });
    flush();
  });
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));

  pollTimer = setInterval(flush, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush();
  });

  flush();
}

function mutateAndSync(mutateFn) {
  const result = mutateFn();
  notify();
  scheduleFlush();
  return result;
}

export { init, onChange, onStatus, flush, mutateAndSync };
