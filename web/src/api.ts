export let csrf = '';
export function setCSRF(value: string) {
  csrf = value;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers },
  });
  if (!response.ok) {
    const data = (await response
      .json()
      .catch(() => ({ error: 'Spojenie so serverom sa nepodarilo.' }))) as { error?: string };
    throw new Error(data.error ?? 'Požiadavka sa nepodarila.');
  }
  return response.json();
}
export async function imageFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Vyberte PNG alebo JPEG.');
  if (file.size > 130_000) throw new Error('Obrázok môže mať najviac 130 kB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Obrázok sa nepodarilo načítať.'));
    reader.readAsDataURL(file);
  });
}
