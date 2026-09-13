# Adblocker

Efficient, minimal Electron adblocker — uBlock Origin and Easylist compatible.

A fork of [@ghostery/adblocker](https://github.com/ghostery/adblocker) refactored so the blocker does **not** own the `onBeforeRequest` handler. You wire up your own request handler and call the blocker's methods directly. Cosmetics are injected via CDP debugger. Filter lists are managed and updated automatically every 4 days.

## Install

```json
"dependencies": {
"adblocker-electron": "github:gingergeek8192/adblocker-electron#master&path:/packages/adblocker-electron"
}
```

```
pnpm install
```

## Usage

### Load the blocker

```js
import { ElectronBlocker } from 'adblocker-electron'

const blocker = await ElectronBlocker.fromUpdated(fetch)
```

Fetches all filter lists, builds the engine, and schedules an automatic rebuild every 4 days. The running engine is swapped atomically — no restart required.

### Network blocking — you own the handler

```js
session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, async (details, cb) => {
  if (details.url && blocker.gard(details.url)) return cb({ cancel: true })
  cb({})
})
```

`gard(url)` returns `true` if the URL should be blocked, `false` otherwise.

### Cosmetics — injected via CDP

```js
blocker.webContents = webContents

await blocker.addCosmetics()

webContents.debugger.on('message', async (_, method, params) => {
  if (method === 'Target.attachedToTarget') {
    const { sessionId } = params
    if (sessionId) await blocker.addCosmetics(sessionId)
  }
  if (method === 'Target.targetInfoChanged') await blocker.addCosmetics()
})
```

`addCosmetics(sessionId?)` reads `blocker.webContents.getURL()`, resolves the matching cosmetic filters, and injects styles and scriptlets via `debugger.sendCommand('Runtime.evaluate', ...)`.

## License

[Mozilla Public License 2.0](./LICENSE)
