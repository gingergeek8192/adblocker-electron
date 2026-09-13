import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { app } from 'electron';
import { parse } from 'tldts-experimental';
import { FiltersEngine, Request, fetchResources } from '@ghostery/adblocker';

const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;

const LIST_URLS = [
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/easylist/easylist.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/easylist/easyprivacy.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/peter-lowe/serverlist.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/badware.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/filters-2020.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/filters-2021.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/filters-2022.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/filters-2023.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/filters-2024.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/filters.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/privacy.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/quick-fixes.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/resource-abuse.txt',
  'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/unbreak.txt',
];

export class ElectronBlocker extends FiltersEngine {
  constructor(...args) {
    super(...args);
    this.webContents = null;
  }

  static _dir() {
    return join(app.getPath('userData'), 'filterList');
  }

  static async _fetchAndSave(fetchImpl) {
    const dir = ElectronBlocker._dir();
    await mkdir(dir, { recursive: true });
    const texts = await Promise.all(
      LIST_URLS.map(async (url) => {
        const res = await fetchImpl(url);
        const text = await res.text();
        await writeFile(join(dir, basename(url)), text);
        return text;
      })
    );
    const resources = await fetchResources(fetchImpl);
    await writeFile(join(dir, 'resources.json'), resources);
    await writeFile(join(dir, 'lastUpdate'), Date.now().toString());
    return { texts, resources };
  }

  static async _isStale() {
    try {
      const ts = await readFile(join(ElectronBlocker._dir(), 'lastUpdate'), 'utf8');
      return (Date.now() - parseInt(ts)) > FOUR_DAYS;
    } catch {
      return true;
    }
  }

  static async _loadFromDisk() {
    const dir = ElectronBlocker._dir();
    const texts = await Promise.all(
      LIST_URLS.map((url) => readFile(join(dir, basename(url)), 'utf8'))
    );
    const resources = await readFile(join(dir, 'resources.json'), 'utf8');
    return { texts, resources };
  }

  static _buildEngine({ texts, resources }) {
    const engine = ElectronBlocker.parse(texts.join('\n'));
    engine.updateResources(resources, '' + resources.length);
    return engine;
  }

  static async fromUpdated(fetchImpl = fetch) {
    let data;
    let stale = await ElectronBlocker._isStale();
    if (!stale) {
      try {
        data = await ElectronBlocker._loadFromDisk();
        console.log('[adblocker] loaded from disk');
      } catch {
        stale = true;
      }
    }
    if (stale) {
      console.log('[adblocker] fetching lists');
      data = await ElectronBlocker._fetchAndSave(fetchImpl);
    }
    const engine = ElectronBlocker._buildEngine(data);
    engine._scheduleUpdates(fetchImpl);
    return engine;
  }

  _scheduleUpdates(fetchImpl) {
    const check = async () => {
      console.log('[adblocker] updating lists');
      const data = await ElectronBlocker._fetchAndSave(fetchImpl);
      const fresh = ElectronBlocker._buildEngine(data);
      Object.assign(this, fresh);
      console.log('[adblocker] engine swapped');
      this._updateTimer = setTimeout(check, FOUR_DAYS);
    };
    this._updateTimer = setTimeout(check, FOUR_DAYS);
  }

  gard(url) {
    const { match } = this.match(Request.fromRawDetails({ url }));
    return match === true;
  }

  async addCosmetics(sessionId = null) {
    if (!this.webContents) return;
    const url = this.webContents.getURL();
    if (!url) return;
    const { hostname, domain } = parse(url);
    const { active, styles, scripts } = this.getCosmeticsFilters({
      url,
      hostname: hostname || '',
      domain: domain || '',
      getBaseRules: true,
      getInjectionRules: true,
      getExtendedRules: false,
      getRulesFromHostname: true,
      getRulesFromDOM: false,
    });
    if (!active) return;
    if (styles.length > 0) {
      await this.webContents.debugger
        .sendCommand('Runtime.evaluate', { expression: `(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(styles)};document.head.appendChild(s)})()` }, sessionId)
        .catch(() => {});
    }
    for (const script of scripts) {
      await this.webContents.debugger
        .sendCommand('Runtime.evaluate', { expression: script }, sessionId)
        .catch(() => {});
    }
  }
}

export * from '@ghostery/adblocker';
