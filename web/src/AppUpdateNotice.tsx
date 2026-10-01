import { useEffect, useState } from 'react';
import { assetVersion, hasNewAssets, reloadAfterSaving } from './appUpdates';

function documentVersion(doc: Document) {
  const urls = [
    ...Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'), (s) =>
      s.getAttribute('src')!,
    ),
    ...Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'), (s) =>
      s.getAttribute('href')!,
    ),
  ];
  return assetVersion(urls, location.origin);
}

export function AppUpdateNotice({ beforeReload }: { beforeReload: () => Promise<boolean> }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const current = documentVersion(document);
    let checking = false;
    const abort = new AbortController();
    async function check() {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const response = await fetch('/', { cache: 'no-store', signal: abort.signal });
        if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) return;
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (!abort.signal.aborted) setAvailable(hasNewAssets(current, documentVersion(html)));
      } catch {
        // Keep the working editor open when the network is unavailable.
      } finally {
        checking = false;
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  if (!available) return null;
  return (
    <div className="app-update-notice" role="status">
      <span>Nová verzia INVOY je pripravená.</span>
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            if (
              !(await reloadAfterSaving(
                beforeReload,
                () => location.reload(),
                () => !document.querySelector('[role="dialog"]'),
              ))
            ) {
              setError('Najprv dokončite rozpracované údaje. Zmeny zostávajú otvorené.');
            }
          } catch {
            setError('Zmeny sa nepodarilo uložiť. Skúste to znova.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Ukladám…' : 'Obnoviť'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
