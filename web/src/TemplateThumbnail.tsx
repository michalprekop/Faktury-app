import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, ImageOff } from 'lucide-react';
import type { TemplateConfig } from '../shared/model';
import { templateExample } from '../shared/template-example';

// Render visible cards one at a time, reuse images across tab changes and admin refreshes.
const previews = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
function previewFor(key: string): Promise<string> {
  const cached = previews.get(key);
  if (cached) return cached;
  const task = queue.then(async () => {
    const { renderInvoiceThumbnail } = await import('./InvoicePDF');
    return renderInvoiceThumbnail(templateExample(JSON.parse(key) as TemplateConfig));
  });
  previews.set(key, task);
  if (previews.size > 32) previews.delete(previews.keys().next().value!);
  queue = task.catch(() => {
    previews.delete(key);
  });
  return task;
}

export function TemplateThumbnail({ config, name }: { config: TemplateConfig; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState({ key: '', image: '', failed: false });
  const key = JSON.stringify(config);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // Also used in the editor: wait for a short pause while a color or text is changing.
    const timer = window.setTimeout(() => {
      void previewFor(key).then(
        (image) => {
          if (!cancelled) setResult({ key, image, failed: false });
        },
        () => {
          if (!cancelled) setResult({ key, image: '', failed: true });
        },
      );
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, visible]);
  const image = result.key === key ? result.image : '';
  const failed = result.key === key && result.failed;
  return (
    <div className="template-invoice-preview" ref={host} aria-busy={!image && !failed}>
      {image ? (
        <img
          src={image}
          alt={`Ukážková faktúra — ${name || 'Nová šablóna'}`}
          width={800}
          height={1131}
        />
      ) : (
        <span className="template-preview-status">
          {failed ? (
            <ImageOff size={22} aria-hidden="true" />
          ) : (
            <LoaderCircle size={22} aria-hidden="true" />
          )}
          {failed ? 'Náhľad sa nepodarilo načítať.' : 'Pripravujem náhľad…'}
        </span>
      )}
    </div>
  );
}
