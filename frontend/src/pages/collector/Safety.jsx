/**
 * Safety guidance.
 *
 * Some of this material can hurt the person handling it — batteries, CRTs,
 * circuit boards, cables. This screen is built for someone who may read slowly:
 * a big material picker, a clear hazard badge, a short red "do not" list, a
 * short green "safe handling" list, and a button that reads it all aloud.
 */
import { useState } from 'react';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useTitle, useSpeech } from '../../lib/hooks';
import {
  HazardBadge,
  SectionHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Spinner,
} from '../../components/ui';
import Icon from '../../components/Icon';

/** Map the app language to a TTS locale. */
const SPEECH_LOCALE = { hi: 'hi-IN', mr: 'mr-IN', en: 'en-IN' };

export default function Safety() {
  const { t, lang } = useApp();
  useTitle(t('nav.safety'));
  const speech = useSpeech();

  // Which categories have guidance (also carries the emoji icon).
  const avail = useQuery(() => api.safety.guidance(null, lang), [lang]);
  // Full catalogue, for localized names and hazard levels.
  const cats = useQuery(() => api.categories.list(), []);

  // Selection is derived: the user's choice, else the first available material.
  const list = avail.data ?? [];
  const [code, setCode] = useState(null);
  const activeCode = code ?? list[0]?.code ?? null;

  const guidance = useQuery(() => api.safety.guidance(activeCode, lang), [activeCode, lang], {
    enabled: !!activeCode,
  });

  const catFor = (c) => (cats.data ?? []).find((x) => x.code === c);
  const hazardLevel = catFor(activeCode)?.hazard_level;

  function handleListen() {
    const g = guidance.data;
    if (!g) return;
    const parts = [
      g.title,
      `${t('safety.warnings')}: ${(g.warnings || []).join('. ')}`,
      `${t('safety.steps')}: ${(g.handling_steps || []).join('. ')}`,
    ];
    speech.speak(parts.join('. '), SPEECH_LOCALE[lang] || 'hi-IN');
  }

  return (
    <div className="page space-y-6">
      {/* ---------- Hero ---------- */}
      <section className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-4 ring-1 ring-amber-200">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Icon name="shield" size={22} />
        </span>
        <div>
          <h1 className="font-bold text-amber-900">{t('safety.title')}</h1>
          <p className="text-sm text-amber-800">
            Batteries, CRTs, circuit boards and cables need careful handling.
          </p>
        </div>
      </section>

      {/* ---------- Material picker ---------- */}
      {avail.loading ? (
        <LoadingBlock label={t('common.loading')} />
      ) : avail.error ? (
        <ErrorState error={avail.error} onRetry={avail.refetch} />
      ) : list.length === 0 ? (
        <EmptyState icon="shield" title={t('common.empty')} />
      ) : (
        <>
          <section>
            <SectionHeader title={t('lot.material')} />
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
              {list.map((item) => {
                const active = item.code === activeCode;
                const cat = catFor(item.code);
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setCode(item.code)}
                    aria-pressed={active}
                    className={`flex min-w-[5.5rem] flex-col items-center gap-1 rounded-2xl border-2 px-3 py-3 transition-colors ${
                      active
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-transparent bg-white ring-1 ring-ink-200 hover:bg-ink-50'
                    }`}
                  >
                    <span className="text-3xl leading-none" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span
                      className={`text-center text-xs font-semibold ${
                        active ? 'text-brand-700' : 'text-ink-700'
                      }`}
                    >
                      {cat?.name || item.title_en}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---------- Guidance ---------- */}
          {guidance.loading ? (
            <LoadingBlock label={t('common.loading')} />
          ) : guidance.error ? (
            <ErrorState error={guidance.error} onRetry={guidance.refetch} />
          ) : guidance.data ? (
            <section className="space-y-4">
              {/* Title + hazard + listen */}
              <div className="card card-pad">
                <div className="flex items-start gap-3">
                  <span className="text-4xl leading-none" aria-hidden="true">
                    {guidance.data.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-ink-900">{guidance.data.title}</h2>
                    <div className="mt-1.5">
                      <HazardBadge level={hazardLevel} />
                    </div>
                  </div>
                </div>

                {speech.supported && (
                  <button
                    type="button"
                    onClick={speech.speaking ? speech.stop : handleListen}
                    className="btn-secondary mt-4 w-full"
                  >
                    {speech.speaking ? <Spinner size={18} /> : <Icon name="speaker" size={18} />}
                    {t('safety.listen')}
                  </button>
                )}
              </div>

              {/* Do not */}
              {guidance.data.warnings?.length > 0 && (
                <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                  <h3 className="flex items-center gap-2 font-bold text-red-800">
                    <Icon name="xCircle" size={20} />
                    {t('safety.warnings')}
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {guidance.data.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm font-medium text-red-900">
                        <Icon name="xCircle" size={18} className="mt-0.5 shrink-0 text-red-500" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Safe handling */}
              {guidance.data.handling_steps?.length > 0 && (
                <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
                  <h3 className="flex items-center gap-2 font-bold text-brand-800">
                    <Icon name="checkCircle" size={20} />
                    {t('safety.steps')}
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {guidance.data.handling_steps.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-sm font-medium text-brand-900"
                      >
                        <Icon name="checkCircle" size={18} className="mt-0.5 shrink-0 text-brand-600" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
