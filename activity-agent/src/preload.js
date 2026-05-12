const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('retainiq', {
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  start: () => ipcRenderer.invoke('agent:start'),
  break: () => ipcRenderer.invoke('agent:break'),
  resume: () => ipcRenderer.invoke('agent:resume'),
  end: () => ipcRenderer.invoke('agent:end'),
  getState: () => ipcRenderer.invoke('agent:get-state'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('agent:state', listener);
    return () => ipcRenderer.removeListener('agent:state', listener);
  },
});
