// Keep native connection errors visible even when ArkWeb subsequently ends loading its error page.
export class PageLoadState {
  url: string;
  failed: boolean = false;
  loading: boolean = false;
  constructor(initialURL: string) { this.url = initialURL; }
  begin(url: string): void { this.url = url; this.failed = false; this.loading = true; }
  fail(url: string): boolean {
    if (!this.loading || this.url !== url) return false;
    this.failed = true; this.loading = false; return true;
  }
  finish(url: string): boolean {
    if (this.failed || this.url !== url) return false;
    this.loading = false; return true;
  }
}
