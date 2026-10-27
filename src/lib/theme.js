// The theme choice: 'system' follows the operating system's setting through
// CSS (tailwind.config.js), and 'light' or 'dark' override it with a class on
// <html>. Only an explicit choice sets a class, so 'system' keeps following
// the setting when it changes, at sunset for example.

const KEY = 'theme';
const EXPLICIT = ['light', 'dark'];

// The saved choice, or 'system'. Storage can be blocked, so reads may throw.
export function readTheme(storage) {
  try {
    const choice = storage.getItem(KEY);
    return EXPLICIT.includes(choice) ? choice : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(storage, choice) {
  try {
    if (EXPLICIT.includes(choice)) storage.setItem(KEY, choice);
    else storage.removeItem(KEY);
  } catch {
    // Not remembered; the choice still applies to this page.
  }
}

export function applyTheme(root, choice) {
  for (const theme of EXPLICIT) root.classList.toggle(theme, theme === choice);
}

// Runs in <head> before the page draws, so a saved choice doesn't flash the
// other theme first. Plain ES5 with no imports, since it's inlined as text.
export const themeScript = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.classList.add(t)}catch(e){}`;
