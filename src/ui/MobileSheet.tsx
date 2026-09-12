import { useEffect, useRef, useState, type ReactNode } from 'react';
import './mobile-sheet.css';

const landscapeQuery = '(orientation: landscape) and (max-width: 1100px) and (max-height: 600px)';
export default function MobileSheet({ children, status }: { children: ReactNode; status: string }) {
  const [landscape, setLandscape] = useState(() => window.matchMedia(landscapeQuery).matches);
  const [dismissed, setDismissed] = useState(false);
  const [magnification, setMagnification] = useState(1);
  const [fit, setFit] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const active = landscape && !dismissed;
  useEffect(() => {
    const query = window.matchMedia(landscapeQuery);
    const change = () => {
      setLandscape(query.matches);
      setDismissed(false);
      setMagnification(1);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!active) return;
    const area = viewport.current!,
      sheet = canvas.current!;
    const resize = () => {
      const height = sheet.firstElementChild?.getBoundingClientRect().height;
      // offsetHeight remains in unzoomed CSS pixels.
      const naturalHeight = (sheet.firstElementChild as HTMLElement)?.offsetHeight;
      if (height && naturalHeight)
        setFit(Math.min(1, area.clientWidth / 1300, area.clientHeight / naturalHeight));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(area);
    observer.observe(sheet);
    resize();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setDismissed(true);
    };
    window.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', escape);
    };
  }, [active]);
  return (
    <section
      className={active ? 'mobile-sheet landscape-sheet' : 'mobile-sheet'}
      aria-label="Interactive character sheet"
    >
      {landscape && !active && (
        <button
          onClick={() => {
            setDismissed(false);
            setMagnification(1);
          }}
        >
          Open landscape sheet
        </button>
      )}
      {active && (
        <div className="landscape-controls">
          <button onClick={() => setDismissed(true)}>Back to app</button>
          <button
            aria-label="Zoom out sheet"
            disabled={magnification <= 1}
            onClick={() => setMagnification(Math.max(1, magnification - 0.5))}
          >
            −
          </button>
          <input
            aria-label="Sheet zoom"
            type="range"
            min="1"
            max="4"
            step="0.1"
            value={magnification}
            onChange={(event) => setMagnification(Number(event.target.value))}
          />
          <button
            aria-label="Zoom in sheet"
            disabled={magnification >= 4}
            onClick={() => setMagnification(Math.min(4, magnification + 0.5))}
          >
            +
          </button>
          <button
            onClick={() => {
              setMagnification(1);
              viewport.current?.scrollTo(0, 0);
            }}
          >
            Fit
          </button>
          <span role="status">{status}</span>
        </div>
      )}
      <div
        ref={viewport}
        className="sheet-viewport"
        tabIndex={active ? 0 : undefined}
        aria-label={active ? 'Scrollable sheet; pinch or use zoom controls to enlarge' : undefined}
      >
        <div
          ref={canvas}
          className="sheet-canvas"
          style={active ? { zoom: fit * magnification } : undefined}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
