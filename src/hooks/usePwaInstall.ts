import { useEffect, useState } from "react";

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaInstallState {
  canInstall: boolean;
  installed: boolean;
  isIos: boolean;
  install: () => Promise<boolean>;
}

function detectsStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function usePwaInstall(): PwaInstallState {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setInstalled(detectsStandalone());
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncInstalled = () => setInstalled(detectsStandalone());
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    displayMode.addEventListener("change", syncInstalled);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      displayMode.removeEventListener("change", syncInstalled);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  async function install(): Promise<boolean> {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    const accepted = choice.outcome === "accepted";
    if (accepted) {
      setInstalled(true);
      setPromptEvent(null);
    }
    return accepted;
  }

  return { canInstall: promptEvent !== null, installed, isIos, install };
}