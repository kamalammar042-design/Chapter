import { Link } from 'react-router';
import {
  ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, Compass, FileText, Lightbulb, RotateCcw, ShieldCheck, Sparkles,
  Target, TrendingUp, Users, XCircle,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { useTitle } from '@/components/layout/Page';
import { SUBJECTS, subjectLabel } from '@/content/catalog';
import { misconceptionText } from '@/content/misconceptions';
import { SubjectIcon } from '@/components/SubjectIcon';

const LOOP = [
  { icon: Compass, title: 'Find your level', body: 'Two quick probe questions per skill show where you really are.' },
  { icon: Target, title: 'Practise at the edge', body: 'Questions sit just above what you can do, and step up as you get them right.' },
  { icon: Lightbulb, title: 'Understand the mistake', body: 'A wrong answer tells Chapter which misconception you hold, and it explains that idea.' },
  { icon: RotateCcw, title: 'Review before you forget', body: 'Skills come back after 1, 3, 7, 14, 30 and 60 days, with fresh questions each time.' },
  { icon: TrendingUp, title: 'Mastery you can trust', body: 'Harder questions count for more, and a few lucky answers can never show as mastered.' },
];

const FEATURES = [
  { icon: Target, title: 'Guided practice', body: 'One skill at a time: find your level, explain after a mistake, stretch when you are ready.' },
  { icon: Lightbulb, title: 'Knows why you got it wrong', body: 'Wrong options are linked to real misconceptions, tracked until you have avoided the trap twice.' },
  { icon: Sparkles, title: 'A tutor that teaches', body: 'Hints in three levels, never the answer. "Check my work" gives a clear verdict and the exact step that went wrong.' },
  { icon: CalendarDays, title: 'An exam plan that adapts', body: 'Built from your exam dates and weak skills, rebuilt every day, so a missed day never piles up.' },
  { icon: RotateCcw, title: 'Spaced review', body: 'The skills you are about to forget come back at the right time, as new questions.' },
  { icon: FileText, title: 'Official past papers', body: 'Linked straight to Cambridge and the College Board, and your scores tracked towards your target.' },
];

const HONEST = [
  { icon: ShieldCheck, title: 'Every question has a source', body: 'Written for Chapter, generated and independently checked by a second AI, or linked from an official publisher. Nothing unverified is published.' },
  { icon: BookOpenCheck, title: 'Numbers from your answers', body: 'Mastery, accuracy and streaks are calculated on the server from what you actually answered. No made-up progress.' },
  { icon: Users, title: 'Parents see progress, not privacy', body: 'A linked parent sees skills and activity. Never your tutor chats, notes or flashcards.' },
];

const EXAMPLE_MISCONCEPTION = misconceptionText('igcse.physics/electricity/resistance', 'multiplies-v-and-r');

export default function Landing() {
  useTitle('');
  return (
    <div className="landing">
      <header className="landing__nav">
        <Logo size={28} />
        <nav className="row" aria-label="Account">
          <Link to="/signin" className="btn btn--ghost">Sign in</Link>
          <ButtonLink to="/signup">Get started</ButtonLink>
        </nav>
      </header>

      <main>
        <section className="landing__hero">
          <div className="landing__hero-copy">
            <p className="badge badge--primary">For IGCSE and Digital SAT students</p>
            <h1 className="landing__title">
              Chapter knows what you don&rsquo;t understand yet.
              <span className="serif landing__title-accent"> And teaches it until it sticks.</span>
            </h1>
            <p className="landing__lede">
              Adaptive practice that finds your weak skills, spots the misconception behind each mistake, explains it, and checks days later that you really learned it.
            </p>
            <div className="row row--wrap landing__ctas">
              <ButtonLink to="/signup" size="lg" iconRight={<ArrowRight />}>Start studying free</ButtonLink>
              <ButtonLink to="/signup?role=parent" size="lg" variant="secondary" icon={<Users />}>I&rsquo;m a parent</ButtonLink>
            </div>
            <p className="text-3 text-sm">Free to use. No card, no trial.</p>
          </div>

          <figure className="landing__preview" aria-labelledby="preview-caption">
            <div className="preview-card" aria-hidden="true">
              <div className="row-sm row--wrap">
                <SubjectIcon subjectKey="igcse.physics" size="sm" />
                <span className="text-xs text-2">Physics · Electricity · Resistance &amp; Ohm&rsquo;s law</span>
                <span className="badge badge--outline">Developing</span>
              </div>
              <p className="preview-card__q">A 12 V battery is connected across a 4 Ω resistor. What current flows?</p>
              <div className="preview-card__options">
                <span className="preview-opt is-wrong"><b>A</b>48 A<XCircle size={16} /></span>
                <span className="preview-opt is-correct"><b>B</b>3 A<CheckCircle2 size={16} /></span>
                <span className="preview-opt is-dim"><b>C</b>0.33 A</span>
              </div>
              <div className="preview-card__misc"><strong>Common mistake:</strong> {EXAMPLE_MISCONCEPTION}</div>
              <div className="preview-card__foot">
                <span className="text-xs text-2">Next: a different question on the same skill, one level easier</span>
              </div>
            </div>
            <figcaption id="preview-caption" className="text-xs text-3">What a wrong answer looks like in Chapter: the misconception is named, then the next question adapts.</figcaption>
          </figure>
        </section>

        <section className="landing__section" aria-labelledby="loop-h">
          <h2 id="loop-h" className="landing__h2">How Chapter teaches</h2>
          <ol className="loop">
            {LOOP.map((s, i) => (
              <li key={s.title} className="loop__step">
                <span className="loop__num" aria-hidden="true">{i + 1}</span>
                <s.icon className="loop__icon" aria-hidden="true" />
                <h3 className="card__title">{s.title}</h3>
                <p className="text-2 text-sm">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing__section" aria-labelledby="features-h">
          <h2 id="features-h" className="landing__h2">Everything you need to revise, in one place</h2>
          <div className="grid-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card feature-card">
                <div className="state__icon" style={{ marginBottom: 12 }} aria-hidden="true"><f.icon /></div>
                <h3 className="card__title">{f.title}</h3>
                <p className="text-2 text-sm mt-2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing__section" aria-labelledby="subjects-h">
          <h2 id="subjects-h" className="landing__h2">Built around your syllabus</h2>
          <ul className="landing__subjects">
            {SUBJECTS.map((s) => (
              <li key={s.key} className="landing__subject">
                <SubjectIcon subjectKey={s.key} size="sm" />
                <span>{s.program === 'igcse' ? `IGCSE ${s.name}` : subjectLabel(s)}</span>
              </li>
            ))}
          </ul>
          <p className="text-3 text-sm center mt-4">Each topic is broken into skills with clear objectives, from Foundation to Advanced.</p>
        </section>

        <section className="landing__section" aria-labelledby="honest-h">
          <h2 id="honest-h" className="landing__h2">Honest by design</h2>
          <div className="grid-3">
            {HONEST.map((f) => (
              <div key={f.title} className="honest">
                <f.icon className="honest__icon" aria-hidden="true" />
                <div>
                  <h3 className="card__title">{f.title}</h3>
                  <p className="text-2 text-sm mt-1">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="landing__section landing__cta">
          <h2 className="landing__h2">Your next chapter starts today</h2>
          <p className="text-2">Setup takes two minutes. Pick your subjects and exam dates, and Chapter plans the rest.</p>
          <ButtonLink to="/signup" size="lg" iconRight={<ArrowRight />}>Create your free account</ButtonLink>
        </section>
      </main>

      <footer className="landing__footer">
        <span>© {new Date().getFullYear()} Chapter · Whitespace Studio</span>
        <nav className="row" aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
        <p className="text-3 text-xs" style={{ width: '100%' }}>
          Chapter is an independent study tool and is not affiliated with Cambridge International or the College Board.
        </p>
      </footer>
    </div>
  );
}
