import { useState } from 'react';
import { Save, Plus, Trash2, Download, Cloud } from 'lucide-react';
import { profileSchema, type Profile, type Template } from '../shared/model';
import { api } from './api';
import { CompanyFields, Field, ErrorBox, ImageInput, useUnsaved } from './ui';

export function Settings({
  initial,
  version,
  templates,
  onSaved,
}: {
  initial: Profile;
  version: number;
  templates: Template[];
  onSaved: (profile: Profile, version: number) => void;
}) {
  const [profile, setProfile] = useState(initial),
    [saved, setSaved] = useState(initial),
    [revision, setRevision] = useState(version),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [tab, setTab] = useState('Firma');
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved);
  useUnsaved(dirty);
  const update = (part: Partial<Profile>) => {
    setNotice('');
    setProfile((p) => ({ ...p, ...part }));
  };
  async function save() {
    setError('');
    const result = profileSchema.safeParse(profile);
    if (!result.success) {
      setError(
        result.error.issues
          .map((i) => i.message)
          .slice(0, 4)
          .join(' '),
      );
      return;
    }
    setBusy(true);
    try {
      const next = await api<{ version: number }>('/profile', {
        method: 'PUT',
        body: JSON.stringify({ profile: result.data, version: revision }),
      });
      setProfile(result.data);
      setSaved(result.data);
      setRevision(next.version);
      onSaved(result.data, next.version);
      setNotice('Profil je uložený v cloude.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page narrow" data-unsaved={dirty}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Váš pracovný priestor</span>
          <h1>Nastavenia</h1>
          <p>Firemné údaje, bankové účty a vzhľad faktúr.</p>
        </div>
        <button className="button" disabled={busy || !dirty} onClick={() => void save()}>
          <Save size={16} />
          {busy ? 'Ukladám…' : 'Uložiť zmeny'}
        </button>
      </div>
      <ErrorBox error={error} />
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className="tabs section-tabs">
        {['Firma', 'Bankové účty', 'Faktúry', 'Vzhľad', 'Zálohy'].map((x) => (
          <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      {tab === 'Firma' && (
        <section className="panel">
          <h2>Údaje dodávateľa</h2>
          <p className="muted">
            Zmeny sa použijú na nových faktúrach. Existujúce dokumenty si zachovajú svoje údaje.
          </p>
          <CompanyFields value={profile.supplier} onChange={(supplier) => update({ supplier })} />
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
      {tab === 'Faktúry' && (
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
                onClick={() => update({ defaultTemplateID: t.id })}
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
