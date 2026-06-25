// Ambient fallbacks so typecheck passes before `npm install` is run for
// docx / exceljs / pptxgenjs. Once those packages are installed, their bundled
// .d.ts files take precedence (node_modules resolution beats ambient).
declare module 'docx'
declare module 'exceljs'
declare module 'pptxgenjs'
