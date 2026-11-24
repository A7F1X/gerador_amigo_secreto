"use strict";

const createView = document.getElementById("createView");
const revealView = document.getElementById("revealView");
const namesInput = document.getElementById("namesInput");
const sorteioComRestricoes = document.getElementById("sorteioComRestricoes");
const restrictionsPanel = document.getElementById("restrictionsPanel");
const restrictionsList = document.getElementById("restrictionsList");
const restrictionsHint = document.getElementById("restrictionsHint");
const clearRestrictionsButton = document.getElementById("clearRestrictionsButton");
const drawButton = document.getElementById("drawButton");
const clearButton = document.getElementById("clearButton");
const message = document.getElementById("message");
const results = document.getElementById("results");
const linksList = document.getElementById("linksList");
const resultsHint = document.getElementById("resultsHint");
const revealTitle = document.getElementById("revealTitle");
const revealedName = document.getElementById("revealedName");
const revealCard = document.getElementById("revealCard");
const replayButton = document.getElementById("replayButton");
const captionText = document.getElementById("captionText");
const captionEmoji = document.getElementById("captionEmoji");
const backButton = document.getElementById("backButton");
const brandLink = document.getElementById("brandLink");
const confetti = document.getElementById("confetti");

const restrictions = new Map();

// Evita chamadas simultâneas ao compartilhamento nativo.
let shareBusy = false;

// Se o usuário saiu do app durante o share, a promise pode ficar pendente.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) shareBusy = false;
});

function nameKey(name) {
  return name.toLocaleLowerCase("pt-BR");
}

