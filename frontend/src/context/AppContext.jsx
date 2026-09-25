/**
 * App context: session, role and language.
 *
 * One provider so any screen can read who is signed in and which language to
 * render, without threading props through every route.
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { auth, setUnauthorizedHandler } from '../lib/api';
import { translator } from '../lib/i18n';

const AppContext = createContext(null);

const LANG_KEY = 'kc_lang';

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(auth.role);
  const [booting, setBooting] = useState(Boolean(auth.token));

  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) || 'hi';
    } catch {
      return 'hi';
    }
  });

  // Restore the session from a stored token on first load.
  useEffect(() => {
    if (!auth.token) {
      setBooting(false);
      return;
    }

    let active = true;
    api.auth
      .me()
      .then((result) => {
        if (!active) return;
        setUser(result.user);
        setRole(result.role);
        // A collector's saved language preference wins over the local default.
        if (result.role === 'collector' && result.user?.preferred_language) {
          setLangState(result.user.preferred_language);
        }
      })
      .catch(() => {
        // Expired or invalid token — api.js has already cleared it.
        if (active) {
          setUser(null);
          setRole(null);
        }
      })
      .finally(() => {
        if (active) setBooting(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const logout = useCallback(() => {
    auth.clear();
    setUser(null);
    setRole(null);
  }, []);

  // Any 401 anywhere in the app drops the session.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setRole(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  /** Store a token + principal after a successful login. */
  const login = useCallback(({ token, role: nextRole, user: nextUser }) => {
    auth.save(token, nextRole);
    setRole(nextRole);
    setUser(nextUser);
    if (nextRole === 'collector' && nextUser?.preferred_language) {
      setLangState(nextUser.preferred_language);
    }
  }, []);

  /** Change language, persisting to the collector's profile when signed in. */
  const setLang = useCallback(
    (next) => {
      setLangState(next);
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {
        /* ignore */
      }
      if (role === 'collector' && auth.token) {
        // Fire and forget: a failed preference save must not block the UI.
        api.auth.setLanguage(next).catch(() => {});
      }
    },
    [role]
  );

  const value = useMemo(
    () => ({
      user,
      role,
      lang,
      setLang,
      login,
      logout,
      booting,
      isAuthenticated: Boolean(user && role),
      isCollector: role === 'collector',
      isRecycler: role === 'recycler',
      isAdmin: role === 'admin',
      // Recyclers can browse before verification but cannot transact.
      isAuthorizedRecycler: role === 'recycler' && user?.authorization_status === 'authorized',
      t: translator(lang),
      refreshUser: async () => {
        try {
          const result = await api.auth.me();
          setUser(result.user);
          return result.user;
        } catch {
          return null;
        }
      },
    }),
    [user, role, lang, setLang, login, logout, booting]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export default AppContext;
