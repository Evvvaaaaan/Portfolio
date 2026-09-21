const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('spatialDesktop', {
  setupStatus: () => ipcRenderer.invoke('spatial:setup-status'),
  startSetup: () => ipcRenderer.invoke('spatial:setup-start'),
  onSetupUpdate: (listener) => { const handler = (_, status) => listener(status); ipcRenderer.on('spatial:setup-update', handler); return () => ipcRenderer.removeListener('spatial:setup-update', handler) },
})
