// Gestisce l'apertura del Side Panel al click sull'icona
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("GMem Error [Setup]:", error));
});

// Ascolta i messaggi dal Side Panel per gestire il download con selezione del percorso
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "triggerContextDownload") {
    // Converte il testo in un Data URL sicuro codificato in Base64
    const base64Content = btoa(unescape(encodeURIComponent(message.content)));
    const dataUrl = "data:text/plain;charset=utf-8;base64," + base64Content;

    chrome.downloads.download(
      {
        url: dataUrl,
        filename: message.filename,
        saveAs: true, // 🔥 FORZA L'APERTURA DELLA FINESTRA "SALVA CON NOME" DI WINDOWS/MAC
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error(
            "GMem Download Error:",
            chrome.runtime.lastError.message,
          );
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message,
          });
        } else {
          console.log("GMem Download avviato con successo. ID:", downloadId);
          sendResponse({ success: true, id: downloadId });
        }
      },
    );
    return true; // Mantiene il canale asincrono aperto per la risposta
  }
});