function encodeName(name) {
  const bytes = new TextEncoder().encode(name);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeName(token) {
  let base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function baseUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  if (url.protocol !== "file:" && url.pathname.endsWith("/index.html")) {
    url.pathname = url.pathname.slice(0, -"index.html".length);
  }
  return url;
}

function buildLink(token, participantToken) {
  const url = baseUrl();
  url.hash = "r=" + token + "&p=" + participantToken;
  return url.toString();
}

function hashParams() {
  const raw = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(raw);
}

function clearHash() {
  try {
    window.history.replaceState(null, "", baseUrl().toString());
  } catch (error) {
    window.location.hash = "";
  }
}

function randomInt(maxExclusive) {
  if (maxExclusive <= 1) return 0;
  if (window.crypto && window.crypto.getRandomValues) {
    const limit = Math.floor(4294967296 / maxExclusive) * maxExclusive;
    const buffer = new Uint32Array(1);
    let value;
    do {
      window.crypto.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return value % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function sortear(names) {
  const drawn = names.slice();
  for (let i = drawn.length - 1; i > 0; i--) {
    const j = randomInt(i); 
    [drawn[i], drawn[j]] = [drawn[j], drawn[i]];
  }
  return drawn;
}

function sortearComRestricoes(names) {
  const keys = names.map(nameKey);
  const domains = keys.map((ownerKey, index) => {
    const allowed = new Set(keys);
    allowed.delete(ownerKey);
    for (const forbidden of restrictions.get(ownerKey) || []) {
      allowed.delete(forbidden);
    }
    return Array.from(allowed);
  });

  if (domains.some((options) => options.length === 0)) return null;

  const assigned = new Array(names.length).fill(null);
  const used = new Set();
  let steps = 0;
  const STEP_LIMIT = 200000;

  function solve() {
    let bestIndex = -1;
    let bestOptions = null;

    for (let i = 0; i < names.length; i++) {
      if (assigned[i] !== null) continue;
      const options = domains[i].filter((target) => !used.has(target));
      if (options.length === 0) return false;
      if (bestOptions === null || options.length < bestOptions.length) {
        bestIndex = i;
        bestOptions = options;
        if (options.length === 1) break;
      }
    }

    if (bestIndex === -1) return true;

    for (let i = bestOptions.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [bestOptions[i], bestOptions[j]] = [bestOptions[j], bestOptions[i]];
    }

    for (const target of bestOptions) {
      if (++steps > STEP_LIMIT) return false;
      used.add(target);
      assigned[bestIndex] = target;

      if (solve()) return true;

      assigned[bestIndex] = null;
      used.delete(target);
      if (steps > STEP_LIMIT) return false;
    }

    return false;
  }

  if (!solve()) return null;

  const indexByKey = new Map(keys.map((key, index) => [key, index]));
  return assigned.map((key) => names[indexByKey.get(key)]);
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function parseNames() {
  const seen = new Set();
  const names = [];
  let duplicates = 0;

  for (const part of namesInput.value.split(",")) {
    const name = part.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = nameKey(name);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    names.push(name);
  }

  return { names, duplicates };
}

function syncRestrictions() {
  const validKeys = new Set(parseNames().names.map(nameKey));

  for (const [ownerKey, targets] of restrictions) {
    if (!validKeys.has(ownerKey)) {
      restrictions.delete(ownerKey);
      continue;
    }
    for (const target of targets) {
      if (!validKeys.has(target) || target === ownerKey) targets.delete(target);
    }
    if (targets.size === 0) restrictions.delete(ownerKey);
  }

  renderRestrictions();
}

function renderRestrictions(focusKey = null) {
  const names = parseNames().names;
  restrictionsList.replaceChildren();

  if (names.length < 2) {
    const hint = document.createElement("p");
    hint.className = "restrictions-empty";
    hint.textContent = "Adicione pelo menos 2 nomes para definir restrições.";
    restrictionsList.appendChild(hint);
    restrictionsHint.textContent = "Nenhuma restrição definida.";
    return;
  }

  let total = 0;
  let selectToFocus = null;

  for (const owner of names) {
    const ownerKey = nameKey(owner);
    const forbidden = restrictions.get(ownerKey) || new Set();
    total += forbidden.size;

    const row = document.createElement("div");
    row.className = "restriction-row";

    const label = document.createElement("span");
    label.className = "restriction-owner";
    label.textContent = `${owner} não pode tirar:`;

    const chips = document.createElement("div");
    chips.className = "restriction-chips";

    for (const targetKey of forbidden) {
      const targetName = names.find((name) => nameKey(name) === targetKey);
      if (!targetName) continue;

      const chip = document.createElement("span");
      chip.className = "chip";
      chip.append(document.createTextNode(targetName));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-remove";
      remove.title = `Remover restrição: ${owner} não tirar ${targetName}`;
      remove.setAttribute("aria-label", remove.title);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        restrictions.get(ownerKey)?.delete(targetKey);
        if (restrictions.get(ownerKey)?.size === 0) restrictions.delete(ownerKey);
        renderRestrictions(ownerKey);
      });

      chip.appendChild(remove);
      chips.appendChild(chip);
    }

    const select = document.createElement("select");
    select.setAttribute("aria-label", `Adicionar restrição para ${owner}`);

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "+ Adicionar nome para evitar...";
    select.appendChild(placeholder);

    for (const candidate of names) {
      const candidateKey = nameKey(candidate);
      if (candidateKey === ownerKey || forbidden.has(candidateKey)) continue;
      const option = document.createElement("option");
      option.value = candidateKey;
      option.textContent = candidate;
      select.appendChild(option);
    }

    select.addEventListener("change", () => {
      const targetKey = select.value;
      if (!targetKey) return;
      if (!restrictions.has(ownerKey)) restrictions.set(ownerKey, new Set());
      restrictions.get(ownerKey).add(targetKey);
      renderRestrictions(ownerKey);
    });

    if (focusKey === ownerKey && select.options.length > 1) selectToFocus = select;

    row.append(label, chips, select);
    restrictionsList.appendChild(row);
  }

  restrictionsHint.textContent = total === 0
    ? "Nenhuma restrição definida. O sorteio será normal."
    : `${total} restrição${total > 1 ? "ões" : ""} definida${total > 1 ? "s" : ""}.`;

  if (selectToFocus) selectToFocus.focus();
}

sorteioComRestricoes.addEventListener("change", () => {
  restrictionsPanel.hidden = !sorteioComRestricoes.checked;
  syncRestrictions();
});

namesInput.addEventListener("input", syncRestrictions);

clearRestrictionsButton.addEventListener("click", () => {
  restrictions.clear();
  syncRestrictions();
  setMessage("Restrições removidas.", false);
});

function createCopyButton(link, owner) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.title = `Copiar link de ${owner}`;
  button.setAttribute("aria-label", `Copiar link de ${owner}`);
  button.textContent = "📋";

  button.addEventListener("click", async () => {
    const copied = await copyText(link);
    setMessage(copied ? `Link de ${owner} copiado!` : "Não foi possível copiar. Selecione o link manualmente.", !copied);
    if (copied) {
      button.textContent = "✓";
      window.setTimeout(() => {
        button.textContent = "📋";
      }, 1600);
    }
  });

  return button;
}

function createShareButton(link, owner) {
  if (typeof navigator.share !== "function") return null;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "share-btn";
  button.title = `Compartilhar link de ${owner}`;
  button.setAttribute("aria-label", button.title);
  button.textContent = "↗";

  button.addEventListener("click", async () => {
    if (shareBusy) {
      setMessage("Aguarde o compartilhamento anterior terminar.", false);
      return;
    }

    shareBusy = true;
    try {
      await navigator.share({
        title: "Gerador de Amigo Secreto",
        text: "Abra seu link para descobrir o nome sorteado!",
        url: link,
      });
      setMessage(`Link de ${owner} compartilhado!`, false);
    } catch (error) {
      if (error && error.name === "AbortError") {
        setMessage("Compartilhamento cancelado.", false);
      } else if (error && error.name === "NotAllowedError") {
        const copied = await copyText(link);
        setMessage(
          copied
            ? "Compartilhamento bloqueado pelo navegador; link copiado!"
            : "Não foi possível compartilhar este link.",
          !copied
        );
      } else {
        setMessage("Não foi possível compartilhar este link.", true);
      }
    } finally {
      shareBusy = false;
    }
  });

  return button;
}

function renderLinks(participants, drawnNames) {
  linksList.replaceChildren();

  participants.forEach((participant, index) => {
    const link = buildLink(
      encodeName(drawnNames[index]),
      encodeName(participant)
    );

    const row = document.createElement("li");
    row.className = "link-row";

    const owner = document.createElement("span");
    owner.className = "link-owner";
    owner.textContent = participant;

    const anchor = document.createElement("a");
    anchor.className = "link-url";
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = link;
    anchor.title = link;

    row.append(owner, anchor, createCopyButton(link, participant));
    const shareButton = createShareButton(link, participant);
    if (shareButton) row.appendChild(shareButton);
    linksList.appendChild(row);
  });
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Tenta o método alternativo abaixo.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    copied = false;
  }
  textarea.remove();
  return copied;
}

drawButton.addEventListener("click", () => {
  const { names, duplicates } = parseNames();

  if (names.length < 2) {
    setMessage("Informe pelo menos 2 nomes diferentes, separados por vírgula.", true);
    results.hidden = true;
    return;
  }

  syncRestrictions();
  const drawn = sorteioComRestricoes.checked
    ? sortearComRestricoes(names)
    : sortear(names);

  if (!drawn) {
    results.hidden = true;
    setMessage(
      "Não foi possível sortear com essas restrições. Remova algumas restrições e tente novamente.",
      true
    );
    return;
  }

  renderLinks(names, drawn);
  resultsHint.textContent = `Envie um link para cada participante (${names.length} links).`;
  results.hidden = false;

  const warning = duplicates ? ` ${duplicates} nome(s) repetido(s) foi(ram) ignorado(s).` : "";
  setMessage(`Sorteio realizado para ${names.length} participantes!${warning}`, duplicates > 0);
  results.scrollIntoView({ behavior: "smooth", block: "start" });
});

clearButton.addEventListener("click", () => {
  namesInput.value = "";
  syncRestrictions();
  results.hidden = true;
  linksList.replaceChildren();
  setMessage("");
  namesInput.focus();
});

const captions = [
  ["Guarde segredo até a hora do encontro!", "🤫"],
  ["Não conte para ninguém até lá!", "🙊"],
  ["Segredo guardado até o grande dia!", "🤐"],
  ["Só revelar quando chegar a hora!", "🕵️"],
  ["Mantenha o mistério até o encontro!", "🎁"],
  ["Esconda até a surpresa!", "✨"],
  ["Silêncio até a troca de presentes!", "🎄"],
  ["Deixe a surpresa para depois!", "😉"],
  ["Nada de contar antes da hora!", "👀"],
  ["Guardem essa informação até lá!", "🧐"],
];

let lastCaptionIndex = -1;

function sortearFrase() {
  let index = randomInt(captions.length);
  if (captions.length > 1 && index === lastCaptionIndex) {
    index = (index + 1) % captions.length;
  }
  lastCaptionIndex = index;
  captionText.textContent = captions[index][0];
  captionEmoji.textContent = captions[index][1];
}

let audioContext = null;
let pendingSoundHandler = null;

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext) audioContext = new AudioCtx();
  return audioContext;
}

