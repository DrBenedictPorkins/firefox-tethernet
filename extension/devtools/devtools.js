/**
 * Tethernet DevTools Script
 * Registers the Tethernet panel in Firefox DevTools
 */

browser.devtools.panels.create(
  'Tethernet',
  'icons/icon-32.png',
  'devtools/panel.html'
).then((panel) => {
  console.log('[Tethernet] DevTools panel created');
}).catch((error) => {
  console.error('[Tethernet] Failed to create DevTools panel:', error);
});
