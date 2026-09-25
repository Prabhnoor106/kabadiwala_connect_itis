/**
 * Data-fetching and utility hooks.
 *
 * useQuery is a small purpose-built fetch hook rather than a query library —
 * the app has a handful of endpoints and shipping React Query would roughly
 * double the JS the target handsets have to download.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Fetch on mount and whenever `deps` change.
 *
 * @param {Function} fn - async () => data
 * @param {Array} deps
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] - Skip the fetch while false
 * @returns {{ data, loading, error, refetch, setData }}
 */
export function useQuery(fn, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  // Keeps the latest fn without making it a dependency, so callers can pass an
  // inline arrow without triggering a refetch every render.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fnRef
      .current()
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (active && err.name !== 'AbortError') setError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, refetch, setData };
}

/**
 * Wrap a mutation with pending/error state.
 *
 * @returns {{ run, pending, error, success, reset }}
 */
export function useMutation(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const run = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      setSuccess(false);
      try {
        const result = await fn(...args);
        setSuccess(true);
        return result;
      } catch (err) {
        setError(err);
        // Rethrow so callers can branch, while state is already updated.
        throw err;
      } finally {
        setPending(false);
      }
    },
    [fn]
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return { run, pending, error, success, reset };
}

/** Debounce a value — used for search inputs. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Track connectivity.
 *
 * navigator.onLine is optimistic — it reports true on a connected-but-dead
 * network — so this is a hint for the offline banner, not a guarantee. Real
 * failures still surface as ApiError with status 0.
 */
export function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}

/**
 * Read the device's GPS position on demand.
 *
 * Never requested automatically: a permission prompt on page load is confusing,
 * and the collector should tap "use my location" deliberately.
 */
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setError('This device cannot share its location.');
      return Promise.resolve(null);
    }

    setLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy_m: Math.round(pos.coords.accuracy),
          };
          setPosition(coords);
          setLoading(false);
          resolve(coords);
        },
        (err) => {
          const messages = {
            1: 'Location permission was denied. Enter the address instead.',
            2: 'Location is unavailable right now.',
            3: 'Getting location took too long.',
          };
          setError(messages[err.code] || 'Could not get your location.');
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }, []);

  return { position, error, loading, request };
}

/**
 * Speak text with the device's built-in TTS.
 *
 * Uses the platform voice rather than shipping audio files — that keeps the
 * bundle small and works offline once the OS voice is installed. Absence of a
 * matching voice is reported so the UI can hide the button instead of
 * pretending it worked.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback(
    (text, locale = 'hi-IN') => {
      if (!supported || !text) return false;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      utterance.rate = 0.9; // slightly slow — clearer for numbers
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(utterance);
      return true;
    },
    [supported]
  );

  const stop = useCallback(() => {
    if (supported) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [supported]);

  return { speak, stop, speaking, supported };
}

/** localStorage-backed state that survives reloads. */
export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : JSON.parse(stored);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota — in-memory only */
    }
  }, [key, value]);

  return [value, setValue];
}

/** Set the document title. */
export function useTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · Kabadiwala Connect` : 'Kabadiwala Connect';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
