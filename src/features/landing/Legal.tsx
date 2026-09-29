import { Link } from 'react-router';
import { Logo } from '@/components/Logo';
import { useTitle } from '@/components/layout/Page';
import { env, type AiProviderName } from '@/lib/env';

/**
 * Plain-language policies describing what the code actually does. Have a
 * lawyer review these for your jurisdiction before launch.
 */
export default function Legal({ doc }: { doc: 'privacy' | 'terms' }) {
  useTitle(doc === 'privacy' ? 'Privacy Policy' : 'Terms of Use');
  return (
    <div className="page page--reading" style={{ paddingBottom: 64 }}>
      <Link to="/" aria-label="Chapter home" className="mb-6" style={{ display: 'inline-block' }}><Logo /></Link>
      <article className="md legal">
        {doc === 'privacy' ? <Privacy /> : <Terms />}
      </article>
    </div>
  );
}

function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>This policy explains what Chapter stores, why, and the control you have over it.</p>
      <h2>What we store</h2>
      <ul>
        <li><strong>Account:</strong> your email address, first name, optional username, time zone and study preferences.</li>
        <li><strong>Study activity:</strong> the questions you answer (which option you chose, whether it was right, how long it took, whether you used a hint, and for wrong answers the question text), practice sessions, flashcards, notes, goals, study-time preferences and past-paper scores you log.</li>
        <li><strong>Learning model:</strong> a mastery estimate and review schedule for each skill you practise, and recurring mistakes detected from the wrong options you choose. These are calculated from your answers.</li>
        <li><strong>Chapter Plus:</strong> if you subscribe, RevenueCat and Stripe process the payment. Chapter receives whether your subscription is active and when it renews, never your card details.</li>
        <li><strong>Reports and errors:</strong> problems you report about a question, and technical error reports from the app. Error reports contain what failed and on which page, with personal details removed; your account is recorded only as a one-way code.</li>
        <li><strong>Tutor conversations:</strong> messages you send to the AI tutor, images you upload, and the tutor's replies.</li>
        <li><strong>Tutor memory:</strong> short academic notes the tutor keeps to personalise help (for example "finds rearranging equations hard"). You can see and delete every item in Settings → AI tutor.</li>
      </ul>
      <h2>How it is used</h2>
      <p>Only to provide Chapter: to calculate your progress, choose practice, personalise tutoring and show you reports. We do not sell personal data or use it for advertising.</p>
      <h2>AI processing</h2>
      <AiProcessing provider={env.aiProvider} />
      <h2>Who can see your data</h2>
      <p>Only you. If you link a parent account, that parent can see progress summaries (activity, subject and skill mastery, weak skills, goals and past-paper scores). Parents can never see your tutor conversations, notes or flashcards. You can remove a parent's access at any time. Leaderboards show only your username and weekly XP, and you can opt out.</p>
      <h2>Your rights</h2>
      <p>You can download all your data (Settings → Privacy → Export) and permanently delete your account (Settings → Account). Deletion removes your data from our database immediately.</p>
      <h2>Children</h2>
      <p>Chapter is designed for secondary-school students. Students under 16 should use Chapter with a parent's or guardian's agreement.</p>
      <h2>Contact</h2>
      <p>Questions about privacy: whitspacestudio@gmail.com.</p>
    </>
  );
}

const WHAT_IS_SENT = 'Tutor messages, uploaded images and documents, and the academic context needed to answer them (such as your weakest skills and recent mistakes)';

export function AiProcessing({ provider }: { provider: AiProviderName }) {
  const common = 'Questions made from a document you upload are visible only to you. We record how much each AI request cost to run, but not its content, in that record.';
  if (provider === 'groq') {
    return <p>{WHAT_IS_SENT} are sent to Groq, Inc. (United States), which runs open AI models (currently OpenAI's gpt-oss and Alibaba's Qwen) on its own servers to generate replies, questions and flashcards. Groq's terms do not allow it to use them to train models, and it keeps them only as needed to provide the service. {common}</p>;
  }
  if (provider === 'openrouter') {
    return <p>{WHAT_IS_SENT} are sent through OpenRouter, Inc. (United States) to Anthropic's Claude models to generate replies, questions and flashcards. Chapter tells OpenRouter to use only providers that do not keep them for training. {common}</p>;
  }
  if (provider === 'anthropic') {
    return <p>{WHAT_IS_SENT} are sent to our AI provider (Anthropic) to generate replies, questions and flashcards. They are not used to train models under our agreement with the provider. {common}</p>;
  }
  return <p>AI features are currently switched off, so nothing is sent to an AI provider. Before they are switched on, this section will name the provider and what it receives.</p>;
}

function Terms() {
  return (
    <>
      <h1>Terms of Use</h1>
      <p>By creating an account you agree to these terms.</p>
      <h2>Using Chapter</h2>
      <ul>
        <li>Use Chapter to support your own learning. Do not submit AI-generated work as your own assessed work.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
        <li>Do not attempt to misuse the service, access other people's data, or interfere with its operation.</li>
      </ul>
      <h2>AI tutor</h2>
      <p>The tutor is an AI and can make mistakes. Check important facts against your textbook, teacher or official syllabus. Chapter is an independent study tool and is not affiliated with Cambridge International or the College Board.</p>
      <h2>Cost</h2>
      <p>Chapter is free. So that the AI features stay available for everyone, each account has a monthly fair-use allowance of tutor messages and AI-generated questions and flashcards, shown in Settings → Usage &amp; Plus.</p>
      <p>Chapter Plus is an optional monthly subscription that triples those AI allowances. It is sold and processed by RevenueCat and Stripe. You can cancel at any time from the link in Settings → Usage &amp; Plus; Plus then lasts until the end of the period you paid for. Everything else in Chapter stays free whether or not you subscribe.</p>
      <h2>Your content</h2>
      <p>You own the notes and material you create. You give us permission to store and process it to provide the service. Only upload material you are allowed to use; anything generated from your uploads stays private to you.</p>
      <h2>Learning content</h2>
      <p>Chapter's questions are written by Chapter, used under licence, or generated and checked by Chapter. Past papers and syllabuses from exam boards are linked on the publishers' own websites and remain theirs.</p>
      <h2>Changes</h2>
      <p>We may update these terms and will tell you in the app when we do.</p>
    </>
  );
}
