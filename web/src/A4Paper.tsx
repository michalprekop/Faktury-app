import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Keep the invoice layout at 800px and fit the whole page uniformly to its viewport. */
export function A4Paper({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const resize = () => {
      if (element.clientWidth > 0) setScale(element.clientWidth / 800);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={frame}
      className="invoice-a4-frame"
      style={{ '--paper-scale': scale } as CSSProperties}
    >
      {children}
    </div>
  );
}
