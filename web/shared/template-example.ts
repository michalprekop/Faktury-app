import { emptyCompany, type SavedInvoice, type TemplateConfig } from './model';

/** Isolated, deterministic sample. Never read a profile or save this as an invoice. */
export function templateExample(config: TemplateConfig): SavedInvoice {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    version: 0,
    number: '2026001',
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    deliveryDate: null,
    supplier: {
      ...emptyCompany(),
      name: 'Ukážkové štúdio',
      street: 'Ukážková 12',
      postalCode: '811 01',
      city: 'Bratislava',
      country: '',
      email: 'studio@example.com',
      website: 'example.com',
    },
    customer: {
      ...emptyCompany(),
      name: 'Ukážkový odberateľ',
      street: 'Vzorová 8',
      postalCode: '010 01',
      city: 'Žilina',
      country: '',
    },
    account: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Ukážkový účet',
      iban: 'SK9611000000002918599669',
      swift: 'TATRSKBX',
      holderName: 'Ukážkové štúdio',
    },
    items: [
      { name: 'Grafický návrh a vizuálna identita', quantity: '1', unit: 'ks', unitPrice: '1180' },
    ].map((item, index) => ({
      ...item,
      id: `00000000-0000-4000-8000-00000000000${index + 3}`,
      detail: '',
      discount: '0',
      vatRate: '0',
    })),
    currency: 'EUR',
    paid: '0',
    variableSymbol: '2026001',
    constantSymbol: '',
    specificSymbol: '',
    paymentMethod: 'Bankový prevod',
    note: 'Ďakujeme za spoluprácu. Ukážková faktúra.',
    issuedBy: 'Alex Novák',
    logo: '',
    signature: '',
    templateID: 'template-preview',
    qrFormat: 'automatic',
    templateSnapshot: structuredClone(config),
    templateName: 'Ukážka šablóny',
    updatedAt: '2026-10-01T12:00:00.000Z',
  };
}
