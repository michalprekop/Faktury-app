import { useEffect, useState } from 'react';
import { FileText, Cloud, Download, Check } from 'lucide-react';
import { api, setCSRF } from './api';
import { type User, type Profile, type Template } from '../shared/model';
import { LegacyWorkspace } from './LegacyWorkspace';
import { ErrorBox } from './ui';

type Me = { user: User; csrf: string; profile: Profile; profileVersion: number };
type Config = {
  name: string;
  appleReady: boolean;
  registrationOpen: boolean;
  macAvailable: boolean;
};
export default function App() {
  const [me, setMe] = useState<Me | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [ready, setReady] = useState(false),
    [templates, setTemplates] = useState<Template[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    void (async () => {
      try {
        setConfig(await api<Config>('/config'));
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
  if (!me) return <Landing config={config} error={error} />;
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
      <span>
        <FileText size={22} strokeWidth={1.7} />
      </span>
      <strong>
        INVOY<span className="brand-dot">.</span>
      </strong>
    </div>
  );
}
function Landing({ config, error }: { config: Config | null; error: string }) {
  const auth = new URLSearchParams(location.search).get('auth');
  const messages: Record<string, string> = {
    failed: 'Apple prihlásenie sa nepodarilo. Skúste to znova.',
    closed: 'Registrácia ešte nie je otvorená.',
    suspended: 'Tento účet je pozastavený.',
    'not-configured': 'Apple prihlásenie sa ešte pripravuje.',
  };
  return (
    <div className="landing">
      <header>
        <Brand />
        {config?.macAvailable && (
          <a className="button secondary" href="/download/mac">
            <Download size={16} />
            Pre Mac
          </a>
        )}
      </header>
      <div className="landing-body">
        <div className="landing-copy">
          <span className="eyebrow">
            <span className="tiny-dot" />
            VÁŠ PRIESTOR NA FAKTÚRY
          </span>
          <h1>
            Dobrá práca.
            <br />
            <span>Dobrá faktúra.</span>
          </h1>
          <p>
            Faktúry, ktoré vyzerajú ako vy.
            <br />
            Vlastný dizajn, prehľadné účty a dáta dostupné všade, kde pracujete.
          </p>
          <div className="login-panel">
            <ErrorBox error={error || (auth ? (messages[auth] ?? '') : '')} />
            {config?.appleReady ? (
              <>
                <a className="button account-button" href="/auth/apple">
                  Vytvoriť účet / Prihlásiť sa
                </a>
                <a className="apple-sign-in" href="/auth/apple">
                  <img
                    src="/brand/sign-in-with-apple-sk.png"
                    alt="Prihlásiť sa cez Apple"
                    width="208"
                    height="36"
                  />
                </a>
              </>
            ) : (
              <>
                <button className="button account-button" disabled>
                  Prihlásenie pripravujeme
                </button>
                <small>Priestor sa dokončuje. Vaše faktúry tu zatiaľ nevkladajte.</small>
              </>
            )}
            <small>Jeden Apple účet. Iba vaše faktúry.</small>
          </div>
          <div className="landing-benefits">
            <span>
              <Check size={16} />
              Vaša značka
            </span>
            <span>
              <Check size={16} />
              Cloudové zálohy
            </span>
            <span>
              <Check size={16} />
              Web aj Mac
            </span>
          </div>
        </div>
        <div className="landing-art" aria-hidden="true">
          <div className="floating-label">
            <Cloud size={18} />
            <span>
              Vaša práca.
              <br />
              <b>Na svojom mieste.</b>
            </span>
          </div>
          <div className="sample-paper">
            <div className="sample-brand">
              studio<span>®</span>
            </div>
            <div className="sample-title">
              <span>FAKTÚRA</span>
              <strong>2026001</strong>
            </div>
            <div className="sample-columns">
              <div>
                <small>DODÁVATEĽ</small>
                <b>Vaša firma</b>
                <i />
                <i />
              </div>
              <div>
                <small>ODBERATEĽ</small>
                <b>Váš klient</b>
                <i />
                <i />
              </div>
            </div>
            <div className="sample-table">
              <div>
                <b>Dobrá práca</b>
                <span>1 ×</span>
              </div>
              <div>
                <i />
                <i />
              </div>
              <div>
                <i />
                <i />
              </div>
            </div>
            <div className="sample-total">
              <small>CELKOM NA ÚHRADU</small>
              <strong>1 250,00 €</strong>
            </div>
            <div className="sample-footer">Ďakujeme za spoluprácu.</div>
          </div>
          <div className="sample-tag">
            <Check size={16} />
            Vlastný dizajn. Váš podpis.
          </div>
        </div>
      </div>
      <footer>
        INVOY · Súkromný pracovný priestor · <a href="/privacy.html">Ochrana údajov</a>
        <span>Údaje účtu a faktúry sa ukladajú na Cloudflare.</span>
      </footer>
    </div>
  );
}
