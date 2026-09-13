# @ghostery/adblocker-electron

Electron adblocker wrapper. The blocker does **not** own the `onBeforeRequest` handler — you wire it up yourself and call `gard(url)`. Cosmetics are injected via CDP debugger. Filter lists are fetched and rebuilt automatically every 4 days.

## API

### `ElectronBlocker.fromUpdated(fetch)` → `Promise<ElectronBlocker>`

Loads the engine from Ghostery's CDN and schedules an automatic rebuild every 4 days. The running engine is swapped atomically when new lists are available.

```js
const blocker = await ElectronBlocker.fromUpdated(fetch)
```

---

### `blocker.gard(url)` → `boolean`

Returns `true` if the URL should be blocked. Call inside your own `onBeforeRequest` handler.

```js
session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, async (details, cb) => {
  if (details.url && blocker.gard(details.url)) return cb({ cancel: true })
  cb({})
})
```

---

### `blocker.webContents`

Set this before calling `addCosmetics`.

---

### `blocker.addCosmetics(sessionId?)` → `Promise<void>`

Resolves cosmetic filters for `webContents.getURL()` and injects styles and scriptlets via `debugger.sendCommand('Runtime.evaluate', ...)`. Pass `sessionId` for iframes.

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

## License

[Mozilla Public License 2.0](./LICENSE)
