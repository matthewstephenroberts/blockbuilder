/**
 * The file a save goes back to — remembered across saves, and across restarts.
 *
 * Choosing a folder and a name is the slowest part of saving, and a project is saved over and over
 * during one sitting. The browser's own picker forgets both between calls unless it is told which
 * conversation it is part of, so this holds the handle the user picked and writes straight back to
 * it next time; the dialog only reappears when there is nothing remembered, when permission has
 * lapsed, or when "save as" is asked for explicitly.
 *
 * Handles are kept in IndexedDB rather than localStorage because a FileSystemFileHandle is a live
 * object, not a string — structured-clone storage is the only place it survives a reload. The
 * NAME is kept alongside in localStorage as well, so even an engine with no File System Access API
 * (where the fallback is a plain download) at least suggests what you called it last time.
 */
const DB_NAME = "blockbuilder";
const STORE = "saveTargets";
const NAME_KEY = (key: string) => `blockbuilder.saveName.${key}`;
/**
 * Set once a `createWritable` has been refused by the platform.
 *
 * Some contexts hand out a working picker and then refuse the write — Electron and several
 * embedded webviews do, with NotAllowedError. In those the picker is worse than useless: it
 * creates the empty file, the write fails, and the save has to fall back anyway, leaving a
 * zero-byte file behind every single time. Once that has been seen, this session stops offering
 * the dialog at all and downloads directly, which fails no-one and leaves no stubs.
 */
let writableRefused = false;
const WRITABLE_KEY = "blockbuilder.canWriteFiles";

/**
 * Whether this platform will actually let a picked file be written, decided BEFORE any dialog is
 * opened.
 *
 * Learning it from a failed save is one dialog too late: the picker has already asked where to
 * save, the write is then refused, and the fallback download asks a second time — two "save as"
 * dialogs for one save, which is what a user sees as a duplicate save. The probe writes a scratch
 * file in the origin's private file system instead, which needs no dialog and no permission, and
 * fails the same way a refused platform fails. The answer is cached in localStorage, so the
 * question is asked once per machine rather than once per session.
 */
async function canWriteFiles(): Promise<boolean> {
  if (writableRefused) return false;
  try {
    const cached = localStorage.getItem(WRITABLE_KEY);
    if (cached === "yes") return true;
    if (cached === "no") {
      writableRefused = true;
      return false;
    }
  } catch {
    /* Storage blocked — probe anyway, just without remembering the answer. */
  }

  // Electron ships the picker but not writable streams, and that is exactly where this bites: the
  // dialog asks where to save, the write is refused, and the fallback download asks again. Named
  // outright rather than probed, because the probe below can't see it — the private file system is
  // writable there even while picked files are not.
  if (/\bElectron\//.test(navigator.userAgent)) {
    writableRefused = true;
    try {
      localStorage.setItem(WRITABLE_KEY, "no");
    } catch {
      /* In-memory flag still holds for this session. */
    }
    return false;
  }

  let ok = true;
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (root) {
      const probe = await root.getFileHandle("blockbuilder-write-probe", { create: true });
      const writable = await probe.createWritable();
      await writable.write(new Blob(["probe"]));
      await writable.close();
      await root.removeEntry("blockbuilder-write-probe").catch(() => {});
    }
    // No private file system to probe with: assume the picker works, which is the behaviour every
    // engine that has one has had. A failed write still falls back safely below.
  } catch (err) {
    console.warn("This platform refuses file writes; saving by download instead:", err);
    ok = false;
    writableRefused = true;
  }
  try {
    localStorage.setItem(WRITABLE_KEY, ok ? "yes" : "no");
  } catch {
    /* Nothing to do — the in-memory flag still holds for this session. */
  }
  return ok;
}

