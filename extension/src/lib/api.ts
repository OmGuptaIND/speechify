import type { Speech, Voice } from '../shared';
const BASE = 'http://127.0.0.1:8767';
export async function health() {
  const response = await fetch(BASE + '/v1/health', { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error('The local reader is not available.');
  return response.json() as Promise<{
    models_ready: boolean;
    worker_loaded: boolean;
    busy: boolean;
  }>;
}
export async function connect(key: string) {
  const response = await fetch(BASE + '/v1/voices', {
    headers: { Authorization: 'Bearer ' + key.trim() },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok)
    throw new Error(
      'That connection key did not match. Copy the key from the reader’s Terminal window.',
    );
}
export async function speak(
  text: string,
  voice: Voice,
  key: string,
  signal: AbortSignal,
): Promise<Speech> {
  for (let attempt = 0; attempt < 30; attempt++) {
    signal.throwIfAborted();
    const response = await fetch(BASE + '/v1/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ text, voice }),
      signal,
    });
    if (response.status === 409) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 300);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      });
      continue;
    }
    if (!response.ok) {
      const body = await response.json();
      throw new Error(
        typeof body.detail === 'string'
          ? body.detail
          : 'This passage could not be prepared. Try a shorter selection.',
      );
    }
    return response.json();
  }
  throw new Error('Bella is still busy. Pause for a moment and try again.');
}
