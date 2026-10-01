import { manoloBay } from '../shared/manolo-bay';
import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Users, Palette, ShieldCheck, DatabaseBackup } from 'lucide-react';
import {
  baseConfig,
  emptyProfile,
  freshInvoice,
  templateSchema,
  type User,
  type AdminUser,
  type Template,
} from '../shared/model';
import { api } from './api';
import { ErrorBox, Field, ImageInput, Modal, useUnsaved } from './ui';
import { InvoicePaper } from './InvoicePaper';

type AdminData = {
  users: AdminUser[];
  grants: { user_id: string; template_id: string }[];
  backup: null | { day: string; status: string; accounts: number };
};
export function Admin() {
  const [data, setData] = useState<AdminData | null>(null),
    [templates, setTemplates] = useState<Template[]>([]),
    [tab, setTab] = useState('Používatelia'),
    [error, setError] = useState(''),
    [editor, setEditor] = useState<Template | null>(null),
    [selected, setSelected] = useState<AdminUser | null>(null),
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
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  function editUser(user: AdminUser) {
    setError('');
    setSelected(user);
    setStatus(user.status);
    setGrants(
      data!.grants
        .filter(
          (g) =>
            g.user_id === user.id && templates.some((t) => t.id === g.template_id && !t.archived),
        )
        .map((g) => g.template_id),
    );
  }
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
    <main className="page admin-page">
      <div className="page-heading">
        <div>
          <h1>Administrácia</h1>
          <p>Každému účtu presne tie šablóny, ktoré potrebuje.</p>
        </div>
        <span className="admin-tag admin-role">
          <ShieldCheck size={15} />
          Správca
        </span>
      </div>
      <ErrorBox error={error} />
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className="native-segments section-tabs admin-tabs" aria-label="Sekcie administrácie">
        <button
          aria-pressed={tab === 'Používatelia'}
          className={tab === 'Používatelia' ? 'active' : ''}
          onClick={() => setTab('Používatelia')}
        >
          <Users size={16} />
          Používatelia
        </button>
        <button
          aria-pressed={tab === 'Šablóny'}
          className={tab === 'Šablóny' ? 'active' : ''}
          onClick={() => setTab('Šablóny')}
        >
          <Palette size={16} />
          Šablóny
        </button>
      </div>
      {tab === 'Používatelia' && (
        <>
          <div className="admin-summary">
            <strong>
              Počet účtov: <span className="numeric">{data?.users.length ?? '…'}</span>
            </strong>
            <span className="admin-backup-status">
              Denná záloha:{' '}
              {data?.backup ? (
                <>
                  <span className="numeric">{data.backup.day}</span> ·{' '}
                  {data.backup.status === 'complete'
                    ? 'dokončená'
                    : data.backup.status === 'failed'
                      ? 'zlyhala'
                      : 'prebieha'}
                </>
              ) : (
                'zatiaľ nevytvorená'
              )}
            </span>
            <button
              className="button secondary"
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
              <DatabaseBackup size={16} />
              Spustiť zálohu
            </button>
          </div>
          <div
            className="admin-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Zoznam používateľov"
          >
            <table className="native-invoice-table admin-table" aria-label="Používatelia">
              <thead>
                <tr>
                  <th scope="col">Používateľ</th>
                  <th scope="col">Stav</th>
                  <th scope="col" className="admin-count">
                    Faktúr
                  </th>
                  <th scope="col" className="admin-count">
                    Odberatelia
                  </th>
                  <th scope="col">Šablóny</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map((user) => (
                  <tr
                    key={user.id}
                    className="admin-user-row"
                    tabIndex={0}
                    aria-label={`Upraviť používateľa: ${user.name || user.email || 'Apple účet'}`}
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      event.currentTarget.focus();
                      editUser(user);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        editUser(user);
                      }
                    }}
                  >
                    <td>
                      <strong>{user.name || 'Apple účet'}</strong>
                      <small>{user.email}</small>
                      <LastSeen value={user.last_seen_at} />
                    </td>
                    <td>
                      <span
                        className={
                          'native-status ' +
                          (user.status === 'active'
                            ? 'paid'
                            : user.status === 'pending'
                              ? 'unpaid'
                              : 'overdue')
                        }
                      >
                        {user.status === 'active'
                          ? 'Aktívny'
                          : user.status === 'pending'
                            ? 'Čaká na aktiváciu'
                            : 'Pozastavený'}
                      </span>
                    </td>
                    <td className="admin-count numeric">
                      {user.invoice_count.toLocaleString('sk-SK')}
                    </td>
                    <td className="admin-count numeric">
                      {user.customer_count.toLocaleString('sk-SK')}
                    </td>
                    <td>
                      <div className="admin-template-tags">
                        {data.grants
                          .filter((g) => g.user_id === user.id)
                          .map((g) => (
                            <span className="admin-tag" key={g.template_id}>
                              {templates.find((t) => t.id === g.template_id)?.name ?? g.template_id}
                            </span>
                          ))}
                        {!data.grants.some((g) => g.user_id === user.id) && (
                          <span className="muted">Bez šablón</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!data && !error && (
                  <tr>
                    <td colSpan={5} className="admin-empty">
                      Načítavam používateľov…
                    </td>
                  </tr>
                )}
                {data?.users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="admin-empty">
                      Zatiaľ žiadni používatelia.
                    </td>
                  </tr>
                )}
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
                  <span className="admin-tag">
                    {t.archived ? (
                      'Archivovaná'
                    ) : (
                      <>
                        Verzia <span className="numeric">{t.version}</span>
                      </>
                    )}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {selected && (
        <Modal
          title="Upraviť používateľa"
          className="admin-user-modal"
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div className="admin-user-overview">
            <div className="admin-user-identity">
              <strong>{selected.name || 'Apple účet'}</strong>
              <span>{selected.email}</span>
              <LastSeen value={selected.last_seen_at} />
            </div>
            <dl className="admin-user-stats">
              <div>
                <dt>Faktúr</dt>
                <dd className="numeric">{selected.invoice_count.toLocaleString('sk-SK')}</dd>
              </div>
              <div>
                <dt>Odberatelia</dt>
                <dd className="numeric">{selected.customer_count.toLocaleString('sk-SK')}</dd>
              </div>
            </dl>
          </div>
          <ErrorBox error={error} />
          <div className="admin-user-form">
            <div>
              <Field label="Stav účtu">
                <select
                  disabled={busy || selected.role === 'admin'}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as User['status'])}
                >
                  <option value="pending">Čaká na aktiváciu</option>
                  <option value="active">Aktívny</option>
                  <option value="suspended">Pozastavený</option>
                </select>
              </Field>
              <p className="small-copy">
                {selected.role === 'admin'
                  ? 'Správcovský účet zostáva aktívny.'
                  : 'Aktívny používateľ má prístup k aplikácii a prideleným šablónam.'}
              </p>
            </div>
            <div>
              <h3>Dostupné šablóny</h3>
              <div className="grant-list">
                {templates
                  .filter((t) => !t.archived)
                  .map((t) => (
                    <label key={t.id} className="check grant">
                      <input
                        type="checkbox"
                        disabled={busy}
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
            </div>
          </div>
          <footer className="admin-user-actions">
            <button className="button secondary" disabled={busy} onClick={() => setSelected(null)}>
              Zrušiť
            </button>
            <button className="button" disabled={busy} onClick={() => void saveUser()}>
              <Save size={16} />
              {busy ? 'Ukladám…' : 'Uložiť zmeny'}
            </button>
          </footer>
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
    </main>
  );
}
function LastSeen({ value }: { value: string | null }) {
  return (
    <small className="admin-last-seen">
      Naposledy online:{' '}
      {value ? (
        <time className="numeric" dateTime={value} title="Časové pásmo: Europe/Bratislava">
          {new Intl.DateTimeFormat('sk-SK', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Bratislava',
          }).format(new Date(value))}
        </time>
      ) : (
        'zatiaľ nezaznamenané'
      )}
    </small>
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
    [busy, setBusy] = useState(false),
    [previewScale, setPreviewScale] = useState(0.6);
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setPreviewScale(Math.min(1, entry.contentRect.width / 794));
    });
    if (preview.current) observer.observe(preview.current);
    return () => observer.disconnect();
  }, []);
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
        <div className="template-preview" ref={preview}>
          <div className="admin-preview-paper" style={{ zoom: previewScale }}>
            <InvoicePaper invoice={example} theme={value.config} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
