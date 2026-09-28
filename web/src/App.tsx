import { useEffect, useState } from 'react';
import {
  FileText,
  Settings2,
  ShieldCheck,
  LogOut,
  Plus,
  Search,
  ArrowUpRight,
  Cloud,
  Download,
  Check,
  LayoutTemplate,
  Trash2,
  Copy,
  RotateCcw,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { api, setCSRF } from './api';
import {
  freshInvoice,
  invoiceInput,
  money,
  displayDate,
  type User,
  type Profile,
  type Invoice,
  type SavedInvoice,
  type Template,
  type InvoiceSummary,
} from '../shared/model';
import { InvoiceEditor } from './InvoiceEditor';
import { Settings } from './Settings';
import { Admin } from './Admin';
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
    [page, setPage] = useState('invoices'),
    [editor, setEditor] = useState<Invoice | SavedInvoice | null>(null),
    [revision, setRevision] = useState(0),
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
  function navigate(next: string) {
    if (canLeave()) {
      setEditor(null);
      setPage(next);
      setError('');
    }
  }
  async function logout() {
    if (!canLeave()) return;
    try {
      await api('/logout', { method: 'POST', body: '{}' });
      setCSRF('');
      setEditor(null);
      setTemplates([]);
      setMe(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function newInvoice() {
    setError('');
    try {
      if (!templates.length) throw new Error('Správca vám najprv musí priradiť šablónu.');
      if (!me!.profile.supplier.name) {
        setPage('settings');
        throw new Error('Najprv vyplňte údaje svojej firmy.');
      }
      const { number } = await api<{ number: string }>('/next-number');
      const t = templates.find((t) => t.id === me!.profile.defaultTemplateID) ?? templates[0];
      setEditor(freshInvoice(me!.profile, number, t.id));
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
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace">
          <div className="avatar">
            {(me.profile.supplier.name || me.user.name || 'F').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{me.profile.supplier.name || 'Moja firma'}</strong>
            <small>Súkromný pracovný priestor</small>
          </div>
        </div>
        <span className="nav-label">PRACOVNÝ PRIESTOR</span>
        <nav>
          <button
            className={page === 'invoices' ? 'active' : ''}
            onClick={() => navigate('invoices')}
          >
            <FileText size={19} />
            Faktúry
            <ChevronRight size={15} />
          </button>
          <button
            className={page === 'templates' ? 'active' : ''}
            onClick={() => navigate('templates')}
          >
            <LayoutTemplate size={19} />
            Moje šablóny
          </button>
          <button
            className={page === 'settings' ? 'active' : ''}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} />
            Nastavenia
          </button>
          {me.user.role === 'admin' && (
            <>
              <span className="nav-label">SPRÁVA PRODUKTU</span>
              <button
                className={page === 'admin' ? 'active' : ''}
                onClick={() => navigate('admin')}
              >
                <ShieldCheck size={19} />
                Administrácia
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="cloud-note">
            <Cloud size={19} />
            <div>
              <strong>Všetko pod vaším účtom</strong>
              <small>Prístup aj z nového počítača.</small>
            </div>
          </div>
          {config?.macAvailable && (
            <a className="download-link" href="/download/mac">
              <Download size={16} />
              Stiahnuť pre Mac
              <ArrowUpRight size={14} />
            </a>
          )}
          <div className="user-bar">
            <div>
              <strong>{me.user.name || 'Apple účet'}</strong>
              <small title={me.user.email}>{me.user.email}</small>
            </div>
            <button
              className="icon-button"
              title="Odhlásiť sa"
              aria-label="Odhlásiť sa"
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Pracovný priestor <ChevronRight size={13} />
            <b>
              {editor
                ? 'Faktúra'
                : {
                    invoices: 'Faktúry',
                    settings: 'Nastavenia',
                    templates: 'Moje šablóny',
                    admin: 'Administrácia',
                  }[page]}
            </b>
          </span>
          <span className="private-indicator">
            <span />
            Súkromný účet
          </span>
        </header>
        <ErrorBox error={error} />
        {editor ? (
          <InvoiceEditor
            key={editor.id}
            initial={editor}
            profile={me.profile}
            templates={templates}
            onBack={() => setEditor(null)}
            onSaved={() => setRevision((r) => r + 1)}
          />
        ) : page === 'invoices' ? (
          <Invoices
            revision={revision}
            onNew={() => void newInvoice()}
            onOpen={async (id) => {
              try {
                setEditor(await api<SavedInvoice>(`/invoices/${id}`));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
            onDuplicate={async (id) => {
              try {
                const source = await api<SavedInvoice>(`/invoices/${id}`);
                const { number } = await api<{ number: string }>('/next-number');
                const current = templates.find((t) => t.id === source.templateID) ?? templates[0];
                if (!current) throw new Error('Správca vám musí priradiť šablónu.');
                const fresh = freshInvoice(me.profile, number, current.id);
                setEditor({
                  ...invoiceInput(source),
                  id: fresh.id,
                  version: 0,
                  number,
                  variableSymbol: fresh.variableSymbol,
                  issueDate: fresh.issueDate,
                  dueDate: fresh.dueDate,
                  deliveryDate: null,
                  paid: '0',
                  templateID: current.id,
                  items: source.items.map((i) => ({ ...i, id: crypto.randomUUID() })),
                });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        ) : page === 'settings' ? (
          <Settings
            initial={me.profile}
            version={me.profileVersion}
            templates={templates}
            onSaved={(profile, profileVersion) => setMe({ ...me, profile, profileVersion })}
          />
        ) : page === 'admin' ? (
          <Admin />
        ) : (
          <div className="page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">Váš podpis na každej faktúre</span>
                <h1>Moje šablóny</h1>
                <p>Dizajny priradené k vášmu účtu.</p>
              </div>
            </div>
            <div className="template-grid">
              {templates.map((t) => (
                <div key={t.id} className="template-card">
                  <div
                    className={'template-thumbnail ' + t.config.layout}
                    style={{ borderTopColor: t.config.accent }}
                  >
                    {t.config.logo ? (
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
                    <small>
                      {me.profile.defaultTemplateID === t.id
                        ? 'Predvolená šablóna'
                        : 'Dostupná vo vašom účte'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            {!templates.length && (
              <div className="empty-state">
                <LayoutTemplate size={32} />
                <h2>Zatiaľ bez šablóny</h2>
                <p>Správca vám môže priradiť štandardnú alebo vlastnú šablónu.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>
        <FileText size={22} strokeWidth={1.7} />
      </span>
      <strong>
        Faktúry<span className="brand-dot">.</span>
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
              <a className="button apple-button" href="/auth/apple">
                <span aria-hidden="true"></span>Pokračovať s Apple
              </a>
            ) : (
              <>
                <button className="button apple-button" disabled>
                  <span aria-hidden="true"></span>Prihlásenie pripravujeme
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
        Faktúry · Súkromný pracovný priestor · <a href="/privacy.html">Ochrana údajov</a>
        <span>Údaje účtu a faktúry sa ukladajú na Cloudflare.</span>
      </footer>
    </div>
  );
}
function Invoices({
  revision,
  onNew,
  onOpen,
  onDuplicate,
}: {
  revision: number;
  onNew: () => void;
  onOpen: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
}) {
  const [items, setItems] = useState<InvoiceSummary[]>([]),
    [next, setNext] = useState<number | null>(null),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(''),
    [trash, setTrash] = useState(false),
    [filter, setFilter] = useState('all'),
    [error, setError] = useState('');
  async function load(offset = 0) {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ items: InvoiceSummary[]; nextOffset: number | null }>(
        `/invoices?trash=${trash ? 1 : 0}&offset=${offset}`,
      );
      setItems((old) => (offset ? [...old, ...result.items] : result.items));
      setNext(result.nextOffset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [revision, trash]);
  const status = (i: InvoiceSummary) =>
    Number(i.paid) >= Number(i.total)
      ? 'paid'
      : i.dueDate < new Date().toLocaleDateString('sv-SE')
        ? 'overdue'
        : 'unpaid';
  const filtered = items.filter(
    (i) =>
      (i.customer + ' ' + i.number).toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' || status(i) === filter),
  );
  const paid = items.filter((i) => status(i) === 'paid').length,
    overdue = items.filter((i) => status(i) === 'overdue').length;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Menej administratívy. Viac vašej práce.</span>
          <h1>{trash ? 'Kôš' : 'Faktúry'}</h1>
          <p>Všetky vaše faktúry na jednom mieste.</p>
        </div>
        <button className="button" onClick={onNew}>
          <Plus size={17} />
          Nová faktúra
        </button>
      </div>
      <div className="stats">
        <div>
          <span>Faktúry v zozname</span>
          <strong>
            {items.length}
            {next !== null ? '+' : ''}
          </strong>
          <small>V tomto pracovnom priestore</small>
        </div>
        <div>
          <span>Uhradené</span>
          <strong>
            {paid}
            <i className="green-dot" />
          </strong>
          <small>V načítanom zozname</small>
        </div>
        <div>
          <span>Po splatnosti</span>
          <strong>
            {overdue}
            <i className="amber-dot" />
          </strong>
          <small>V načítanom zozname</small>
        </div>
      </div>
      <div className="list-toolbar">
        <div className="tabs">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            Všetky
          </button>
          <button
            className={filter === 'unpaid' ? 'active' : ''}
            onClick={() => setFilter('unpaid')}
          >
            Na úhradu
          </button>
          <button className={filter === 'paid' ? 'active' : ''} onClick={() => setFilter('paid')}>
            Uhradené
          </button>
          <button
            className={filter === 'overdue' ? 'active' : ''}
            onClick={() => setFilter('overdue')}
          >
            Po splatnosti
          </button>
        </div>
        <div className="list-tools">
          <label className="search">
            <Search size={16} />
            <input
              placeholder="Hľadať faktúru…"
              aria-label="Hľadať faktúru"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className={'icon-button ' + (trash ? 'selected' : '')}
            title={trash ? 'Späť na faktúry' : 'Kôš'}
            aria-label={trash ? 'Späť na faktúry' : 'Kôš'}
            onClick={() => setTrash(!trash)}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="panel table-panel">
        <table className="data-table invoice-table">
          <thead>
            <tr>
              <th>Faktúra</th>
              <th>Odberateľ</th>
              <th>Splatnosť</th>
              <th>Stav</th>
              <th className="right">Celkom</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td>
                  <button
                    className="invoice-link"
                    disabled={trash}
                    onClick={() => void onOpen(i.id)}
                  >
                    <span className="doc-icon">
                      <FileText size={18} />
                    </span>
                    <b>{i.number}</b>
                  </button>
                </td>
                <td>{i.customer}</td>
                <td className="numeric">{displayDate(i.dueDate)}</td>
                <td>
                  <span className={'badge ' + status(i)}>
                    {status(i) === 'paid'
                      ? 'Uhradená'
                      : status(i) === 'overdue'
                        ? 'Po splatnosti'
                        : 'Na úhradu'}
                  </span>
                </td>
                <td className="right numeric strong">{money(i.total, i.currency)}</td>
                <td>
                  <div className="row-actions">
                    {!trash && (
                      <button
                        className="icon-button"
                        title="Duplikovať"
                        aria-label={`Duplikovať ${i.number}`}
                        onClick={() => void onDuplicate(i.id)}
                      >
                        <Copy size={15} />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      title={trash ? 'Obnoviť' : 'Presunúť do koša'}
                      aria-label={`${trash ? 'Obnoviť' : 'Vymazať'} ${i.number}`}
                      onClick={async () => {
                        if (!trash && !confirm(`Presunúť faktúru ${i.number} do koša?`)) return;
                        try {
                          await api(`/invoices/${i.id}/trash`, {
                            method: 'POST',
                            body: JSON.stringify({ version: i.version, restore: trash }),
                          });
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {trash ? <RotateCcw size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-state">
            <FileText size={32} />
            <h2>
              {loading
                ? 'Načítavam faktúry…'
                : query
                  ? 'Nič sa nenašlo'
                  : trash
                    ? 'Kôš je prázdny'
                    : 'Priestor pre vašu prvú faktúru'}
            </h2>
            <p>
              {query
                ? 'Skúste iné číslo alebo meno odberateľa.'
                : trash
                  ? 'Odstránené faktúry sa dajú obnoviť.'
                  : 'Vyplňte firemné údaje a vytvorte prvý dokument.'}
            </p>
            {!trash && !query && !loading && (
              <button className="button secondary" onClick={onNew}>
                <Plus size={16} />
                Vytvoriť faktúru
              </button>
            )}
          </div>
        )}
      </div>
      {next !== null && (
        <button
          className="button secondary load-more"
          disabled={loading}
          onClick={() => void load(next)}
        >
          <ChevronDown size={16} />
          Načítať ďalšie
        </button>
      )}
      <div className="list-footer">
        <span>{filtered.length} zobrazených faktúr</span>
        <span>
          <Cloud size={14} />
          Uložené vo vašom účte
        </span>
      </div>
    </div>
  );
}
