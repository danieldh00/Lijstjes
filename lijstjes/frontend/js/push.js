import api from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function isSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function getPermissionState() {
  return isSupported() ? Notification.permission : 'unsupported';
}

// Vraagt toestemming (moet vanuit een klik komen, browsers negeren een
// ongevraagde aanroep) en registreert het toestel bij de backend zodat
// wijzigingen die rechtstreeks in Home Assistant gemaakt worden ook als
// melding binnenkomen zonder dat de app open hoeft te staan.
async function enablePush() {
  if (!isSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { publicKey } = await api.pushVapidKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await api.pushSubscribe(subscription.toJSON());
  return true;
}

export { isSupported, getPermissionState, enablePush };
