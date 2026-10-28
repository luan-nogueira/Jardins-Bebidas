"use client";

import { useEffect } from "react";

export function PwaRegistry() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Ocasionalmente tentar atualizar o service worker
          reg.update();
        })
        .catch((err) => console.error("Erro ao registrar Service Worker", err));
    }
  }, []);

  return null;
}
