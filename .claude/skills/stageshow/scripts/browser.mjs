export async function launch() {
  let chromium
  try {
    ;({ chromium } = await import('playwright-core'))
  } catch {
    console.error('Filming needs playwright-core: run `npm i -D playwright-core` (or pnpm/yarn) in this project, then try again.')
    process.exit(2)
  }
  const path = process.env.CHROME_PATH
  try {
    return await chromium.launch(path ? { executablePath: path } : { channel: 'chrome' })
  } catch {
    console.error(`Couldn't start Chrome${path ? ` at ${path}` : ''}. Install Google Chrome, or set CHROME_PATH to a Chrome or Chromium binary.`)
    process.exit(2)
  }
}
