// Capture the install event at app startup: the account page is loaded later.
export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let pendingInstall: InstallEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  pendingInstall = event as InstallEvent;
  changed();
});

window.addEventListener('appinstalled', () => {
  pendingInstall = null;
  changed();
});

export function getInstallPrompt() {
  return pendingInstall;
}

export function onInstallPromptChange(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function installApp() {
  const event = pendingInstall;
  if (!event) return;
  pendingInstall = null;
  changed();
  await event.prompt();
  await event.userChoice;
}
