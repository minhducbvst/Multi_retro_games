/**
 * Safe WakeLock Polyfill for Emscripten & Nostalgist WebAssembly cores running inside iframes
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

  // 1. Monkey-patch WakeLock prototype if available
  try {
    const nav = window.navigator as any;
    const win = window as any;
    if (typeof win.WakeLock !== 'undefined' && win.WakeLock.prototype) {
      const proto = win.WakeLock.prototype;
      const origProtoReq = proto.request;
      proto.request = async function (type: 'screen' = 'screen') {
        try {
          if (origProtoReq) {
            return await origProtoReq.call(this, type);
          }
        } catch {
          // Fall through to dummy sentinel
        }
        return createDummySentinel(type);
      };
    }

    // 2. Wrap navigator.wakeLock directly
    if (nav && 'wakeLock' in nav && nav.wakeLock) {
      const origRequest = nav.wakeLock.request;
      nav.wakeLock.request = async function (type: 'screen' = 'screen') {
        try {
          if (typeof origRequest === 'function') {
            return await origRequest.call(nav.wakeLock, type);
          }
        } catch {
          // Silently suppress permissions policy denial and return safe dummy sentinel
        }
        return createDummySentinel(type);
      };
    } else if (nav) {
      // Define a dummy wakeLock if missing or blocked
      try {
        Object.defineProperty(nav, 'wakeLock', {
          configurable: true,
          enumerable: true,
          get: () => ({
            request: async (type: 'screen' = 'screen') => createDummySentinel(type),
          }),
        });
      } catch {}
    }
  } catch (e) {
    console.warn('Could not wrap navigator.wakeLock', e);
  }

  // 3. Capture any unhandled rejection or error from workers, blob scripts, or Emscripten
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