function playNotes(context) {
  const start = context.currentTime;

  const melody = [
    [659.25, 0.00, 0.13], // E5
    [659.25, 0.16, 0.13],
    [659.25, 0.32, 0.22],
    [659.25, 0.58, 0.13],
    [659.25, 0.74, 0.13],
    [659.25, 0.90, 0.22],
    [659.25, 1.16, 0.13],
    [783.99, 1.32, 0.13], // G5
    [523.25, 1.48, 0.13], // C5
    [587.33, 1.64, 0.13], // D5
    [659.25, 1.80, 0.38], // E5
  ];

  const master = context.createGain();
  master.gain.value = 0.85;
  master.connect(context.destination);

  function addNote(frequency, offset, duration, volume = 0.1, type = "triangle") {
    const time = start + offset;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);

    const bell = context.createOscillator();
    const bellGain = context.createGain();
    bell.type = "sine";
    bell.frequency.setValueAtTime(frequency * 2, time);
    bellGain.gain.setValueAtTime(0.0001, time);
    bellGain.gain.exponentialRampToValueAtTime(volume * 0.32, time + 0.01);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 0.8);
    bell.connect(bellGain);
    bellGain.connect(master);
    bell.start(time);
    bell.stop(time + duration);
  }

  melody.forEach(([frequency, offset, duration]) => addNote(frequency, offset, duration));
  [1046.5, 1318.51, 1567.98].forEach((frequency) => {
    addNote(frequency, 2.22, 0.55, 0.045, "sine");
  });
}

