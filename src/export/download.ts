export async function downloadBlob(blob: Blob, filename: string) {
  // Try using File System Access API first (shows save dialog)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: filename.endsWith('.json') ? 'JSON File' : filename.endsWith('.stl') ? 'STL File' : 'File',
            accept: { [blob.type]: [filename.split('.').pop() ? '.' + filename.split('.').pop() : ''] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled - don't fall back, just return
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      // Other errors - log and fall back to default download
      console.warn('File System Access API failed, using default download:', err);
    }
  }

  // Fallback: use traditional download method
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mimeType = "application/json") {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}
