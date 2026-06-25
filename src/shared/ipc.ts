export const IpcChannels = {
  openFile: 'file:open',
  openFilePath: 'file:open-path',
  showSaveDialog: 'file:show-save-dialog',
  writeFile: 'file:write',
  closeWindow: 'window:close',
  // Generic file dialogs used by the Convert features.
  showOpenFilesDialog: 'file:show-open-files-dialog',
  showOpenDirectoryDialog: 'file:show-open-directory-dialog',
  showSaveFileDialog: 'file:show-save-file-dialog',
  readFile: 'file:read'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export type LoadedPdf = {
  path: string
  name: string
  bytes: Uint8Array
}

export type WriteFileResult = {
  path: string
}

export type FileFilter = { name: string; extensions: string[] }

export type OpenFilesOptions = {
  title?: string
  filters?: FileFilter[]
  multi?: boolean
}

export type SaveFileOptions = {
  title?: string
  defaultName: string
  filters?: FileFilter[]
}

export type ReadFileResult = {
  path: string
  name: string
  bytes: Uint8Array
}
