const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronBridge', {
  callAI: (msg) => ipcRenderer.invoke('call-ai', msg),
  openAI: () => ipcRenderer.invoke('open-ai')
});
