// preload.js — Provides secure context isolation for the renderer process.
// BlockBuilder doesn't need special IPC features, so this is minimal.
const { contextBridge } = require("electron");

// Expose a safe API object if needed in the future
contextBridge.exposeInMainWorld("electron", {
  version: require("electron").app.getVersion?.() || "unknown",
});
