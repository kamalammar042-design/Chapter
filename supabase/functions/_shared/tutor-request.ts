// Validation of ai-tutor request bodies. Pure; unit-tested.
import { SUBJECT_KEY_RE, TOPIC_KEY_RE, UUID_RE } from './http.ts';
import { validateImage, type ImageType } from './images.ts';
import { TUTOR_MODES, type MistakeContext, type TutorMode } from './prompts.ts';

export const MAX_MESSAGE_CHARS = 8000;
export const MAX_IMAGES = 3;

export interface TutorRequest {
  conversationId: string | null;
  message: string;
  mode: TutorMode;
  subjectKey: string | null;
  topicKey: string | null;
  images: Array<{ mediaType: ImageType; bytes: Uint8Array; base64: string }>;
  question: MistakeContext | null;
  /** hint mode: 1 principle, 2 first step, 3 all but the answer */
  hintLevel: number;
}

export type TutorRequestResult =
  | { ok: true; value: TutorRequest }
  | { ok: false; field: string; reason: string };

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length && t.length <= max ? t : null;
}

export function parseTutorRequest(body: Record<string, unknown>): TutorRequestResult {
  const mode = (body.mode ?? 'chat') as TutorMode;
  if (!TUTOR_MODES.includes(mode)) return { ok: false, field: 'mode', reason: 'unknown mode' };

  const conversationId = body.conversation_id ?? null;
  if (conversationId !== null && (typeof conversationId !== 'string' || !UUID_RE.test(conversationId))) {
    return { ok: false, field: 'conversation_id', reason: 'invalid id' };
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length > MAX_MESSAGE_CHARS) return { ok: false, field: 'message', reason: 'too long' };

  const subjectKey = body.subject_key ?? null;
  if (subjectKey !== null && (typeof subjectKey !== 'string' || !SUBJECT_KEY_RE.test(subjectKey))) {
    return { ok: false, field: 'subject_key', reason: 'invalid' };
  }
  const topicKey = body.topic_key ?? null;
  if (topicKey !== null && (typeof topicKey !== 'string' || !TOPIC_KEY_RE.test(topicKey))) {
    return { ok: false, field: 'topic_key', reason: 'invalid' };
  }

  const rawImages = body.images ?? [];
  if (!Array.isArray(rawImages) || rawImages.length > MAX_IMAGES) {
    return { ok: false, field: 'images', reason: `at most ${MAX_IMAGES} images` };
  }
  const images: TutorRequest['images'] = [];
  for (const img of rawImages) {
    const data = img && typeof img === 'object' ? (img as Record<string, unknown>).data : img;
    const check = validateImage(data);
    if (!check.ok) return { ok: false, field: 'images', reason: check.reason };
    images.push({ mediaType: check.mediaType, bytes: check.bytes, base64: check.base64 });
  }

  let question: MistakeContext | null = null;
  if (body.question != null) {
    const q = body.question as Record<string, unknown>;
    const text = str(q?.question, 2000);
    if (!text) return { ok: false, field: 'question', reason: 'missing question text' };
    const options = Array.isArray(q.options)
      ? q.options.slice(0, 6).map((o) => String(o ?? '').slice(0, 500))
      : undefined;
    question = {
      question: text,
      options,
      chosen: str(q.chosen, 500),
      correct: str(q.correct, 500),
      explanation: str(q.explanation, 1500),
      misconception: str(q.misconception, 300),
    };
  }

  const hintLevel = typeof body.hint_level === 'number' && [1, 2, 3].includes(body.hint_level) ? body.hint_level : 1;

  if (mode === 'scan' && !images.length) return { ok: false, field: 'images', reason: 'scan needs an image' };
  if (!message && !images.length && !question) {
    return { ok: false, field: 'message', reason: 'empty' };
  }

  return {
    ok: true,
    value: { conversationId: conversationId as string | null, message, mode, subjectKey: subjectKey as string | null, topicKey: topicKey as string | null, images, question, hintLevel },
  };
}
