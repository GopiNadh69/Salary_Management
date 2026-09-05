/**
 * ExpenseEase - Data layer
 * Persists transactions and budgets. Uses Firebase Realtime Database when
 * configured (app writes only live if keys are present in config), otherwise
 * falls back to localStorage so the app always works.
 */
const Storage = (() => {
  const LS_KEY = 'expenseease_data_v1';
  const defaultFirebaseConfig = {
    apiKey: '',
    projectId: '',
    databaseURL: '',
    authDomain: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  };

  let db = null; // initialized Firebase database ref
  let firebaseReady = false;
  let pendingPeer = null; // data loaded from Firebase awaiting merge

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : { transactions: [], budgets: {} };
    } catch (e) {
      return { transactions: [], budgets: {} };
    }
  }

  function saveLocal(data) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }
  }

  function init(config) {
    const cfg = Object.assign({}, defaultFirebaseConfig, config || {});

    // Only bootstrap Firebase when a full config is provided.
    if (cfg.apiKey && cfg.projectId && cfg.databaseURL && typeof window.firebase !== 'undefined') {
      try {
        window.firebase.initializeApp(cfg);
        db = window.firebase.database().ref('expenseease');
        firebaseReady = true;

        db.on('value', (snap) => {
          const remote = snap.val() || { transactions: [], budgets: {} };
          const local = loadLocal();
          // Pick the bigger dataset between remote and local, then reconcile.
          const merged = { transactions: [], budgets: {} };

          const buckets = {};
          for (const t of [...(remote.transactions || []), ...(local.transactions || [])]) {
            buckets[t.id] = t;
          }
          merged.transactions = Object.values(buckets);

          merged.budgets = Object.assign({}, local.budgets, remote.budgets || {});

          saveLocal(merged);
          if (typeof window.__onDataReady === 'function') {
            window.__onDataReady(merged);
          }
        });

        // Keep Firebase in sync when the local cache is updated.
        window.addEventListener('app:datachanged', () => {
          const data = loadLocal();
          db.set(data).catch((e) => console.warn('Firebase write failed:', e));
        });
      } catch (e) {
        console.warn('Firebase init failed, using local storage only:', e);
        firebaseReady = false;
        db = null;
      }
    }
    return { firebaseEnabled: firebaseReady };
  }

  function getState() {
    return loadLocal();
  }

  function setState(data) {
    saveLocal(data);
    window.dispatchEvent(new CustomEvent('app:datachanged', { detail: data }));
    return data;
  }

  return { init, getState, setState, isFirebaseEnabled: () => firebaseReady, LS_KEY };
})();

export default Storage;