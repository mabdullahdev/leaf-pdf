import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannels,
  type LoadedPdf,
  type WriteFileResult,
  type OpenFilesOptions,
  type SaveFileOptions,
  type ReadFileResult
} from '../shared/ipc'

type MenuEvent =
  | 'open'
  | 'close'
  | 'save'
  | 'save-as'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-width'
  | 'fit-page'
  | 'toggle-dark'
  | 'find'

const api = {
  platform: process.platform,
  versions: process.versions,
  openFile: (): Promise<LoadedPdf | null> => ipcRenderer.invoke(IpcChannels.openFile),
  openFilePath: (path: string): Promise<LoadedPdf> => ipcRenderer.invoke(IpcChannels.openFilePath, path),
  showSaveDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.showSaveDialog, defaultName),
  writeFile: (path: string, bytes: Uint8Array): Promise<WriteFileResult> =>
    ipcRenderer.invoke(IpcChannels.writeFile, path, bytes),
  closeWindow: (): Promise<void> => ipcRenderer.invoke(IpcChannels.closeWindow),
  showOpenFilesDialog: (opts: OpenFilesOptions): Promise<string[] | null> =>
    ipcRenderer.invoke(IpcChannels.showOpenFilesDialog, opts),
  showOpenDirectoryDialog: (title?: string): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.showOpenDirectoryDialog, title),
  showSaveFileDialog: (opts: SaveFileOptions): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.showSaveFileDialog, opts),
  readFile: (path: string): Promise<ReadFileResult> => ipcRenderer.invoke(IpcChannels.readFile, path),
  onMenu: (handler: (event: MenuEvent) => void): (() => void) => {
    const events: MenuEvent[] = [
      'open',
      'close',
      'save',
      'save-as',
      'zoom-in',
      'zoom-out',
      'fit-width',
      'fit-page',
      'toggle-dark',
      'find'
    ]
    const listeners = events.map((e) => {
      const fn = (): void => handler(e)
      ipcRenderer.on(`menu:${e}`, fn)
      return [e, fn] as const
    })
    return () => listeners.forEach(([e, fn]) => ipcRenderer.removeListener(`menu:${e}`, fn))
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
export type { MenuEvent }
