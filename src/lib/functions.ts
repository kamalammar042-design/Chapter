// Calls to Supabase Edge Functions. The user's access token authenticates
// every call; the functions derive identity from it, never from the body.
import { supabase } from './supabase';
import { env } from './env';
import { AppError, toAppError, type AppErrorCode } from './errors';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError('session_expired');
  return {
    Authorization: `Bearer ${token}`,
    apikey: env.supabaseAnonKey,
    'Content-Type': 'application/json',
  };
}

function fnUrl(name: string): string {
  return `${env.supabaseUrl}/functions/v1/${name}`;
}

async function errorFromResponse(res: Response): Promise<AppError> {
  let body: { error?: string } = {};
  try { body = await res.json(); } catch { /* not json */ }
  if (body.error) return toAppError({ error: body.error });
  if (res.status === 401) return new AppError('session_expired');
  if (res.status === 404) return new AppError('ai_unavailable', 'This feature is not deployed yet.');
  if (res.status === 429) return new AppError('slow_down');
  if (res.status >= 500) return new AppError('ai_unavailable');
  return new AppError('unknown');
}

export async function invokeFunction<T>(name: string, body: unknown, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  if (!env.isConfigured) throw new AppError('not_configured');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
  opts.signal?.addEventListener('abort', () => controller.abort());
  try {
    const res = await fetch(fnUrl(name), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw await errorFromResponse(res);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof AppError) throw e;
    if ((e as Error)?.name === 'AbortError') {
      if (opts.signal?.aborted) throw e;
      throw new AppError('ai_timeout');
    }
    throw toAppError(e);
  } finally {
    window.clearTimeout(timer);
  }
}

export interface TutorStreamHandlers {
  onMeta?: (m: { conversation_id: string; remaining: number }) => void;
  onDelta: (text: string) => void;
  onDone?: (d: { message_id: number | null; truncated?: boolean }) => void;
}

/** Parses a Server-Sent Events body into (event, data) pairs. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
  }
}

/**
 * Streams a tutor reply. Resolves when the reply is complete; rejects with
 * an AppError if the tutor fails at any point, including mid-stream.
 */
export async function streamTutor(body: Record<string, unknown>, handlers: TutorStreamHandlers, signal?: AbortSignal): Promise<void> {
  if (!env.isConfigured) throw new AppError('not_configured');
  let res: Response;
  try {
    res = await fetch(fnUrl('ai-tutor'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw toAppError(e);
  }
  if (!res.ok || !res.body) throw await errorFromResponse(res);

  let finished = false;
  // Guard against a stalled connection: no data for 60 s is a timeout.
  let last = Date.now();
  const watchdog = window.setInterval(() => {
    if (Date.now() - last > 60_000) void res.body?.cancel();
  }, 5000);
  try {
    for await (const { event, data } of parseSse(res.body)) {
      last = Date.now();
      const payload = JSON.parse(data);
      if (event === 'meta') handlers.onMeta?.(payload);
      else if (event === 'delta') handlers.onDelta(payload.text ?? '');
      else if (event === 'done') { finished = true; handlers.onDone?.(payload); }
      else if (event === 'error') throw new AppError((payload.error as AppErrorCode) ?? 'ai_unavailable');
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new AppError('ai_bad_response');
  } finally {
    window.clearInterval(watchdog);
  }
  if (!finished) throw new AppError('ai_timeout');
}

/** Reads a File as base64 (no data: prefix). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Downscales a photo so uploads stay small (≤ 1600 px, JPEG). Phone photos
 * are often 4–12 MB; this keeps them under the 5 MB server limit.
 */
export async function prepareImage(file: File): Promise<{ base64: string; previewUrl: string }> {
  if (!/^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(file.type)) {
    throw new AppError('invalid_request', 'Please choose a photo (JPG, PNG or WebP).');
  }
  if (file.size > 25 * 1024 * 1024) throw new AppError('invalid_request', 'That image is too large. Please use a photo under 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new AppError('invalid_request', 'That file could not be read as an image.'));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AppError('unknown');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new AppError('unknown'))), 'image/jpeg', 0.85));
    if (blob.size > 5 * 1024 * 1024) throw new AppError('invalid_request', 'That image is too large even after resizing.');
    return { base64: await fileToBase64(blob), previewUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
