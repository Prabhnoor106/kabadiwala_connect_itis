/**
 * Login for all three roles.
 *
 * Collector is the default tab and the simplest path: type a phone number, get
 * an OTP, continue. No password, no email, no name — that matches the schema's
 * deliberately minimal collector profile and the reality that many users have
 * no email address.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useApp } from '../context/AppContext';
import { useMutation, useTitle } from '../lib/hooks';
import { InlineError, SuccessNote, Spinner } from '../components/ui';
import { LanguagePicker } from '../components/Layout';
import Icon from '../components/Icon';

const ROLES = [
  { key: 'collector', icon: 'users', labelKey: 'auth.collector' },
  { key: 'recycler', icon: 'factory', labelKey: 'auth.recycler' },
  { key: 'admin', icon: 'settings', labelKey: 'auth.admin' },
];

export default function Login() {
  const { t, login } = useApp();
  const [role, setRole] = useState('collector');
  useTitle('Sign in');

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-ink-50 to-ink-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
        {/* Brand */}
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
            <Icon name="refresh" size={28} />
          </span>

          <h1 className="text-2xl font-bold text-ink-900">
            {t('auth.title')}
          </h1>

          <p className="mt-1.5 text-sm text-ink-600">
            {t('auth.tagline')}
          </p>
        </div>

        <div className="mb-4 flex justify-center">
          <LanguagePicker />
        </div>

        {/* Role selector */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              aria-pressed={role === r.key}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-sm font-semibold transition-colors ${
                role === r.key
                  ? 'border-brand-600 bg-white text-brand-700'
                  : 'border-transparent bg-white/70 text-ink-500 hover:bg-white'
              }`}
            >
              <Icon name={r.icon} size={20} />
              {t(r.labelKey)}
            </button>
          ))}
        </div>

        <div className="card card-pad">
          {role === 'collector' && <CollectorLogin onSuccess={login} />}
          {role === 'recycler' && <RecyclerAuth onSuccess={login} />}
          {role === 'admin' && <AdminLogin onSuccess={login} />}
        </div>

        <p className="mt-5 text-center text-xs text-ink-500">
          Have a handover slip?{' '}
          <Link
            to="/verify"
            className="font-semibold text-brand-700 underline"
          >
            Verify a reference number
          </Link>
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Collector — phone + OTP, with an optional PIN path
// ============================================================

function CollectorLogin({ onSuccess }) {
  const { t } = useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState('phone'); // phone → otp
  const [mode, setMode] = useState('otp'); // otp | pin
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [devOtp, setDevOtp] = useState(null);

  // NEW:
  // Tracks whether the backend created a brand-new collector.
  const [isNewCollector, setIsNewCollector] = useState(false);

  const send = useMutation((p) => api.auth.sendOtp(p));
  const verify = useMutation((p, code) => api.auth.verifyOtp(p, code));
  const pinLogin = useMutation((p, code) => api.auth.loginPin(p, code));

  const phoneValid = /^[6-9]\d{9}$/.test(
    phone.replace(/\D/g, '').slice(-10)
  );

  async function handleSend(e) {
    e.preventDefault();

    try {
      const result = await send.run(phone);

      // NEW:
      // Backend already returns is_new_collector.
      setIsNewCollector(Boolean(result?.is_new_collector));

      // Demo mode: show OTP on screen when backend returns it.
      if (result?.otp) {
        setDevOtp(result.otp);
      }

      setStep('otp');
    } catch {
      /* error surfaces via send.error */
    }
  }

  async function handleVerify(e) {
    e.preventDefault();

    try {
      const result = await verify.run(phone, otp);

      onSuccess(result);

      // NEW:
      // Give a different success message depending on the flow.
      // This is handled with a browser alert so we don't need to
      // modify your existing UI components or translation files.
      if (isNewCollector) {
        window.alert('Collector registration successful!');
      }

      navigate('/app', { replace: true });
    } catch {
      /* handled below */
    }
  }

  async function handlePinLogin(e) {
    e.preventDefault();

    try {
      const result = await pinLogin.run(phone, pin);
      onSuccess(result);
      navigate('/app', { replace: true });
    } catch {
      /* handled below */
    }
  }

  // ---------- PIN mode ----------
  if (mode === 'pin') {
    return (
      <form onSubmit={handlePinLogin} className="space-y-4">
        <div>
          <label className="label" htmlFor="pin-phone">
            {t('auth.phone')}
          </label>

          <input
            id="pin-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 43210"
            className="input tabular text-lg"
            maxLength={13}
          />
        </div>

        <div>
          <label className="label" htmlFor="pin-code">
            {t('auth.pin')}
          </label>

          <input
            id="pin-code"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) =>
              setPin(
                e.target.value
                  .replace(/\D/g, '')
                  .slice(0, 6)
              )
            }
            placeholder="••••"
            className="input tabular text-center text-2xl tracking-[0.4em]"
          />
        </div>

        {pinLogin.error && (
          <InlineError message={pinLogin.error.message} />
        )}

        <button
          type="submit"
          disabled={
            !phoneValid ||
            pin.length < 4 ||
            pinLogin.pending
          }
          className="btn-primary w-full"
        >
          {pinLogin.pending ? (
            <Spinner size={18} />
          ) : (
            <Icon name="check" size={18} />
          )}

          {t('auth.login')}
        </button>

        <button
          type="button"
          onClick={() => setMode('otp')}
          className="w-full text-sm font-semibold text-brand-700 underline"
        >
          {t('auth.useOtp')}
        </button>
      </form>
    );
  }

  // ---------- OTP entry ----------
  if (step === 'otp') {
    return (
      <form onSubmit={handleVerify} className="space-y-4">

        {/* NEW COLLECTOR MESSAGE */}
        {isNewCollector ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                <Icon name="users" size={18} />
              </div>

              <div>
                <p className="font-semibold text-brand-900">
                  New Collector Registration
                </p>

                <p className="mt-1 text-sm text-brand-700">
                  This phone number is not registered yet.
                  Verify the OTP below to create your collector
                  account.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-ink-600">
              OTP sent to{' '}
              <span className="font-semibold text-ink-900 tabular">
                {phone}
              </span>
            </p>
          </div>
        )}

        {/* Phone number / change number */}
        <div>
          <p className="text-sm text-ink-600">
            {isNewCollector ? (
              <>
                Registering{' '}
                <span className="font-semibold text-ink-900 tabular">
                  {phone}
                </span>
              </>
            ) : (
              <>
                OTP sent to{' '}
                <span className="font-semibold text-ink-900 tabular">
                  {phone}
                </span>
              </>
            )}
          </p>

          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setOtp('');
              setDevOtp(null);
              setIsNewCollector(false);
            }}
            className="mt-1 text-sm font-semibold text-brand-700 underline"
          >
            {t('auth.changeNumber')}
          </button>
        </div>

        {/* DEMO OTP */}
        {devOtp && (
          <SuccessNote
            message={`Development mode — your OTP is ${devOtp}. In production this arrives by SMS.`}
          />
        )}

        {/* OTP INPUT */}
        <div>
          <label className="label" htmlFor="otp">
            {t('auth.otp')}
          </label>

          <input
            id="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={otp}
            onChange={(e) =>
              setOtp(
                e.target.value
                  .replace(/\D/g, '')
                  .slice(0, 6)
              )
            }
            placeholder="000000"
            className="input tabular text-center text-2xl tracking-[0.35em]"
          />
        </div>

        {verify.error && (
          <InlineError message={verify.error.message} />
        )}

        {/* VERIFY / REGISTER BUTTON */}
        <button
          type="submit"
          disabled={
            otp.length !== 6 ||
            verify.pending
          }
          className="btn-primary w-full"
        >
          {verify.pending ? (
            <Spinner size={18} />
          ) : (
            <Icon name="check" size={18} />
          )}

          {isNewCollector
            ? 'Verify & Register'
            : t('auth.verify')}
        </button>

        {/* RESEND OTP */}
        <button
          type="button"
          onClick={() =>
            handleSend({
              preventDefault() {},
            })
          }
          disabled={send.pending}
          className="w-full text-sm font-semibold text-brand-700 underline disabled:opacity-50"
        >
          {t('auth.resend')}
        </button>
      </form>
    );
  }

  // ---------- Phone entry ----------
  return (
    <form onSubmit={handleSend} className="space-y-4">
      <div>
        <label className="label" htmlFor="phone">
          {t('auth.phone')}
        </label>

        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
          className="input tabular text-lg"
          maxLength={13}
        />

        <p className="field-hint">
          No password needed. We send a code by SMS.
        </p>
      </div>

      {send.error && (
        <InlineError message={send.error.message} />
      )}

      <button
        type="submit"
        disabled={!phoneValid || send.pending}
        className="btn-primary w-full"
      >
        {send.pending ? (
          <Spinner size={18} />
        ) : (
          <Icon name="phone" size={18} />
        )}

        {t('auth.sendOtp')}
      </button>

      <button
        type="button"
        onClick={() => setMode('pin')}
        className="w-full text-sm font-semibold text-brand-700 underline"
      >
        {t('auth.usePin')}
      </button>
    </form>
  );
}

// ============================================================
// Recycler — email + password, with registration
// ============================================================

function RecyclerAuth({ onSuccess }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');

  const [form, setForm] = useState({
    contact_email: '',
    password: '',
    business_name: '',
    registration_number: '',
    contact_phone: '',
    address: '',
  });

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.value,
    }));

  const loginMut = useMutation(() =>
    api.auth.recyclerLogin(
      form.contact_email,
      form.password
    )
  );

  const registerMut = useMutation(() => {
    // Send only the fields the user filled in.
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, v]) => v !== '')
    );

    return api.auth.recyclerRegister(payload);
  });

  const active =
    mode === 'login'
      ? loginMut
      : registerMut;

  async function submit(e) {
    e.preventDefault();

    try {
      const result = await active.run();
      onSuccess(result);
      navigate('/recycler', { replace: true });
    } catch {
      /* surfaced below */
    }
  }

  const fieldErrors =
    active.error?.fieldErrors || {};

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-2">
        {['login', 'register'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              mode === m
                ? 'bg-brand-600 text-white'
                : 'bg-ink-100 text-ink-600'
            }`}
          >
            {m === 'login'
              ? t('auth.login')
              : t('auth.register')}
          </button>
        ))}
      </div>

      {mode === 'register' && (
        <>
          <div>
            <label
              className="label"
              htmlFor="biz"
            >
              Business name
            </label>

            <input
              id="biz"
              value={form.business_name}
              onChange={set('business_name')}
              className={`input ${
                fieldErrors.business_name
                  ? 'input-error'
                  : ''
              }`}
              placeholder="GreenTech E-Waste Solutions Pvt. Ltd."
            />

            {fieldErrors.business_name && (
              <p className="field-error">
                {fieldErrors.business_name}
              </p>
            )}
          </div>

          <div>
            <label
              className="label"
              htmlFor="reg"
            >
              CPCB registration number{' '}
              <span className="font-normal text-ink-400">
                ({t('common.optional')})
              </span>
            </label>

            <input
              id="reg"
              value={form.registration_number}
              onChange={set('registration_number')}
              className="input"
              placeholder="CPCB/REC/2025/001"
            />

            <p className="field-hint">
              An admin verifies this before you can accept lots.
            </p>
          </div>
        </>
      )}

      <div>
        <label
          className="label"
          htmlFor="email"
        >
          {t('auth.email')}
        </label>

        <input
          id="email"
          type="email"
          autoComplete="email"
          value={form.contact_email}
          onChange={set('contact_email')}
          className={`input ${
            fieldErrors.contact_email
              ? 'input-error'
              : ''
          }`}
          placeholder="ops@example.in"
        />

        {fieldErrors.contact_email && (
          <p className="field-error">
            {fieldErrors.contact_email}
          </p>
        )}
      </div>

      <div>
        <label
          className="label"
          htmlFor="pw"
        >
          {t('auth.password')}
        </label>

        <input
          id="pw"
          type="password"
          autoComplete={
            mode === 'login'
              ? 'current-password'
              : 'new-password'
          }
          value={form.password}
          onChange={set('password')}
          className={`input ${
            fieldErrors.password
              ? 'input-error'
              : ''
          }`}
          placeholder="••••••••"
        />

        {mode === 'register' && (
          <p className="field-hint">
            At least 8 characters, with a letter and a number.
          </p>
        )}

        {fieldErrors.password && (
          <p className="field-error">
            {fieldErrors.password}
          </p>
        )}
      </div>

      {mode === 'register' && (
        <div>
          <label
            className="label"
            htmlFor="addr"
          >
            Facility address{' '}
            <span className="font-normal text-ink-400">
              ({t('common.optional')})
            </span>
          </label>

          <textarea
            id="addr"
            rows={2}
            value={form.address}
            onChange={set('address')}
            className="input"
            placeholder="Plot 45, MIDC Industrial Area, Navi Mumbai"
          />
        </div>
      )}

      {active.error && (
        <InlineError message={active.error.message} />
      )}

      <button
        type="submit"
        disabled={active.pending}
        className="btn-primary w-full"
      >
        {active.pending ? (
          <Spinner size={18} />
        ) : (
          <Icon name="check" size={18} />
        )}

        {mode === 'login'
          ? t('auth.login')
          : t('auth.register')}
      </button>
    </form>
  );
}

// ============================================================
// Admin — email + password
// ============================================================

function AdminLogin({ onSuccess }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMut = useMutation(() =>
    api.auth.adminLogin(email, password)
  );

  async function submit(e) {
    e.preventDefault();

    try {
      const result = await loginMut.run();
      onSuccess(result);
      navigate('/admin', { replace: true });
    } catch {
      /* surfaced below */
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label
          className="label"
          htmlFor="admin-email"
        >
          {t('auth.email')}
        </label>

        <input
          id="admin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          placeholder="admin@kabadiwala.local"
        />
      </div>

      <div>
        <label
          className="label"
          htmlFor="admin-pw"
        >
          {t('auth.password')}
        </label>

        <input
          id="admin-pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="••••••••"
        />
      </div>

      {loginMut.error && (
        <InlineError message={loginMut.error.message} />
      )}

      <button
        type="submit"
        disabled={loginMut.pending}
        className="btn-primary w-full"
      >
        {loginMut.pending ? (
          <Spinner size={18} />
        ) : (
          <Icon name="shield" size={18} />
        )}

        {t('auth.login')}
      </button>
    </form>
  );
}
