// Server component. Renders a tiny synchronous script in <body> (or wherever
// the layout drops it) that sets the `dark` class on <html> *before* React
// hydrates — so the page never flashes the wrong theme.
//
// dangerouslySetInnerHTML is the React-blessed way to emit raw script content
// from JSX, and is server-rendered as a real <script> the browser actually
// executes. This avoids the React 19 "Encountered a script tag while rendering
// React component" warning that next-themes' inline JSX <script> triggers.

const SCRIPT = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement.classList;if(d)c.add('dark');else c.remove('dark');}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
