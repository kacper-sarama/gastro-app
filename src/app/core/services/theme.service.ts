import { Injectable, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';

export type AppTheme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'gastro_theme';
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private document = inject(DOCUMENT);

  // Reaktywny sygnał przechowujący aktualny motyw
  readonly theme = signal<AppTheme>(this.getInitialTheme());

  constructor() {
    if (this.isBrowser) {
      // Reaguj na zmiany sygnału motywu
      effect(() => {
        const currentTheme = this.theme();
        this.applyTheme(currentTheme);
        localStorage.setItem(this.STORAGE_KEY, currentTheme);
      });

      // Nasłuchuj na zmiany motywu w systemie operacyjnym, gdy użytkownik nie wybrał ręcznie
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (!saved) {
          this.theme.set(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  toggleTheme(): void {
    this.theme.update(current => current === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
  }

  get isDarkMode(): boolean {
    return this.theme() === 'dark';
  }

  private getInitialTheme(): AppTheme {
    if (!this.isBrowser) {
      return 'dark';
    }

    try {
      const savedTheme = localStorage.getItem(this.STORAGE_KEY) as AppTheme | null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }

      // Best UX: Odczyt preferencji systemu operacyjnego użytkownika
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  }

  private applyTheme(theme: AppTheme): void {
    if (!this.isBrowser) return;

    const root = this.document.documentElement;
    const body = this.document.body;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      if (body) {
        body.classList.add('dark');
      }
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      if (body) {
        body.classList.remove('dark');
      }
    }
  }
}
