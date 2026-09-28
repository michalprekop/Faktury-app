import { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, Download, Cloud } from 'lucide-react';
import { profileSchema, type Profile, type Template } from '../shared/model';
import { api } from './api';
import { CompanyFields, Field, ErrorBox, ImageInput, useUnsaved } from './ui';

export function Settings({
  initial,
  version,
  templates,
  onSaved,
  registerFlush,
  accountID,
}: {
  initial: Profile;
  version: number;
  templates: Template[];
  registerFlush: (flush: (() => Promise<boolean>) | null) => void;
  accountID: string;
  onSaved: (profile: Profile, version: number) => void;
}) {
  const key = `faktury-profile:${accountID}`;
  const recovered = useRef<{ profile: Profile; version: number } | null>(null);
  const [profile, setProfile] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      if (v) {
        recovered.current = JSON.parse(v);
        return recovered.current!.profile;
      }
    } catch {}
    return initial;
  });
  const [saved, setSaved] = useState(initial),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [tab, setTab] = useState('Moja firma');
  const latest = useRef(profile),
    ack = useRef(initial),
    revision = useRef(recovered.current?.version ?? version),
    inflight = useRef<Promise<boolean> | null>(null),
    blocked = useRef(false);
  latest.current = profile;
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved);
  useUnsaved(dirty);
  function update(part: Partial<Profile>) {
    blocked.current = false;
    setError('');
    setProfile((p) => ({ ...p, ...part }));
  }
  async function save(): Promise<boolean> {
    if (inflight.current) return inflight.current;
    const work = (async () => {
      while (JSON.stringify(latest.current) !== JSON.stringify(ack.current)) {
        const snapshot = latest.current,
          result = profileSchema.safeParse(snapshot);
        if (!result.success) {
          setError(
            result.error.issues
              .slice(0, 2)
              .map((i) => i.message)
              .join(' '),
          );
          return false;
        }
        setBusy(true);
        try {
          const next = await api<{ version: number }>('/profile', {
            method: 'PUT',
            body: JSON.stringify({ profile: result.data, version: revision.current }),
          });
          revision.current = next.version;
          ack.current = result.data;
          setSaved(result.data);
          onSaved(result.data, next.version);
          if (JSON.stringify(latest.current) === JSON.stringify(snapshot)) {
            latest.current = result.data;
            setProfile(result.data);
            localStorage.removeItem(key);
          } else
            localStorage.setItem(
              key,
              JSON.stringify({ profile: latest.current, version: next.version }),
            );
        } catch (e) {
          blocked.current = true;
          setError((e as Error).message);
          return false;
        }
      }
      setError('');
      return true;
    })();
    inflight.current = work;
    try {
      return await work;
    } finally {
      inflight.current = null;
      setBusy(false);
    }
  }
  useEffect(() => {
    registerFlush(save);
    return () => registerFlush(null);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(key, JSON.stringify({ profile, version: revision.current }));
    } catch {
      setError('Rozpracované nastavenia sa nepodarilo uložiť v prehliadači.');
    }
    if (blocked.current) return;
    const timer = setTimeout(() => void save(), 450);
    return () => clearTimeout(timer);
  }, [profile, dirty]);
  return (
    <div className="page narrow" data-unsaved={dirty}>
      <div className="page-heading">
        <div>
          <h1>Nastavenia</h1>
        </div>
        <span className="save-state">{busy ? 'Ukladám…' : dirty ? 'Rozpracované' : 'Uložené'}</span>
      </div>
      <ErrorBox error={error} />
      {error && (
        <button
          onClick={() => {
            blocked.current = false;
            void save();
          }}
        >
          Zopakovať uloženie
        </button>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className="tabs section-tabs">
        {['Moja firma', 'Bankové účty', 'Vzhľad', 'Predvoľby', 'Zálohy'].map((x) => (
          <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      {tab === 'Moja firma' && (
        <section className="panel">
          <h2>Údaje dodávateľa</h2>
          <p className="muted">
            Zmeny sa použijú na nových faktúrach. Existujúce dokumenty si zachovajú svoje údaje.
          </p>
          <CompanyFields value={profile.supplier} onChange={(supplier) => update({ supplier })} />
          <div className="image-grid">
            <ImageInput
              label="Logo firmy"
              value={profile.logo}
              onChange={(logo) => update({ logo })}
              onError={setError}
            />
            <ImageInput
              label="Podpis"
              value={profile.signature}
              onChange={(signature) => update({ signature })}
              onError={setError}
            />
          </div>
        </section>
      )}
      {tab === 'Bankové účty' && (
        <section className="panel">
          <h2>Bankové účty</h2>
          <p className="muted">Na každej faktúre bude iba jeden vybraný účet.</p>
          {profile.accounts.map((a, index) => (
            <div className="account-card" key={a.id}>
              <header>
                <strong>Účet {index + 1}</strong>
                <button
                  className="icon-button danger"
                  aria-label={`Odstrániť účet ${index + 1}`}
                  onClick={() =>
                    update({
                      accounts: profile.accounts.filter((x) => x.id !== a.id),
                      defaultAccountID:
                        profile.defaultAccountID === a.id ? null : profile.defaultAccountID,
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </header>
              <div className="form-grid">
                {(['name', 'iban', 'swift', 'holderName'] as const).map((k, i) => (
                  <Field key={k} label={['Názov banky', 'IBAN', 'SWIFT / BIC', 'Majiteľ účtu'][i]}>
                    <input
                      value={a[k]}
                      onChange={(e) =>
                        update({
                          accounts: profile.accounts.map((x) =>
                            x.id === a.id ? { ...x, [k]: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
                <label className="check wide">
                  <input
                    type="radio"
                    name="defaultAccount"
                    checked={profile.defaultAccountID === a.id}
                    onChange={() => update({ defaultAccountID: a.id })}
                  />
                  Predvolený účet
                </label>
              </div>
            </div>
          ))}
          <button
            className="button secondary"
            onClick={() =>
              update({
                accounts: [
                  ...profile.accounts,
                  { id: crypto.randomUUID(), name: '', iban: '', swift: '', holderName: '' },
                ],
              })
            }
          >
            <Plus size={16} />
            Pridať účet
          </button>
        </section>
      )}
      {tab === 'Predvoľby' && (
        <section className="panel">
          <h2>Predvolené údaje</h2>
          <div className="form-grid">
            <Field label="Splatnosť (dní)">
              <input
                type="number"
                min="0"
                max="365"
                value={profile.dueDays}
                onChange={(e) => update({ dueDays: Number(e.target.value) })}
              />
            </Field>
            <Field label="Mena">
              <select
                value={profile.currency}
                onChange={(e) => update({ currency: e.target.value as Profile['currency'] })}
              >
                {['EUR', 'CZK', 'USD', 'GBP'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Prefix čísla faktúry">
              <input
                value={profile.numberPrefix}
                onChange={(e) => update({ numberPrefix: e.target.value })}
              />
            </Field>
            <Field label="Počet číslic poradia">
              <input
                type="number"
                min="1"
                max="8"
                value={profile.numberDigits}
                onChange={(e) => update({ numberDigits: Number(e.target.value) })}
              />
            </Field>
            <Field label="Predvolená DPH (%)">
              <input
                inputMode="decimal"
                value={profile.defaultVAT}
                onChange={(e) => update({ defaultVAT: e.target.value.replace(',', '.') })}
              />
            </Field>
            <Field label="Vystavil(a)">
              <input
                value={profile.issuedBy}
                onChange={(e) => update({ issuedBy: e.target.value })}
              />
            </Field>
            <Field label="Poznámka na faktúre" wide>
              <textarea
                rows={4}
                value={profile.defaultNote}
                onChange={(e) => update({ defaultNote: e.target.value })}
              />
            </Field>
          </div>
        </section>
      )}
      {tab === 'Vzhľad' && (
        <section className="panel">
          <h2>Vaše šablóny</h2>
          <p className="muted">Správca vám môže pridať vlastný dizajn a branding.</p>
          <div className="template-options">
            {templates.map((t) => (
              <button
                key={t.id}
                className={
                  'template-option' + (profile.defaultTemplateID === t.id ? ' selected' : '')
                }
                onClick={() =>
                  update({
                    defaultTemplateID: t.id,
                    appearance: {
                      accent: profile.appearance?.accent ?? t.config.accent,
                      template: t.config.layout === 'mono' ? 'mono01' : 'boringDefault01',
                    },
                  })
                }
              >
                <span
                  className={`mini-paper ${t.config.layout}`}
                  style={{ borderTopColor: t.config.accent }}
                >
                  <i />
                  <i />
                  <i />
                </span>
                <strong>{t.name}</strong>
                <small>{t.description}</small>
              </button>
            ))}
          </div>
          {!templates.length && <p>Správca zatiaľ nepriradil žiadnu šablónu.</p>}
        </section>
      )}
      {tab === 'Zálohy' && <Backups />}
    </div>
  );
}
function Backups() {
  const [rows, setRows] = useState<{ day: string; size: number; createdAt: string }[] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setRows(await api('/backups'));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel">
      <Cloud size={28} />
      <h2>Vaše dáta sú uložené v účte</h2>
      <p className="muted">
        Na novom počítači sa prihláste tým istým Apple účtom. Okrem priebežného ukladania sa vytvára
        denná záloha. Vlastnú kópiu si môžete stiahnuť kedykoľvek.
      </p>
      <ErrorBox error={error} />
      <div className="button-row">
        <label className="button secondary">
          Importovať pôvodné faktúry
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError('');
              try {
                if (file.size > 25_000_000) throw Error('Záloha je príliš veľká.');
                const source = JSON.parse(await file.text());
                const result = await api<{ imported: number }>('/native/import', {
                  method: 'POST',
                  body: JSON.stringify(source),
                });
                alert(`Importovaných ${result.imported} faktúr.`);
                location.reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <a className="button" href="/api/export" download>
          <Download size={16} />
          Exportovať všetky dáta
        </a>
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api('/backups', { method: 'POST', body: '{}' });
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Zálohujem…' : 'Vytvoriť zálohu teraz'}
        </button>
        <button className="text-button" onClick={() => void load()}>
          Zobraziť zálohy
        </button>
      </div>
      {rows && (
        <div className="backup-list">
          {rows.length ? (
            rows.map((r) => (
              <a key={r.day} href={`/api/backups/${r.day}`} download>
                <span>{r.day}</span>
                <span>{Math.ceil(r.size / 1024)} kB</span>
                <Download size={16} />
              </a>
            ))
          ) : (
            <p>Denná záloha sa ešte nevytvorila. Môžete ju vytvoriť teraz.</p>
          )}
        </div>
      )}
    </section>
  );
}
