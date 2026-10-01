import { manoloBay } from '../shared/manolo-bay';
import { useEffect, useState } from 'react';
import { Plus, Save, Users, Palette, ShieldCheck } from 'lucide-react';
import {
  baseConfig,
  emptyProfile,
  freshInvoice,
  templateSchema,
  type User,
  type Template,
} from '../shared/model';
import { api } from './api';
import { ErrorBox, Field, ImageInput, Modal, useUnsaved } from './ui';
import { InvoicePaper } from './InvoicePaper';

type AdminData = {
  users: User[];
  grants: { user_id: string; template_id: string }[];
  backup: null | { day: string; status: string; accounts: number };
};
export function Admin() {
  const [data, setData] = useState<AdminData | null>(null),
    [templates, setTemplates] = useState<Template[]>([]),
    [tab, setTab] = useState('Používatelia'),
    [error, setError] = useState(''),
    [editor, setEditor] = useState<Template | null>(null),
    [selected, setSelected] = useState<User | null>(null),
    [grants, setGrants] = useState<string[]>([]),
    [status, setStatus] = useState<User['status']>('active'),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function load() {
    try {
      const [d, t] = await Promise.all([
        api<AdminData>('/admin/users'),
        api<Template[]>('/admin/templates'),
      ]);
      setData(d);
      setTemplates(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function saveUser() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, templates: grants }),
      });
      setSelected(null);
      setNotice('Prístup a šablóny používateľa sú uložené.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Správa produktu</span>
          <h1>Administrácia</h1>
          <p>Každému účtu presne tie šablóny, ktoré potrebuje.</p>
        </div>
        <span className="badge">
          <ShieldCheck size={15} />
          Správca
        </span>
      </div>
      <ErrorBox error={error} />
      {notice && <div className="notice">{notice}</div>}
      <div className="tabs section-tabs">
        <button
          className={tab === 'Používatelia' ? 'active' : ''}
          onClick={() => setTab('Používatelia')}
        >
          <Users size={16} />
          Používatelia
        </button>
        <button className={tab === 'Šablóny' ? 'active' : ''} onClick={() => setTab('Šablóny')}>
          <Palette size={16} />
          Šablóny
        </button>
      </div>
      {tab === 'Používatelia' && (
        <>
          <div className="admin-summary">
            <span>{data?.users.length ?? '…'} účtov</span>
            <span>
              Denná záloha:{' '}
              {data?.backup
                ? `${data.backup.day} · ${data.backup.status === 'complete' ? 'dokončená' : data.backup.status === 'failed' ? 'zlyhala' : 'prebieha'}`
                : 'zatiaľ nevytvorená'}
            </span>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api('/admin/backup', { method: 'POST', body: '{}' });
                  setNotice('Denná záloha bola dokončená.');
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Spustiť zálohu
            </button>
          </div>
          <div className="panel table-panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Používateľ</th>
                  <th>Stav</th>
                  <th>Šablóny</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name || 'Apple účet'}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>
                      <span className={'badge ' + user.status}>
                        {user.status === 'active'
                          ? 'Aktívny'
                          : user.status === 'pending'
                            ? 'Čaká na aktiváciu'
                            : 'Pozastavený'}
                      </span>
                    </td>
                    <td>
                      <div className="pills">
                        {data.grants
                          .filter((g) => g.user_id === user.id)
                          .map((g) => (
                            <span key={g.template_id}>
                              {templates.find((t) => t.id === g.template_id)?.name ?? g.template_id}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td>
                      <button
                        className="button secondary small"
                        onClick={() => {
                          setSelected(user);
                          setStatus(user.status);
                          setGrants(
                            data.grants
                              .filter(
                                (g) =>
                                  g.user_id === user.id &&
                                  templates.some((t) => t.id === g.template_id && !t.archived),
                              )
                              .map((g) => g.template_id),
                          );
                        }}
                      >
                        Upraviť prístup
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small-copy">
            Používatelia sa vytvoria prihlásením cez Apple. Nový účet čaká na tvoju aktiváciu. Táto
            administrácia nezobrazuje obsah ich faktúr.
          </p>
        </>
      )}
      {tab === 'Šablóny' && (
        <>
          <div className="section-heading">
            <h2>Knižnica šablón</h2>
            <button
              className="button"
              onClick={() =>
                setEditor({
                  id: crypto.randomUUID(),
                  name: '',
                  description: '',
                  version: 0,
                  archived: false,
                  config: { ...baseConfig },
                })
              }
            >
              <Plus size={16} />
              Nová šablóna
            </button>
          </div>
          <div className="template-grid">
            {templates.map((t) => (
              <button
                key={t.id}
                className={'template-card' + (t.archived ? ' archived' : '')}
                onClick={() => setEditor(structuredClone(t))}
              >
                <div
                  className={'template-thumbnail ' + t.config.layout}
                  style={{ borderTopColor: t.config.accent }}
                >
                  {t.config.layout === 'manoloBay' ? (
                    <img src={manoloBay.logo} alt="" />
                  ) : t.config.logo ? (
                    <img src={t.config.logo} alt="" />
                  ) : (
                    <b>{t.config.wordmark || 'FAKTÚRA'}</b>
                  )}
                  <span />
                  <span />
                  <span />
                  <div />
                  <span />
                  <span />
                </div>
                <div>
                  <strong>{t.name}</strong>
                  <p>{t.description}</p>
                  <small>{t.archived ? 'Archivovaná' : 'Verzia ' + t.version}</small>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {selected && (
        <Modal title="Prístup používateľa" onClose={() => setSelected(null)}>
          <p>
            <strong>{selected.name || 'Apple účet'}</strong>
            <br />
            {selected.email}
          </p>
          <ErrorBox error={error} />
          <Field label="Stav účtu">
            <select value={status} onChange={(e) => setStatus(e.target.value as User['status'])}>
              <option value="pending">Čaká na aktiváciu</option>
              <option value="active">Aktívny</option>
              <option value="suspended">Pozastavený</option>
            </select>
          </Field>
          <h3>Dostupné šablóny</h3>
          <div className="grant-list">
            {templates
              .filter((t) => !t.archived)
              .map((t) => (
                <label key={t.id} className="check grant">
                  <input
                    type="checkbox"
                    checked={grants.includes(t.id)}
                    onChange={(e) =>
                      setGrants(
                        e.target.checked ? [...grants, t.id] : grants.filter((g) => g !== t.id),
                      )
                    }
                  />
                  <span>
                    <strong>{t.name}</strong>
                    <small>{t.description}</small>
                  </span>
                </label>
              ))}
          </div>
          <button className="button full" disabled={busy} onClick={() => void saveUser()}>
            <Save size={16} />
            Uložiť prístup
          </button>
        </Modal>
      )}
      {editor && (
        <TemplateEditor
          initial={editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            setNotice('Šablóna je uložená. Priraď ju požadovaným používateľom.');
            await load();
          }}
        />
      )}
    </div>
  );
}
function TemplateEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Template;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  useUnsaved(dirty);
  const close = () => {
    if (!dirty || confirm('Opustiť rozpracovanú šablónu bez uloženia?')) onClose();
  };
  const p = emptyProfile();
  p.supplier.name = 'Ukážková firma';
  p.supplier.street = 'Ukážková 12';
  p.supplier.city = 'Bratislava';
  p.supplier.postalCode = '811 01';
  const example = freshInvoice(p, '2026001', value.id);
  example.customer = { ...p.supplier, name: 'Ukážkový odberateľ' };
  example.items[0] = { ...example.items[0], name: 'Grafické práce', unitPrice: '450' };
  example.paymentMethod = 'Hotovosť';
  return (
    <Modal title={initial.version ? 'Upraviť šablónu' : 'Nová šablóna'} onClose={close}>
      <ErrorBox error={error} />
      <div className="template-editor" data-unsaved={dirty}>
        <div>
          <div className="form-grid">
            <Field label="Názov šablóny" wide>
              <input
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
            </Field>
            <Field label="Popis" wide>
              <input
                value={value.description}
                onChange={(e) => setValue({ ...value, description: e.target.value })}
              />
            </Field>
            <Field label="Základ rozloženia">
              <select
                value={value.config.layout}
                onChange={(e) =>
                  setValue({
                    ...value,
                    config: {
                      ...value.config,
                      layout: e.target.value as Template['config']['layout'],
                    },
                  })
                }
              >
                <option value="classic">Boring default 01</option>
                <option value="mono">Mono 01</option>
                <option value="manoloBay">Manolo &amp; Bay</option>
              </select>
            </Field>
            {value.config.layout === 'manoloBay' ? (
              <p className="muted small-copy">
                Logo, znak v pozadí, zvýraznenie #F2EEEA a kontakty Dominiky Vašek sú súčasťou
                šablóny Manolo &amp; Bay.
              </p>
            ) : (
              <>
                <Field label="Farba">
                  <input
                    type="color"
                    value={value.config.accent}
                    onChange={(e) =>
                      setValue({ ...value, config: { ...value.config, accent: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Textová značka" wide>
                  <input
                    value={value.config.wordmark}
                    onChange={(e) =>
                      setValue({ ...value, config: { ...value.config, wordmark: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Pätička faktúry" wide>
                  <textarea
                    rows={3}
                    value={value.config.footer}
                    onChange={(e) =>
                      setValue({ ...value, config: { ...value.config, footer: e.target.value } })
                    }
                  />
                </Field>
              </>
            )}
          </div>
          {value.config.layout !== 'manoloBay' && (
            <ImageInput
              label="Logo v šablóne"
              value={value.config.logo}
              onChange={(logo) => setValue({ ...value, config: { ...value.config, logo } })}
              onError={setError}
            />
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={value.archived}
              onChange={(e) => setValue({ ...value, archived: e.target.checked })}
            />
            Archivovať šablónu
          </label>
          <p className="muted small-copy">
            Vystavené faktúry si zachovajú uložený vzhľad. Zmena šablóny sa prejaví pri jej použití
            na nových faktúrach.
          </p>
          <button
            className="button full"
            disabled={busy}
            onClick={async () => {
              const { id, ...input } = value;
              const parsed = templateSchema.safeParse(input);
              if (!parsed.success) {
                setError(parsed.error.issues.map((i) => i.message).join(' '));
                return;
              }
              setBusy(true);
              try {
                await api(`/admin/templates/${id}`, {
                  method: 'PUT',
                  body: JSON.stringify(parsed.data),
                });
                await onSaved();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Save size={16} />
            Uložiť šablónu
          </button>
        </div>
        <div className="template-preview">
          <InvoicePaper invoice={example} theme={value.config} />
        </div>
      </div>
    </Modal>
  );
}
