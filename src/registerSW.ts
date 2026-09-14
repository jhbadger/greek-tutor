// Standard SW lifecycle wiring per the offline-first-pwa rules: skipWaiting +
// clients.claim() happen unconditionally in sw.ts, so controllerchange fires
// on every activation -- including the very first one, when nothing has
// actually "updated" yet. We gate the refresh banner on whether this page
// already had a controller before registering, so first-ever installs stay
// silent and only genuine updates prompt a reload.
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    let shown = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || shown) return;
      shown = true;
      showUpdateBanner();
    });

    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  });
}

function showUpdateBanner(): void {
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.innerHTML = `<span>New version available</span><button>Refresh</button>`;
  banner.querySelector('button')!.addEventListener('click', () => location.reload());
  document.body.appendChild(banner);
}
