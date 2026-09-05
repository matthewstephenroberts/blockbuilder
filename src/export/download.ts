import { saveBlob } from "./saveTarget";

/**
 * Saving a file. Everything goes through saveTarget's remembered handle, so a second save of the
 * same thing goes back to the same file rather than asking again — see that module for why the
 * write, not the dialog, is what counts as a save.
 */
export async function downloadBlob(blob: Blob, filename: string, key = filename, saveAs = false) {
  return saveBlob(blob, key, filename, saveAs);
}

export function downloadText(text: string, filename: string, mimeType = "application/json", key = filename, saveAs = false) {
  return downloadBlob(new Blob([text], { type: mimeType }), filename, key, saveAs);
}
