import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, readTheme, saveTheme, themeScript } from '../theme';

const root = document.documentElement;

afterEach(() => {
  localStorage.clear();
  root.className = '';
});

describe('readTheme', () => {
  it('returns the saved choice', () => {
    localStorage.setItem('theme', 'dark');
    expect(readTheme(localStorage)).toBe('dark');
  });

  it('falls back to system for nothing saved, an unknown value, or storage that throws', () => {
    expect(readTheme(localStorage)).toBe('system');
    localStorage.setItem('theme', 'sepia');
    expect(readTheme(localStorage)).toBe('system');
    const blocked = {
      getItem() {
        throw new Error('blocked');
      },
    };
    expect(readTheme(blocked)).toBe('system');
  });
});

describe('saveTheme', () => {
  it('saves light or dark, and forgets the choice for system', () => {
    saveTheme(localStorage, 'light');
    expect(localStorage.getItem('theme')).toBe('light');
    saveTheme(localStorage, 'system');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('ignores storage that throws', () => {
    const blocked = {
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(() => saveTheme(blocked, 'dark')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('sets a class only for an explicit choice, so system keeps following the setting', () => {
    applyTheme(root, 'dark');
    expect(root.className).toBe('dark');
    applyTheme(root, 'light');
    expect(root.className).toBe('light');
    applyTheme(root, 'system');
    expect(root.className).toBe('');
  });
});

describe('themeScript', () => {
  it('applies the saved choice before the page draws', () => {
    localStorage.setItem('theme', 'dark');
    new Function(themeScript)();
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('leaves the page alone for system or an unknown value', () => {
    localStorage.setItem('theme', 'sepia');
    new Function(themeScript)();
    expect(root.className).toBe('');
  });
});
