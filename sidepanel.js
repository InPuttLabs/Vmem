document.addEventListener("DOMContentLoaded", () => {
  const dropZone = document.getElementById("drop-zone");
  const folderSelector = document.getElementById("folder-selector");
  const projectList = document.getElementById("project-list");
  const clearAllBtn = document.getElementById("clear-all-storage");

  refreshSavedProjects();

  dropZone.addEventListener("click", () => {
    folderSelector.click();
  });

  // FUNZIONE DI SUPPORTO: Converte le regole di .gitignore in Espressioni Regolari (RegExp)
  function compileGitignoreRules(gitignoreText) {
    if (!gitignoreText) return [];

    return (
      gitignoreText
        .split(/\r?\n/)
        .map((line) => line.trim())
        // Salta righe vuote e commenti
        .filter((line) => line && !line.startsWith("#"))
        .map((pattern) => {
          let p = pattern;
          if (p.startsWith("/")) p = p.substring(1);

          let regexString = p
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
            .replace(/\\\*/g, ".*");

          if (p.endsWith("/") || !p.includes(".")) {
            regexString += "($|\\/)";
          }

          return new RegExp(regexString);
        })
    );
  }

  // FUNZIONE DI SUPPORTO: Controlla se un percorso file corrisponde a una delle regole RegExp
  function isIgnoredByRules(path, rules) {
    return rules.some((rule) => rule.test(path));
  }

  // GESTIONE INPUT TRAMITE CLIC / SFOGLIA CARTELLE
  folderSelector.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const firstFilePath = files[0].webkitRelativePath || "";
    const pathParts = firstFilePath.split("/");
    const rootFolderName =
      pathParts.length > 0 && pathParts[0] !== ""
        ? pathParts[0]
        : "workspace_indefinito";
    const projName = rootFolderName.replace(/\s+/g, "_");

    let gitignoreContent = "";
    for (let file of files) {
      const path = file.webkitRelativePath || file.name;
      if (path.endsWith(".gitignore")) {
        gitignoreContent = await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = (event) => res(event.target.result);
          reader.readAsText(file);
        });
        break;
      }
    }

    const gitignoreRules = compileGitignoreRules(gitignoreContent);
    let extractedFiles = [];

    for (let file of files) {
      const path = file.webkitRelativePath || file.name;

      if (
        path.includes("node_modules/") ||
        path.includes(".git/") ||
        path.includes("dist/") ||
        path.includes("build/")
      ) {
        continue;
      }

      if (isIgnoredByRules(path, gitignoreRules)) {
        continue;
      }

      if (
        /\.(png|jpg|jpeg|gif|ico|webp|mp4|zip|tar|gz|pdf|exe|dll|env)$/i.test(
          path,
        )
      ) {
        continue;
      }

      if (file.size > 1024 * 1024) continue;

      const content = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = (event) => res(event.target.result);
        reader.readAsText(file);
      });

      extractedFiles.push({ path: path, content: content });
    }

    if (extractedFiles.length === 0) {
      alert("Nessun file testuale valido trovato.");
      folderSelector.value = "";
      return;
    }

    await saveWorkspaceToStorage(projName, extractedFiles);
    folderSelector.value = "";
  });

  // GESTIONE DRAG & DROP
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
  });
  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    const firstEntry = items[0].webkitGetAsEntry();
    if (!firstEntry) return;

    const projName = firstEntry.name.replace(/\s+/g, "_");
    let extractedFiles = [];

    let gitignoreContent = "";
    for (let item of items) {
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry();
        if (entry && entry.isDirectory) {
          gitignoreContent = await findGitignoreInDirectory(entry);
          if (gitignoreContent) break;
        }
      }
    }

    const gitignoreRules = compileGitignoreRules(gitignoreContent);

    for (let item of items) {
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          await deepParseEntry(entry, "", extractedFiles, gitignoreRules);
        }
      }
    }

    if (extractedFiles.length === 0) {
      alert("Nessun file testuale valido trovato o cartella vuota.");
      return;
    }

    await saveWorkspaceToStorage(projName, extractedFiles);
  });

  async function findGitignoreInDirectory(dirEntry) {
    const dirReader = dirEntry.createReader();
    const entries = await new Promise((res) => dirReader.readEntries(res));
    const gitignoreEntry = entries.find(
      (e) => e.isFile && e.name === ".gitignore",
    );

    if (gitignoreEntry) {
      const file = await new Promise((res) => gitignoreEntry.file(res));
      return await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = (e) => res(e.target.result);
        reader.readAsText(file);
      });
    }
    return "";
  }

  async function deepParseEntry(entry, currentPath, fileArray, gitignoreRules) {
    const path = currentPath ? `${currentPath}/${entry.name}` : entry.name;

    if (isIgnoredByRules(path, gitignoreRules)) {
      return;
    }

    if (entry.isFile) {
      if (
        /\.(png|jpg|jpeg|gif|ico|webp|mp4|zip|tar|gz|pdf|exe|dll|env)$/i.test(
          entry.name,
        )
      ) {
        return;
      }

      const file = await new Promise((res) => entry.file(res));
      if (file.size > 1024 * 1024) return;

      const content = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = (e) => res(e.target.result);
        reader.readAsText(file);
      });

      fileArray.push({ path: path, content: content });
    } else if (entry.isDirectory) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "dist" ||
        entry.name === "build"
      ) {
        return;
      }

      const dirReader = entry.createReader();

      const readAllEntries = async () => {
        let allEntries = [];
        let results = await new Promise((res) => dirReader.readEntries(res));
        while (results.length > 0) {
          allEntries = allEntries.concat(results);
          results = await new Promise((res) => dirReader.readEntries(res));
        }
        return allEntries;
      };

      const entries = await readAllEntries();
      for (let childEntry of entries) {
        await deepParseEntry(childEntry, path, fileArray, gitignoreRules);
      }
    }
  }

  async function saveWorkspaceToStorage(projName, newFiles) {
    const storageKey = `vmem_proj_${projName}`;
    chrome.storage.local.get([storageKey], (result) => {
      let existingData = result[storageKey] || { name: projName, files: [] };

      newFiles.forEach((newFile) => {
        const idx = existingData.files.findIndex(
          (f) => f.path === newFile.path,
        );
        if (idx > -1) existingData.files[idx] = newFile;
        else existingData.files.push(newFile);
      });

      chrome.storage.local.set({ [storageKey]: existingData }, () => {
        console.log(`VMem: Progetto [${projName}] archiviato.`);
        refreshSavedProjects();
        alert(
          `Progetto "${projName}" salvato con successo! (Filtri .gitignore applicati)`,
        );
      });
    });
  }

  function refreshSavedProjects() {
    projectList.innerHTML = "";
    chrome.storage.local.get(null, (allData) => {
      Object.keys(allData).forEach((key) => {
        if (key.startsWith("vmem_proj_")) {
          const proj = allData[key];
          const li = document.createElement("li");
          li.className = "file-item";
          li.style.display = "flex";
          li.style.justifyContent = "space-between";
          li.style.alignItems = "center";
          li.style.padding = "8px";
          li.style.marginBottom = "6px";

          li.innerHTML = `
            <div style="flex:1;">
              📦 <strong>${proj.name}</strong> (${proj.files.length} file)
            </div>
            <div style="display:flex; gap:6px;">
              <button class="download-btn" data-name="${proj.name}" style="background:#1a73e8; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Scarica .txt</button>
              <button class="delete-proj-btn" data-key="${key}" style="background:var(--danger-color); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Elimina</button>
            </div>
          `;
          projectList.appendChild(li);
        }
      });

      document.querySelectorAll(".download-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const projName = e.target.getAttribute("data-name");
          const storageKey = `vmem_proj_${projName}`;

          chrome.storage.local.get([storageKey], (result) => {
            if (!result[storageKey]) return;
            const projectData = result[storageKey];

            let fileContent = `[VMEM_WORKSPACE_CONTEXT]\n[PROJECT_NAME: ${projName}]\n`;
            fileContent += `Istruzioni per l'AI: Analizza i file di codice allegati sottostanti. Comprendi l'architettura complessiva prima di rispondere alle prossime domande.\n\n`;

            projectData.files.forEach((file) => {
              fileContent += `========================================\n`;
              fileContent += `👉 FILE PATH: ${file.path}\n`;
              fileContent += `========================================\n`;
              fileContent += `${file.content}\n\n`;
            });

            fileContent += `[END_OF_VMEM_CONTEXT]`;

            chrome.runtime.sendMessage({
              action: "triggerContextDownload",
              content: fileContent,
              filename: `VMem_Context_${projName}.txt`,
            });
          });
        });
      });

      document.querySelectorAll(".delete-proj-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const key = e.target.getAttribute("data-key");
          chrome.storage.local.remove(key, () => refreshSavedProjects());
        });
      });
    });
  }

  clearAllBtn.addEventListener("click", () => {
    if (
      confirm(
        "Attenzione: Vuoi davvero cancellare TUTTI i progetti memorizzati permanentemente?",
      )
    ) {
      chrome.storage.local.clear(() => {
        refreshSavedProjects();
        alert("Database VMem ripristinato.");
      });
    }
  });
});
