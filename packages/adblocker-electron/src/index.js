import { parse } from 'tldts-experimental';
import { FiltersEngine, Request } from '@ghostery/adblocker';

const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;

export class ElectronBlocker extends FiltersEngine {
  constructor(...args) {
    super(...args);
    this.webContents = null;
  }

  static async fromUpdated(fetchImpl = fetch) {
    const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetchImpl);
    engine._scheduleUpdates(fetchImpl);
    return engine;
  }

  _scheduleUpdates(fetchImpl) {
    const check = async () => {
      const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetchImpl);
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