function playHappySound() {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    context.resume().then(() => playNotes(context)).catch(() => {});
  } else {
    playNotes(context);
  }
}

function disarmPendingSound() {
  if (!pendingSoundHandler) return;
  document.removeEventListener("pointerdown", pendingSoundHandler);
  document.removeEventListener("keydown", pendingSoundHandler);
  pendingSoundHandler = null;
}

function armPendingSound(onGesture = playHappySound) {
  disarmPendingSound();
  pendingSoundHandler = () => {
    disarmPendingSound();
    onGesture();
  };
  document.addEventListener("pointerdown", pendingSoundHandler);
  document.addEventListener("keydown", pendingSoundHandler);
}

function playRevealSound() {
  const context = getAudioContext();
  if (!context) return;

  let played = false;
  const start = () => {
    if (played) return;
    played = true;
    disarmPendingSound();
    playNotes(context);
  };

  if (context.state === "running") {
    start();
    return;
  }

  armPendingSound(start);

  context.resume().then(() => {
    if (context.state === "running") start();
  }).catch(() => {});
}

function launchConfetti() {
  confetti.replaceChildren();
  const colors = ["#d62828", "#0b6b3a", "#f2c14e", "#ffffff", "#141414"];

  for (let i = 0; i < 42; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty("--duration", `${2.4 + Math.random() * 2.2}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.9}s`);
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    piece.addEventListener("animationend", () => piece.remove());
    confetti.appendChild(piece);
  }
}

function reveal(name, participant) {
  sortearFrase();
  revealTitle.textContent = participant
    ? `Chegou a hora da revelação, ${participant}!`
    : "Chegou a hora da revelação!";
  revealedName.textContent = name;
  createView.hidden = true;
  revealView.hidden = false;
  revealCard.classList.remove("is-revealing");
  void revealCard.offsetWidth;
  revealCard.classList.add("is-revealing");
  launchConfetti();
  playRevealSound();
}

function showCreateView() {
  revealView.hidden = true;
  createView.hidden = false;
  confetti.replaceChildren();
  disarmPendingSound();
  clearHash();
}

function handleHash() {
  const params = hashParams();
  const token = params.get("r");
  if (!token) {
    showCreateView();
    return;
  }

  try {
    const name = decodeName(token);
    const participantToken = params.get("p");
    const participant = participantToken ? decodeName(participantToken) : null;
    if (!name.trim()) throw new Error("Nome vazio");
    reveal(name, participant && participant.trim() ? participant : null);
  } catch (error) {
    showCreateView();
    setMessage("Este link é inválido ou está corrompido. Peça um novo link ao organizador.", true);
  }
}

replayButton.addEventListener("click", () => {
  sortearFrase();
  revealCard.classList.remove("is-revealing");
  void revealCard.offsetWidth;
  revealCard.classList.add("is-revealing");
  launchConfetti();
  disarmPendingSound();
  playHappySound();
});

backButton.addEventListener("pointerdown", disarmPendingSound);
brandLink.addEventListener("pointerdown", disarmPendingSound);
backButton.addEventListener("click", showCreateView);
brandLink.addEventListener("click", (event) => {
  event.preventDefault();
  showCreateView();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

sorteioComRestricoes.checked = false;
restrictionsPanel.hidden = true;

window.addEventListener("hashchange", handleHash);
handleHash();
