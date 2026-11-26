// Photo library dialog for the admin product editor: pick photos already on the server, or upload new ones.
// A new photo is cropped to the shop's 4:5 portrait shape first (drag the frame, zoom with the slider);
// the server does the actual cropping, resizing and clean-up (see Services/ProductImageStore.cs).
import { useEffect, useRef, useState } from 'react';
import { AdminError, imageUrl, type AdminApi, type AdminState, type LibraryImage } from './api';
import { Icon } from './fields';

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

/** Largest 4:5 portrait frame that fits the photo, scaled by `zoom` (1 = as large as possible), centred on cx/cy. */
function frameFor(imageW: number, imageH: number, zoom: number, cx: number, cy: number): Crop {
  const maxW = Math.min(1, ((imageH * 4) / 5) / imageW);
  const width = maxW * zoom;
  const height = (width * imageW * 5) / 4 / imageH;
  const x = Math.min(Math.max(cx - width / 2, 0), 1 - width);
  const y = Math.min(Math.max(cy - height / 2, 0), 1 - height);
  return { x, y, width, height };
}

function Cropper({
  file,
  position,
  busy,
  onUpload,
  onSkip,
}: {
  file: File;
  position: string;
  busy: boolean;
  onUpload: (crop: Crop | null) => void;
  onSkip: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState({ x: 0.5, y: 0.5 });
  const drag = useRef<{ startX: number; startY: number; cx: number; cy: number } | null>(null);

  // Draw a scaled-down copy on a canvas (works with the site's strict image security policy,
  // and the browser turns phone photos the right way up).
  useEffect(() => {
    let cancelled = false;
    setSize(null);
    setPreviewFailed(false);
    setZoom(1);
    setCentre({ x: 0.5, y: 0.5 });
    createImageBitmap(file)
      .then((bitmap) => {
        if (cancelled) return bitmap.close();
        const canvas = canvasRef.current;
        if (!canvas) return bitmap.close();
        const scale = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        setSize({ w: bitmap.width, h: bitmap.height });
        bitmap.close();
      })
      .catch(() => !cancelled && setPreviewFailed(true));
    return () => {
      cancelled = true;
    };
  }, [file]);

  const frame = size ? frameFor(size.w, size.h, zoom, centre.x, centre.y) : null;

  const move = (dx: number, dy: number) => {
    if (!frame) return;
    setCentre({
      x: Math.min(Math.max(frame.x + frame.width / 2 + dx, frame.width / 2), 1 - frame.width / 2),
      y: Math.min(Math.max(frame.y + frame.height / 2 + dy, frame.height / 2), 1 - frame.height / 2),
    });
  };

  return (
    <div className="pa-cropper">
      <h3>
        Crop the photo <small>{position}</small>
      </h3>
      <p className="pa-hint">
        Product photos are shown in a tall 4:5 shape. Drag the frame to choose what to keep, and use the slider to zoom in.
      </p>
      {previewFailed ? (
        <p className="notice notice-muted">
          <Icon id="info" />
          <span>This photo can't be previewed here (common for iPhone HEIC files). We'll keep the middle of it.</span>
        </p>
      ) : (
        <div className="pa-crop-stage" ref={stageRef}>
          <canvas ref={canvasRef} aria-label={`Preview of ${file.name}`} role="img" />
          {frame && (
            <div
              className="pa-crop-frame"
              role="slider"
              tabIndex={0}
              aria-label="Part of the photo to keep. Use the arrow keys to move it."
              aria-valuetext={`${Math.round(frame.x * 100)}% from the left, ${Math.round(frame.y * 100)}% from the top`}
              aria-valuenow={Math.round(frame.y * 100)}
              style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.width * 100}%`, height: `${frame.height * 100}%` }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { startX: e.clientX, startY: e.clientY, cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2 };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                const stage = stageRef.current;
                if (!d || !stage) return;
                const r = stage.getBoundingClientRect();
                setCentre({ x: d.cx + (e.clientX - d.startX) / r.width, y: d.cy + (e.clientY - d.startY) / r.height });
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.02;
                if (e.key === 'ArrowLeft') move(-step, 0);
                else if (e.key === 'ArrowRight') move(step, 0);
                else if (e.key === 'ArrowUp') move(0, -step);
                else if (e.key === 'ArrowDown') move(0, step);
                else return;
                e.preventDefault();
              }}
            />
          )}
          {!size && <p className="pa-crop-loading">Opening the photo…</p>}
        </div>
      )}
      {frame && (
        <label className="pa-range">
          <span>Zoom</span>
          <input type="range" min={0.3} max={1} step={0.01} value={1.3 - zoom} onChange={(e) => setZoom(1.3 - Number(e.target.value))} />
        </label>
      )}
      <div className="pa-row">
        <button type="button" className="button" disabled={busy || (!size && !previewFailed)} onClick={() => onUpload(frame)}>
          {busy ? 'Uploading…' : 'Upload this photo'}
        </button>
        <button type="button" className="button button-ghost" disabled={busy} onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function PhotoLibrary({
  api,
  images,
  selected,
  nameHint,
  maxUploadBytes,
  onState,
  onToggle,
  onUploaded,
  onClose,
}: {
  api: AdminApi;
  images: LibraryImage[];
  /** Photos already on the product being edited. */
  selected: string[];
  /** Used to name uploaded files (the product name). */
  nameHint: string;
  maxUploadBytes: number;
  onState: (state: AdminState) => void;
  onToggle: (file: string) => void;
  onUploaded: (file: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'unused'>('all');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const current = queue[0];
  const next = () => setQueue((q) => q.slice(1));

  const choose = (files: FileList | null) => {
    if (!files?.length) return;
    const ok: File[] = [];
    const tooBig: File[] = [];
    for (const f of Array.from(files)) (f.size > maxUploadBytes ? tooBig : ok).push(f);
    setMessage(tooBig.length ? { kind: 'error', text: `Too large (over 20 MB), skipped: ${tooBig.map((f) => f.name).join(', ')}` } : null);
    setQueue(ok);
    setTotal(ok.length);
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async (crop: Crop | null) => {
    if (!current) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.upload(current, nameHint || current.name.replace(/\.[^.]+$/, ''), crop);
      onState(result.state);
      onUploaded(result.file);
      setMessage({ kind: 'ok', text: result.warning ? `Photo added. ${result.warning}` : 'Photo added to this product.' });
      next();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof AdminError ? err.message : 'The upload failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (image: LibraryImage) => {
    if (!window.confirm('Delete this photo from the server? This cannot be undone.')) return;
    setBusy(true);
    setMessage(null);
    try {
      onState(await api.deleteImage(image.file));
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof AdminError ? err.message : 'Could not delete the photo.' });
    } finally {
      setBusy(false);
    }
  };

  const shown = filter === 'unused' ? images.filter((i) => i.usedBy.length === 0) : images;

  return (
    <dialog ref={dialogRef} className="pa-dialog" aria-labelledby="pa-library-title" onClose={onClose}>
      <header className="pa-dialog-head">
        <h2 id="pa-library-title">Photos</h2>
        <button type="button" className="icon-button" onClick={() => dialogRef.current?.close()} aria-label="Close photos">
          <Icon id="close" />
        </button>
      </header>

      <div className="pa-dialog-body">
        {message && (
          <p className={message.kind === 'error' ? 'form-message' : 'pa-ok'} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}

        {current ? (
          <Cropper
            file={current}
            position={total > 1 ? `Photo ${total - queue.length + 1} of ${total}` : ''}
            busy={busy}
            onUpload={upload}
            onSkip={next}
          />
        ) : (
          <>
            <div className="pa-row pa-library-bar">
              <button type="button" className="button" onClick={() => inputRef.current?.click()}>
                <Icon id="plus" /> Upload new photos
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={(e) => choose(e.target.files)}
                aria-label="Choose photos to upload"
              />
              <label className="pa-inline">
                <span>Show</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'unused')}>
                  <option value="all">All photos ({images.length})</option>
                  <option value="unused">Not used yet ({images.filter((i) => i.usedBy.length === 0).length})</option>
                </select>
              </label>
            </div>
            <p className="pa-hint">
              Tap a photo to add it to this product, or tap it again to take it off. JPG, PNG, WebP or iPhone HEIC, up to 20 MB each.
            </p>
            {shown.length === 0 ? (
              <p className="pa-empty">No photos here yet. Upload your first one.</p>
            ) : (
              <ul className="pa-library">
                {shown.map((image) => {
                  const isSelected = selected.includes(image.file);
                  return (
                    <li key={image.file} className={isSelected ? 'is-selected' : undefined}>
                      <button type="button" className="pa-library-pick" aria-pressed={isSelected} onClick={() => onToggle(image.file)}>
                        <img src={imageUrl(image.file)} alt={`Photo ${image.file}`} width={160} height={200} loading="lazy" />
                        {isSelected && (
                          <span className="pa-library-tick">
                            <Icon id="check" /> On this product
                          </span>
                        )}
                      </button>
                      <p className="pa-library-meta">{image.usedBy.length ? `Used by ${image.usedBy.join(', ')}` : 'Not used yet'}</p>
                      {image.canDelete && image.usedBy.length === 0 && !isSelected && (
                        <button type="button" className="text-button pa-danger" disabled={busy} onClick={() => remove(image)}>
                          <Icon id="trash" /> Delete
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {!current && (
        <footer className="pa-dialog-foot">
          <button type="button" className="button" onClick={() => dialogRef.current?.close()}>
            Done
          </button>
        </footer>
      )}
    </dialog>
  );
}
