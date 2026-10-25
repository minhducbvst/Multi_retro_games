/**
 * Bulletproof Safe WakeLock Polyfill for Emscripten, RetroArch & Nostalgist WebAssembly
 * Prevents:
 * NotAllowedError: Failed to execute 'request' on 'WakeLock': Access to Screen Wake Lock features is disallowed by permissions policy
 */

function createDummySentinel(type: 'screen' = 'screen'): WakeLockSentinel {
  const target = new EventTarget();
  const sentinel: Record<string, any> = {
    released: false,
    type,
    release: async () => {
      sentinel.released = true;
      if (typeof sentinel.onrelease === 'function') {
        try {
          sentinel.onrelease(new Event('release'));
        } catch {}
      }
      return Promise.resolve();
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    onrelease: null,
  };
  return sentinel as unknown as WakeLockSentinel;
}

export function initWakeLockPolyfill(): void {
  if (typeof window === 'undefined') return;

  const dummyWakeLock = {
    request: async (type: 'screen' = 'screen') => {
      return createDummySentinel(type);
    },
  };

  // 1. Override Navigator.prototype.wakeLock directly
  try {
    if (typeof Navigator !== 'undefined' && Navigator.prototype) {
      Object.defineProperty(Navigator.prototype, 'wakeLock', {
        configurable: true,
        enumerable: true,
        get: () => dummyWakeLock,
      });
    }
  } catch (e) {
    console.warn('Could not override Navigator.prototype.wakeLock', e);
  }

  // 2. Override window.navigator.wakeLock directly
  try {
    if (typeof window.navigator !== 'undefined') {
      Object.defineProperty(window.navigator, 'wakeLock', {
        configurable: true,
        enumerable: true,
        get: () => dummyWakeLock,
      });
    }
  } catch (e) {
    console.warn('Could not override window.navigator.wakeLock', e);
  }

  // 3. Override WakeLock.prototype.request if class exists
  try {
    const win = window as any;
    if (typeof win.WakeLock !== 'undefined' && win.WakeLock.prototype) {
      Object.defineProperty(win.WakeLock.prototype, 'request', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: async function (type: 'screen' = 'screen') {
          return createDummySentinel(type);
        },
      });
    }
  } catch (e) {
    console.warn('Could not override WakeLock.prototype.request', e);
  }

  // 4. Capture any unhandled rejection from Emscripten blob workers or async tasks
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      try {
        const reason = event.reason;
        const name = String(reason?.name || '');
        const msg = String(reason?.message || reason || '').toLowerCase();
        const isWakeLockError =
          name === 'NotAllowedError' ||
          name === 'SecurityError' ||
          msg.includes('wakelock') ||
          msg.includes('wake lock') ||
          msg.includes('permissions policy');

        if (isWakeLockError) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      } catch {}
    },
    true
  );

  // 5. Capture any unhandled error event
  window.addEventListener(
    'error',
    (event) => {
      try {
        const msg = String(event?.message || '').toLowerCase();
        if (msg.includes('wakelock') || msg.includes('wake lock') || msg.includes('permissions policy')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      } catch {}
    },
    true
  );
}

initWakeLockPolyfill();
