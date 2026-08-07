import { useEffect, useMemo, useState } from "react";
import { CatalogEntry, CATALOG } from "../model/catalog";
import { renderCatalogThumbnail } from "../model/catalogRenderer";
import { GridState } from "../model/grid";
import ConfirmDialog from "./ConfirmDialog";
import { triggerHomeAnimation } from "./GeometryViewport";

interface Props {
  onLoad: (grid: GridState) => void;
}

export default function CatalogPanel({ onLoad }: Props) {
  const [pending, setPending] = useState<CatalogEntry | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  // Built once, not per-render — each entry's grid feeds its thumbnail render below.
  const previews = useMemo(() => CATALOG.map((entry) => ({ entry, grid: entry.build() })), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const { entry, grid } of previews) {
        const url = await renderCatalogThumbnail(grid);
        if (cancelled) return;
        setThumbnails((prev) => ({ ...prev, [entry.id]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previews]);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Catalog</h2>
      </div>
      <p className="muted sm">
        Load a ready-made Technic part onto the grid as a starting point — this replaces whatever's
        currently on the canvas, so save first if you want to keep it.
      </p>
      <div className="catalog-grid">
        {previews.map(({ entry }) => (
          <button
            key={entry.id}
            className="catalog-item"
            title={`${entry.name} — ${entry.description}`}
            onClick={() => setPending(entry)}
          >
            {thumbnails[entry.id] ? (
              <img className="catalog-item-thumb" src={thumbnails[entry.id]} alt={entry.name} />
            ) : (
              <div className="catalog-item-thumb catalog-item-thumb-loading" />
            )}
            <span className="catalog-item-label">{entry.name}</span>
          </button>
        ))}
      </div>
      {pending && (
        <ConfirmDialog
          title={`Load "${pending.name}"?`}
          message="This replaces the current project on the grid."
          confirmLabel="Load"
          onConfirm={() => {
            onLoad(pending.build());
            // Delay home animation to allow geometry rebuild to complete (150ms debounce + buffer)
            setTimeout(() => triggerHomeAnimation(), 200);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
