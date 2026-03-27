const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
    sendConvertRequest: (data) => ipcRenderer.invoke('audio:convert', data),
    cancelConvertRequest: () => ipcRenderer.invoke('audio:cancel'),
    selectInputFiles: () => ipcRenderer.invoke('dialog:select-audio-files'),
    selectOutputDirectory: () => ipcRenderer.invoke('dialog:select-output-dir'),
    openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
    getPathForFile: (file) => {
        if (webUtils && typeof webUtils.getPathForFile === 'function') {
            return webUtils.getPathForFile(file);
        }

        return typeof file?.path === 'string' ? file.path : '';
    },
    onProgress: (callback) => {
        const fileListener = (_event, payload) => callback({ type: 'file', payload });
        const batchListener = (_event, payload) => callback({ type: 'batch', payload });

        ipcRenderer.on('audio:progress:file', fileListener);
        ipcRenderer.on('audio:progress:batch', batchListener);

        return () => {
            ipcRenderer.removeListener('audio:progress:file', fileListener);
            ipcRenderer.removeListener('audio:progress:batch', batchListener);
        };
    },
    onFinished: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('audio:convert:completed', listener);
        return () => ipcRenderer.removeListener('audio:convert:completed', listener);
    },
});
