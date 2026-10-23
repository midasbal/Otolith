/*
  The reader's choice of theme, applied before the first paint.

  With no choice the page follows the system (see tokens.css) and this
  does nothing. With one, it sets data-theme on the root, which overrides
  the system either way. It runs inline in the head, before any
  stylesheet has painted, so a reader who chose dark on a light system
  never sees a flash of the other theme.
*/
export const THEME_KEY = "otolith:theme";

// Wrapped in a function so that it leaves nothing behind on the page's global scope.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})()`;
