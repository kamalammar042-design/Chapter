import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, GraduationCap, AlertCircle } from 'lucide-react';
import { PROGRAMS, subjectsFor, type IgcseTier, type ProgramKey } from '@/content/catalog';
import { useProfile, useSaveSubjects, useStudentSubjects, useUpdateProfile } from '@/data/profile';
import { Button } from '@/components/ui/Button';
import { Alert, PageLoader } from '@/components/ui/States';
import { Logo } from '@/components/Logo';
import { SubjectIcon } from '@/components/SubjectIcon';
import { useTitle } from '@/components/layout/Page';
import { browserTimeZone, todayIn } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import type { StudentSubject } from '@/lib/types';
import { firstName } from '@/lib/format';

type Programs = ProgramKey[];

export default function Onboarding() {
  useTitle('Set up Chapter');
  const navigate = useNavigate();
  const { data: profile, isLoading } = useProfile();
  const { data: existing } = useStudentSubjects();
  const updateProfile = useUpdateProfile();
  const saveSubjects = useSaveSubjects();

  const [step, setStep] = useState(0);
  const [programs, setPrograms] = useState<Programs>([]);
  const [tier, setTier] = useState<IgcseTier>('extended');
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, { exam_date: string; target_grade: string }>>({});
  const [error, setError] = useState<string | null>(null);

  // resume with anything already saved
  useEffect(() => {
    if (profile?.program && !programs.length) setPrograms([profile.program]);
    if (profile?.igcse_tier) setTier(profile.igcse_tier);
    if (existing?.length && !selected.length) setSelected(existing.map((s) => s.subject_key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, existing]);

  const available = useMemo(() => programs.flatMap((p) => subjectsFor(p)), [programs]);
  const today = todayIn(browserTimeZone());

  if (isLoading || !profile) return <PageLoader />;
  if (profile.role === 'parent') return <Navigate to="/parent" replace />;

  const toggleProgram = (p: ProgramKey) => {
    if (programs.includes(p)) {
      setPrograms((ps) => ps.filter((x) => x !== p));
      setSelected((sel) => sel.filter((k) => !k.startsWith(`${p}.`)));
    } else {
      setPrograms((ps) => [...ps, p]);
    }
  };
  const toggleSubject = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const finish = async () => {
    setError(null);
    const rows: StudentSubject[] = selected.map((k) => ({
      subject_key: k,
      exam_date: details[k]?.exam_date || null,
      target_grade: details[k]?.target_grade || null,
      confidence: null,
    }));
    try {
      await saveSubjects.mutateAsync(rows);
      await updateProfile.mutateAsync({
        program: programs[0],
        igcse_tier: programs.includes('igcse') ? tier : null,
        timezone: browserTimeZone(),
        onboarded_at: new Date().toISOString(),
      });
      navigate('/home', { replace: true, state: { welcome: true } });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const steps = ['Your exams', 'Your subjects', 'Dates & targets'];
  const canNext = step === 0 ? programs.length > 0 : step === 1 ? selected.length > 0 : true;
  const busy = saveSubjects.isPending || updateProfile.isPending;

  return (
    <div className="onboarding">
      <header className="onboarding__head">
        <Logo size={26} />
        <ol className="onboarding__steps" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} className={i < step ? 'is-done' : i === step ? 'is-current' : ''}>
              <span className="onboarding__dot">{i < step ? <Check size={12} /> : i + 1}</span>
              <span className="hide-mobile">{s}</span>
            </li>
          ))}
        </ol>
      </header>

      <main className="onboarding__main">
        {step === 0 && (
          <section className="stack-lg fade-up" aria-labelledby="ob-0">
            <div>
              <h1 id="ob-0" className="page-header__title">Hi {firstName(profile.display_name) || 'there'}. What are you studying for?</h1>
              <p className="page-header__sub">Choose one or both. This decides your questions and who you're ranked with.</p>
            </div>
            <div className="stack-sm">
              {(Object.keys(PROGRAMS) as ProgramKey[]).map((p) => (
                <button key={p} type="button" role="checkbox" aria-checked={programs.includes(p)} className="choice" onClick={() => toggleProgram(p)}>
                  <GraduationCap size={20} aria-hidden="true" />
                  <span>
                    <span className="fw-600" style={{ display: 'block' }}>{PROGRAMS[p].name}</span>
                    <span className="text-sm text-2">{PROGRAMS[p].description}</span>
                  </span>
                  <span className="choice__check" aria-hidden="true"><Check /></span>
                </button>
              ))}
            </div>
            {programs.includes('igcse') && (
              <fieldset className="stack-sm fade-up" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field__label mb-2">Which IGCSE tier are you sitting?</legend>
                <div className="grid-2" style={{ gap: 8 }}>
                  {(['core', 'extended'] as IgcseTier[]).map((t) => (
                    <button key={t} type="button" className="choice" aria-pressed={tier === t} onClick={() => setTier(t)}>
                      <span>
                        <span className="fw-600" style={{ display: 'block' }}>{t === 'core' ? 'Core' : 'Extended'}</span>
                        <span className="text-sm text-2">{t === 'core' ? 'Grades C–G' : 'Grades A*–E'}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="field__hint">Not sure? Pick Extended. You can change it later in Settings.</p>
              </fieldset>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="stack-lg fade-up" aria-labelledby="ob-1">
            <div>
              <h1 id="ob-1" className="page-header__title">Pick your subjects</h1>
              <p className="page-header__sub">You can add or remove subjects any time.</p>
            </div>
            {programs.map((p) => (
              <div key={p} className="stack-sm">
                {programs.length > 1 && <h2 className="section__title">{PROGRAMS[p].name}</h2>}
                <div className="grid-2" style={{ gap: 8 }}>
                  {subjectsFor(p).map((s) => (
                    <button key={s.key} type="button" role="checkbox" aria-checked={selected.includes(s.key)} className="choice" onClick={() => toggleSubject(s.key)}>
                      <SubjectIcon subjectKey={s.key} size="sm" />
                      <span className="fw-500">{s.name}{s.code && <span className="text-3 text-xs"> · {s.code}</span>}</span>
                      <span className="choice__check" aria-hidden="true"><Check /></span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {step === 2 && (
          <section className="stack-lg fade-up" aria-labelledby="ob-2">
            <div>
              <h1 id="ob-2" className="page-header__title">When are your exams?</h1>
              <p className="page-header__sub">Optional, but it lets Chapter count down and prioritise. Skip anything you don't know yet.</p>
            </div>
            <div className="stack-sm">
              {available.filter((s) => selected.includes(s.key)).map((s) => {
                const program = PROGRAMS[s.program];
                const d = details[s.key] ?? { exam_date: '', target_grade: '' };
                const set = (patch: Partial<typeof d>) => setDetails((all) => ({ ...all, [s.key]: { ...d, ...patch } }));
                return (
                  <div key={s.key} className="card card--tight onboarding__subject">
                    <div className="row" style={{ minWidth: 0 }}>
                      <SubjectIcon subjectKey={s.key} size="sm" />
                      <span className="fw-600 truncate">{s.program === 'sat' ? `SAT ${s.name}` : s.name}</span>
                    </div>
                    <div className="onboarding__inputs">
                      <label className="stack-sm" style={{ gap: 4 }}>
                        <span className="text-xs text-3">Exam date</span>
                        <input className="input" type="date" min={today} value={d.exam_date} onChange={(e) => set({ exam_date: e.target.value })} />
                      </label>
                      <label className="stack-sm" style={{ gap: 4 }}>
                        <span className="text-xs text-3">{program.targetKind === 'grade' ? 'Target grade' : 'Target score'}</span>
                        <select className="select" value={d.target_grade} onChange={(e) => set({ target_grade: e.target.value })}>
                          <option value="">Not set</option>
                          {program.targets.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
          </section>
        )}
      </main>

      <footer className="onboarding__foot">
        <div className="onboarding__foot-inner">
          {step > 0 ? (
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setStep((s) => s - 1)} disabled={busy}>Back</Button>
          ) : <span />}
          {step < 2 ? (
            <Button size="lg" iconRight={<ArrowRight />} disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              {step === 1 ? `Continue with ${selected.length || 'no'} subject${selected.length === 1 ? '' : 's'}` : 'Continue'}
            </Button>
          ) : (
            <Button size="lg" iconRight={<ArrowRight />} loading={busy} onClick={finish}>Finish setup</Button>
          )}
        </div>
      </footer>
    </div>
  );
}