type Handle = FileSystemFileHandle & {
  queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
};

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function readHandle(key: string): Promise<Handle | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Handle) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function writeHandle(key: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** The name last saved under this key, for suggesting it again. */
export function rememberedName(key: string): string | null {
  try {
    return localStorage.getItem(NAME_KEY(key));
  } catch {
    return null;
  }
}

function rememberName(key: string, name: string) {
  try {
    localStorage.setItem(NAME_KEY(key), name);
  } catch {
    /* Private windows and blocked storage — the handle above is the part that matters. */
  }
}

/**
 * The remembered handle, if it is still usable. Permission is re-requested rather than assumed:
 * a handle survives a restart but its permission doesn't, and the request only succeeds inside the
 * user gesture that a save already is.
 */
async function usableHandle(key: string): Promise<Handle | null> {
  const handle = await readHandle(key);
  if (!handle) return null;
  try {
    if (!handle.queryPermission) return handle;
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return handle;
    if ((await handle.requestPermission?.({ mode: "readwrite" })) === "granted") return handle;
    return null;
  } catch {
    return null;
  }
}

export async function forgetSaveTarget(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
}

/** Writes the blob through a handle, all the way to a closed file. Throws if it can't. */
async function writeTo(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export interface SaveResult {
  /** What the file ended up being called — for telling the user where their work went. */
  name: string;
  /** True when it went to the folder they chose, rather than the browser's downloads folder. */
  toChosenFile: boolean;
}

/**
 * Saves `blob`, reusing the remembered file for `key` unless `saveAs` asks for the dialog.
 *
 * The picker is given `id: key`, which is what makes the browser reopen it in the folder used last
 * time even when the handle itself has been forgotten, and `startIn` the previous handle where
 * there is one.
 */
export async function saveBlob(
  blob: Blob,
  key: string,
  defaultName: string,
  saveAs = false,
): Promise<SaveResult> {
  if (blob.size === 0) throw new Error(`Refusing to save an empty ${defaultName}`);
  const picker = (
    window as {
      showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  // Asked before any dialog: a platform that won't write must not be allowed to open a picker,
  // or the user answers two "save as" dialogs for one save.
  if (picker && !(await canWriteFiles())) {
    return downloadFallback(blob, rememberedName(key) ?? defaultName, key);
  }

  if (!saveAs && picker) {
    const remembered = await usableHandle(key);
    if (remembered) {
      try {
        // Straight back to the same file, no dialog — this is the whole point of remembering it.
        await writeTo(remembered, blob);
        rememberName(key, remembered.name);
        return { name: remembered.name, toChosenFile: true };
      } catch (err) {
        // The remembered file has gone, moved, or the platform won't write: fall through to the
        // dialog rather than failing the save. Nothing was created, so nothing is left behind.
        console.warn("Couldn't write back to the remembered file; asking again:", err);
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          writableRefused = true;
          return downloadFallback(blob, rememberedName(key) ?? defaultName, key);
        }
        await forgetSaveTarget(key);
      }
    }
  }

  if (picker) {
    const suggested = rememberedName(key) ?? defaultName;
    const extension = suggested.includes(".") ? "." + suggested.split(".").pop() : "";
    let handle: FileSystemFileHandle;
    try {
      handle = await picker({
        id: key,
        startIn: (await readHandle(key)) ?? undefined,
        suggestedName: suggested,
        types: [
          {
            description: extension === ".json" ? "JSON File" : extension === ".stl" ? "STL File" : "File",
            accept: { [blob.type]: extension ? [extension] : [] },
          },
        ],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { name: suggested, toChosenFile: false };
      }
      console.warn("Save dialog unavailable, using the plain download instead:", err);
      return downloadFallback(blob, suggested, key);
    }

    try {
      // The picker has ALREADY created this file, empty. Only a completed write makes it a save —
      // anything short of that leaves a zero-byte file behind, which is why the fallback below
      // runs on failure and the empty file is removed where the engine allows it.
      await writeTo(handle, blob);
      await writeHandle(key, handle);
      rememberName(key, handle.name);
      return { name: handle.name, toChosenFile: true };
    } catch (err) {
      console.error("Writing the chosen file failed; falling back to the plain download:", err);
      // A platform that refuses writes will refuse every one of them — stop using the dialog.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        writableRefused = true;
        try {
          localStorage.setItem(WRITABLE_KEY, "no");
        } catch {
          /* In-memory flag still holds for this session. */
        }
      }
      try {
        await (handle as FileSystemFileHandle & { remove?: () => Promise<void> }).remove?.();
      } catch {
        /* No remove() on older engines: the empty file stays, and the download below holds the data. */
      }
      return downloadFallback(blob, handle.name, key);
    }
  }

  return downloadFallback(blob, rememberedName(key) ?? defaultName, key);
}

/** The plain anchor download — no folder to remember, but the NAME still is. */
function downloadFallback(blob: Blob, filename: string, key: string): SaveResult {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  rememberName(key, filename);
  return { name: filename, toChosenFile: false };
}
