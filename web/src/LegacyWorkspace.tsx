import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Cloud,
  FileText,
  LayoutList,
  Plus,
  Search,
  Settings2,
  Table2,
  Trash2,
  RotateCcw,
  MoreHorizontal,
} from 'lucide-react';
import { api } from './api';
import {
  freshInvoice,
  invoiceInput,
  money,
  displayDate,
  totals,
  emptyCompany,
  type Invoice,
  type SavedInvoice,
  type InvoiceSummary,
  type Profile,
  type Template,
  type User,
  type Company,
} from '../shared/model';
import { InvoiceEditor } from './InvoiceEditor';
import { Settings } from './Settings';
import { Admin } from './Admin';
import { ErrorBox, Modal, CompanyFields } from './ui';
import './legacy.css';

type Me = { user: User; profile: Profile; profileVersion: number };
export function LegacyWorkspace({
  me,
  templates,
  onProfile,
  onLogout,
}: {
  me: Me;
  templates: Template[];
  onProfile: (p: Profile, v: number) => void;
  onLogout: () => Promise<void>;
}) {
  const [page, setPage] = useState(
    new URLSearchParams(location.search).get('page') === 'admin' && me.user.role === 'admin'
      ? 'admin'
      : 'invoices',
  );
  const [rows, setRows] = useState<InvoiceSummary[]>([]),
    [editor, setEditor] = useState<Invoice | SavedInvoice | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('Všetky'),
    [year, setYear] = useState(''),
    [sort, setSort] = useState('Najnovšie'),
    [table, setTable] = useState(false),
    [trash, setTrash] = useState(false);
  const invoiceFlush = useRef<(() => Promise<boolean>) | null>(null),
    settingsFlush = useRef<(() => Promise<boolean>) | null>(null),
    openSequence = useRef(0);
  const status = (i: InvoiceSummary) =>
    Number(i.paid) >= Number(i.total)
      ? 'Uhradené'
      : i.dueDate < new Date().toLocaleDateString('sv-SE')
        ? 'Po splatnosti'
        : 'Neuhradené';
  const sorted = [...rows].sort((a, b) =>
    sort === 'Odberateľ'
      ? a.customer.localeCompare(b.customer)
      : sort === 'Splatnosť'
        ? a.dueDate.localeCompare(b.dueDate)
        : (b.issueDate ?? b.updated_at).localeCompare(a.issueDate ?? a.updated_at) ||
          b.number.localeCompare(a.number),
  );
  const visible = sorted.filter(
    (i) =>
      (i.number + ' ' + i.customer + ' ' + (i.searchText ?? ''))
        .toLocaleLowerCase('sk')
        .includes(query.toLocaleLowerCase('sk')) &&
      (!year || (i.issueDate ?? i.updated_at).startsWith(year)) &&
      (filter === 'Všetky' ||
        status(i) === filter ||
        (filter === 'Neuhradené' && status(i) !== 'Uhradené')),
  );
  async function load() {
    setLoading(true);
    try {
      let offset: number | null = 0,
        all: InvoiceSummary[] = [];
      do {
        const data: { items: InvoiceSummary[]; nextOffset: number | null } = await api<{
          items: InvoiceSummary[];
          nextOffset: number | null;
        }>(`/invoices?trash=${trash ? 1 : 0}&offset=${offset}`);
        all.push(...data.items);
        offset = data.nextOffset;
      } while (offset !== null);
      setRows(all);
      return all;
    } catch (e) {
      setError((e as Error).message);
      return [];
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load().then((all) => {
      if (!trash && all.length && !editor)
        void open(
          [...all].sort(
            (a, b) =>
              (b.issueDate ?? b.updated_at).localeCompare(a.issueDate ?? a.updated_at) ||
              b.number.localeCompare(a.number),
          )[0].id,
        );
    });
  }, [trash]);
  async function ready() {
    const flush = page === 'settings' ? settingsFlush : invoiceFlush;
    return !flush.current || (await flush.current());
  }
  async function open(id: string) {
    if (editor?.id === id) {
      setTable(false);
      return;
    }
    if (!(await ready())) return;
    const seq = ++openSequence.current;
    try {
      const invoice = await api<SavedInvoice>(`/invoices/${id}`);
      if (seq === openSequence.current) {
        setEditor(invoice);
        setTable(false);
        setError('');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function newInvoice(source?: Invoice | SavedInvoice) {
    if (!(await ready())) return;
    try {
      const t =
        templates.find((t) => t.id === (source?.templateID ?? me.profile.defaultTemplateID)) ??
        templates[0];
      if (!t) throw Error('Správca musí najprv priradiť šablónu.');
      const { number } = await api<{ number: string }>('/next-number');
      const fresh = freshInvoice(me.profile, number, t.id);
      setEditor(
        source
          ? {
              ...('templateSnapshot' in source ? invoiceInput(source) : source),
              id: fresh.id,
              version: 0,
              number,
              variableSymbol: fresh.variableSymbol,
              issueDate: fresh.issueDate,
              dueDate: fresh.dueDate,
              deliveryDate: null,
              paid: '0',
              nativeDates: undefined,
              templateID: t.id,
              items: source.items.map((i) => ({ ...i, id: crypto.randomUUID() })),
            }
          : fresh,
      );
      setPage('invoices');
      setTable(false);
      setQuery('');
      setFilter('Všetky');
      setYear('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove(i: InvoiceSummary | Invoice | SavedInvoice, restore = false) {
    if (!(await ready())) return;
    if (!restore && !confirm(`Vymazať faktúru ${i.number}?`)) return;
    try {
      // The editor may have just advanced its version during the flush.
      const current = await api<SavedInvoice>(`/invoices/${i.id}`);
      await api(`/invoices/${i.id}/trash`, {
        method: 'POST',
        body: JSON.stringify({ version: current.version, restore }),
      });
      if (editor?.id === i.id) setEditor(null);
      const all = await load();
      if (!trash && all.length) void open(all[0].id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function saved(i: SavedInvoice) {
    const summary: InvoiceSummary = {
      id: i.id,
      number: i.number,
      version: i.version,
      updated_at: i.updatedAt,
      customer: i.customer.name,
      paid: i.paid,
      total: totals(i).total,
      currency: i.currency,
      dueDate: i.dueDate,
      issueDate: i.issueDate,
      searchText: JSON.stringify([i.items, i.note, i.customer]),
      deleted_at: null,
    };
    setRows((rows) =>
      rows.some((r) => r.id === i.id)
        ? rows.map((r) => (r.id === i.id ? summary : r))
        : [summary, ...rows],
    );
  }
  async function navigate(next: string) {
    if (await ready()) {
      setPage(next);
      setError('');
    }
  }
  return (
    <div className="native-shell">
      <header className="native-header">
        <div className="native-brand">
          <img className="native-app-icon" src="/app-icon.png" alt="" />
          <div>
            <strong>INVOY</strong>
            <small>{me.profile.supplier.name || 'Moja firma'}</small>
          </div>
        </div>
        <details className="account-menu">
          <summary aria-label="Cloudový účet" title="Cloudový účet">
            <Cloud size={18} />
          </summary>
          <div>
            <strong>{me.user.name}</strong>
            <small>{me.user.email}</small>
            <span>Uložené vo vašom účte</span>
            {me.user.role === 'admin' && (
              <button onClick={() => void navigate('admin')}>Administrácia</button>
            )}
            <a href="/download/mac">Stiahnuť pre Mac</a>
            <button
              onClick={async () => {
                if (await ready()) await onLogout();
              }}
            >
              Odhlásiť sa
            </button>
          </div>
        </details>
        <nav className="native-segments">
          {[
            ['invoices', 'Faktúry', FileText],
            ['customers', 'Odberatelia', Building2],
            ['settings', 'Nastavenia', Settings2],
          ].map(([id, label, Icon]) => (
            <button
              key={String(id)}
              className={page === id ? 'active' : ''}
              onClick={() => void navigate(String(id))}
            >
              {typeof Icon !== 'string' && <Icon size={15} />} {String(label)}
            </button>
          ))}
        </nav>
      </header>
      <ErrorBox error={error} />
      <div className="native-invoices" style={{ display: page === 'invoices' ? 'flex' : 'none' }}>
        <div className="native-overview">
          <div>
            <strong>
              {rows.length} faktúr{trash ? ' v koši' : ''}
            </strong>
            <small>{rows.filter((i) => status(i) === 'Po splatnosti').length} po splatnosti</small>
          </div>
          <label className="native-search">
            <Search size={15} />
            <input
              aria-label="Hľadať vo faktúrach"
              placeholder="Hľadať vo faktúrach"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button className="button" onClick={() => void newInvoice()}>
            <Plus size={16} /> Nová faktúra
          </button>
        </div>
        <div className="native-filters">
          <div className="native-segments">
            {['Všetky', 'Uhradené', 'Neuhradené', 'Po splatnosti'].map((f) => (
              <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
          <select aria-label="Rok" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Všetky roky</option>
            {[...new Set(rows.map((i) => (i.issueDate ?? i.updated_at).slice(0, 4)))]
              .sort()
              .reverse()
              .map((y) => (
                <option key={y}>{y}</option>
              ))}
          </select>
          <span className="spacer" />
          <button
            title={trash ? 'Späť na faktúry' : 'Kôš'}
            aria-label={trash ? 'Späť na faktúry' : 'Kôš'}
            onClick={async () => {
              if (await ready()) {
                setTrash(!trash);
                setEditor(null);
              }
            }}
          >
            {trash ? <RotateCcw size={15} /> : <Trash2 size={15} />}
          </button>
          <div className="native-segments">
            <button
              className={!table ? 'active' : ''}
              aria-label="Zoznam s náhľadom"
              title="Zoznam s náhľadom"
              onClick={async () => {
                if (await ready()) setTable(false);
              }}
            >
              <LayoutList size={16} />
            </button>
            <button
              className={table ? 'active' : ''}
              aria-label="Tabuľkový zoznam"
              title="Tabuľkový zoznam"
              onClick={async () => {
                if (await ready()) setTable(true);
              }}
            >
              <Table2 size={16} />
            </button>
          </div>
        </div>
        <div className="native-split">
          <aside className={'native-invoice-list' + (table ? ' table-mode' : '')}>
            <div className="native-list-heading">
              <span>{visible.length} faktúr</span>
              <select aria-label="Zoradenie" value={sort} onChange={(e) => setSort(e.target.value)}>
                {['Najnovšie', 'Splatnosť', 'Odberateľ'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="native-list-scroll">
              {table ? (
                <table className="native-invoice-table">
                  <thead>
                    <tr>
                      <th>Číslo</th>
                      <th>Odberateľ</th>
                      <th>Stav</th>
                      <th>Suma</th>
                      <th>Vystavenie / splatnosť</th>
                      {trash && <th>Obnova</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((i) => (
                      <tr
                        key={i.id}
                        className={editor?.id === i.id ? 'selected' : ''}
                        onDoubleClick={() => !trash && void open(i.id)}
                      >
                        <td>
                          <button className="numeric" onClick={() => !trash && void open(i.id)}>
                            {i.number}
                          </button>
                        </td>
                        <td>{i.customer}</td>
                        <td>
                          <span
                            className={
                              'native-status ' +
                              (status(i) === 'Uhradené'
                                ? 'paid'
                                : status(i) === 'Po splatnosti'
                                  ? 'overdue'
                                  : 'unpaid')
                            }
                          >
                            {status(i) === 'Uhradené'
                              ? 'Uhradená'
                              : status(i) === 'Neuhradené'
                                ? 'Na úhradu'
                                : 'Po splatnosti'}
                          </span>
                        </td>
                        <td className="numeric">{money(i.total, i.currency)}</td>
                        <td className="numeric">
                          {displayDate(i.issueDate ?? i.dueDate)}
                          <small>{displayDate(i.dueDate)}</small>
                        </td>
                        {trash && (
                          <td>
                            <button title="Obnoviť" onClick={() => void remove(i, true)}>
                              <RotateCcw size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <>
                  {visible.map((i) => (
                    <div
                      key={i.id}
                      className={'native-invoice-row' + (editor?.id === i.id ? ' selected' : '')}
                    >
                      <button onClick={() => !trash && void open(i.id)}>
                        <div>
                          <b className="numeric">{i.number}</b>
                          <span
                            className={
                              'native-status ' +
                              (status(i) === 'Uhradené'
                                ? 'paid'
                                : status(i) === 'Po splatnosti'
                                  ? 'overdue'
                                  : 'unpaid')
                            }
                          >
                            {status(i) === 'Uhradené'
                              ? 'Uhradená'
                              : status(i) === 'Neuhradené'
                                ? 'Na úhradu'
                                : 'Po splatnosti'}
                          </span>
                          <small className="numeric">{displayDate(i.issueDate ?? i.dueDate)}</small>
                        </div>
                        <div>
                          <span className="row-customer">{i.customer}</span>
                          <b className="numeric">{money(i.total, i.currency)}</b>
                        </div>
                      </button>
                      {trash && (
                        <button
                          className="restore-button"
                          title="Obnoviť"
                          onClick={() => void remove(i, true)}
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
              {!visible.length && (
                <div className="native-empty">
                  {loading ? 'Načítavam faktúry…' : trash ? 'Kôš je prázdny' : 'Žiadne faktúry'}
                </div>
              )}
            </div>
          </aside>
          {!table && !trash && (
            <div className="native-detail">
              {editor ? (
                <InvoiceEditor
                  key={editor.id}
                  initial={editor}
                  accountID={me.user.id}
                  profile={me.profile}
                  templates={templates}
                  registerFlush={(f) => {
                    invoiceFlush.current = f;
                  }}
                  onSaved={saved}
                  onDuplicate={(source) => void newInvoice(source)}
                  onDelete={() => void remove(editor)}
                />
              ) : (
                <div className="native-empty">
                  <FileText size={40} />
                  <h2>Vyberte faktúru</h2>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {page === 'settings' && (
        <Settings
          initial={me.profile}
          version={me.profileVersion}
          templates={templates}
          onSaved={onProfile}
          accountID={me.user.id}
          registerFlush={(f) => {
            settingsFlush.current = f;
          }}
        />
      )}
      {page === 'customers' && (
        <Customers profile={me.profile} version={me.profileVersion} onSaved={onProfile} />
      )}
      {page === 'admin' && me.user.role === 'admin' && <Admin />}
    </div>
  );
}
function Customers({
  profile,
  version,
  onSaved,
}: {
  profile: Profile;
  version: number;
  onSaved: (p: Profile, v: number) => void;
}) {
  const [editing, setEditing] = useState<(Company & { id: string }) | null>(null),
    [error, setError] = useState('');
  async function save(customers: NonNullable<Profile['customers']>) {
    try {
      const next = { ...profile, customers };
      const result = await api<{ version: number }>('/profile', {
        method: 'PUT',
        body: JSON.stringify({ profile: next, version }),
      });
      onSaved(next, result.version);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="page native-customers">
      <div className="page-heading">
        <h1>Odberatelia</h1>
        <button
          className="button"
          onClick={() => setEditing({ ...emptyCompany(), id: crypto.randomUUID() })}
        >
          <Plus size={16} /> Nový odberateľ
        </button>
      </div>
      <ErrorBox error={error} />
      {profile.customers?.map((c) => (
        <div className="customer-row" key={c.id}>
          <Building2 size={22} />
          <div>
            <strong>{c.name}</strong>
            <small>
              {c.street}, {c.city} · {c.companyID}
            </small>
          </div>
          <button title="Upraviť odberateľa" onClick={() => setEditing(c)}>
            <MoreHorizontal size={18} />
          </button>
          <button
            title="Odstrániť odberateľa"
            onClick={() => {
              if (confirm('Odstrániť odberateľa? Existujúce faktúry sa nezmenia.'))
                void save(profile.customers!.filter((x) => x.id !== c.id));
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {editing && (
        <Modal title="Odberateľ" onClose={() => setEditing(null)}>
          <CompanyFields value={editing} onChange={(c) => setEditing({ ...c, id: editing.id })} />
          <button
            className="button"
            onClick={() =>
              void save([...(profile.customers ?? []).filter((c) => c.id !== editing.id), editing])
            }
          >
            Uložiť odberateľa
          </button>
        </Modal>
      )}
    </div>
  );
}
