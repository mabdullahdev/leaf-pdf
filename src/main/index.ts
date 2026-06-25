import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { IpcChannels, type OpenFilesOptions, type SaveFileOptions, type ReadFileResult } from '../shared/ipc'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function openPdfDialog(): Promise<{ path: string; name: string; bytes: Uint8Array } | null> {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return loadPdf(result.filePaths[0])
}

async function loadPdf(path: string): Promise<{ path: string; name: string; bytes: Uint8Array }> {
  const buf = await readFile(path)
  return { path, name: basename(path), bytes: new Uint8Array(buf) }
}

async function showSavePdfDialog(defaultName: string): Promise<string | null> {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

async function writePdf(path: string, bytes: Uint8Array): Promise<{ path: string }> {
  await writeFile(path, Buffer.from(bytes))
  return { path }
}

async function showOpenFilesDialog(opts: OpenFilesOptions): Promise<string[] | null> {
  if (!mainWindow) return null
  const props: ('openFile' | 'multiSelections')[] = ['openFile']
  if (opts.multi) props.push('multiSelections')
  const result = await dialog.showOpenDialog(mainWindow, {
    title: opts.title ?? 'Open',
    filters: opts.filters ?? [{ name: 'All Files', extensions: ['*'] }],
    properties: props
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths
}

async function showOpenDirectoryDialog(title?: string): Promise<string | null> {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title ?? 'Choose folder',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

async function showSaveFileDialog(opts: SaveFileOptions): Promise<string | null> {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: opts.title ?? 'Save',
    defaultPath: opts.defaultName,
    filters: opts.filters
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

async function readArbitraryFile(path: string): Promise<ReadFileResult> {
  const buf = await readFile(path)
  return { path, name: basename(path), bytes: new Uint8Array(buf) }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const }
          ]
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open')
        },
        {
          label: 'Close Document',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow?.webContents.send('menu:close')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu:save-as')
        },
        { type: 'separator' },
        isMac
          ? { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', role: 'close' }
          : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Find',
      submenu: [
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow?.webContents.send('menu:find')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => mainWindow?.webContents.send('menu:zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow?.webContents.send('menu:zoom-out') },
        { label: 'Fit Width', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.webContents.send('menu:fit-width') },
        { label: 'Fit Page', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.send('menu:fit-page') },
        { type: 'separator' },
        { label: 'Toggle Dark Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => mainWindow?.webContents.send('menu:toggle-dark') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  ipcMain.handle(IpcChannels.openFile, () => openPdfDialog())
  ipcMain.handle(IpcChannels.openFilePath, (_e, path: string) => loadPdf(path))
  ipcMain.handle(IpcChannels.showSaveDialog, (_e, defaultName: string) => showSavePdfDialog(defaultName))
  ipcMain.handle(IpcChannels.writeFile, (_e, path: string, bytes: Uint8Array) => writePdf(path, bytes))
  ipcMain.handle(IpcChannels.closeWindow, () => mainWindow?.close())
  ipcMain.handle(IpcChannels.showOpenFilesDialog, (_e, opts: OpenFilesOptions) => showOpenFilesDialog(opts))
  ipcMain.handle(IpcChannels.showOpenDirectoryDialog, (_e, title?: string) => showOpenDirectoryDialog(title))
  ipcMain.handle(IpcChannels.showSaveFileDialog, (_e, opts: SaveFileOptions) => showSaveFileDialog(opts))
  ipcMain.handle(IpcChannels.readFile, (_e, path: string) => readArbitraryFile(path))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
