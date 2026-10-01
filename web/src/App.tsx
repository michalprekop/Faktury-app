import { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import { api, setCSRF } from './api';
import { type User, type Profile, type Template } from '../shared/model';
import { LegacyWorkspace } from './LegacyWorkspace';
import { BrandWordmark } from './BrandWordmark';
import { Landing, type LandingConfig } from './Landing';

type Me = { user: User; csrf: string; profile: Profile; profileVersion: number };
export default function App() {
  const [me, setMe] = useState<Me | null>(null),
    [config, setConfig] = useState<LandingConfig | null>(null),
    [ready, setReady] = useState(false),
    [templates, setTemplates] = useState<Template[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    void (async () => {
      try {
        setConfig(await api<LandingConfig>('/config'));
        const response = await fetch('/api/me', { cache: 'no-store' });
        if (response.ok) {
          const value = (await response.json()) as Me;
          setCSRF(value.csrf);
          setMe(value);
          if (value.user.status === 'active') setTemplates(await api<Template[]>('/templates'));
        } else if (response.status !== 401) {
          const result = (await response.json()) as { error: string };
          setError(result.error);
        }
      } catch {
        setError('Nepodarilo sa spojiť so serverom. Skontrolujte internet a obnovte stránku.');
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const canLeave = () =>
    !document.querySelector('[data-unsaved="true"]') ||
    confirm('Máte neuložené zmeny. Chcete túto stránku opustiť?');
  async function logout() {
    if (!canLeave()) return;
    try {
      await api('/logout', { method: 'POST', body: '{}' });
      setCSRF('');
      setTemplates([]);
      setMe(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!ready)
    return (
      <div className="loading">
        <Brand />
        <p>Otváram váš pracovný priestor…</p>
      </div>
    );
  const landingVariant = new URLSearchParams(location.search).get('variant');
  if (!me || landingVariant === 'a' || landingVariant === 'b')
    return <Landing config={config} error={error} />;
  if (me.user.status !== 'active')
    return (
      <div className="pending-page">
        <Brand />
        <div className="panel">
          <Cloud size={36} />
          <h1>Váš účet je pripravený.</h1>
          <p>Správca ho ešte musí aktivovať a priradiť vám šablóny faktúr.</p>
          <p className="muted">{me.user.email}</p>
          <button className="button" onClick={() => location.reload()}>
            Skontrolovať aktiváciu
          </button>
          <button className="text-button" onClick={() => void logout()}>
            Odhlásiť sa
          </button>
        </div>
      </div>
    );
  return (
    <LegacyWorkspace
      me={me}
      templates={templates}
      onProfile={(profile, profileVersion) => setMe({ ...me, profile, profileVersion })}
      onLogout={logout}
    />
  );
}

function Brand() {
  return (
    <div className="brand">
      <BrandWordmark />
    </div>
  );
}
