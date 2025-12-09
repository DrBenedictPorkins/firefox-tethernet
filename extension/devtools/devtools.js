/**
 * FoxHole DevTools Script
 * Registers the FoxHole panel in Firefox DevTools
 */

browser.devtools.panels.create(
  'FoxHole',
  'icons/icon-32.png',
  'devtools/panel.html'
).then((panel) => {
  console.log('[FoxHole] DevTools panel created');
}).catch((error) => {
  console.error('[FoxHole] Failed to create DevTools panel:', error);
});
