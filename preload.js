const { contextBridge, ipcRenderer } = require('electron');

// レンダラープロセスに公開するAPIを定義
contextBridge.exposeInMainWorld('electronAPI', {
    windowControls: {
      minimize: () => ipcRenderer.send('window:minimize', 'main'),
      maximize: () => ipcRenderer.send('window:maximize', 'main'),
      close: () => ipcRenderer.send('window:close', 'main')
    },
    moveWindow: (deltaX, deltaY) => ipcRenderer.send('window:move', { deltaX, deltaY })
});
