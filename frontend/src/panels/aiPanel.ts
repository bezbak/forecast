import * as api from "../api";
import type { ApiError, ChatMessage } from "../api";
import { getUser, isPro, onUser, openAuth, openUpgrade } from "../account";
import * as store from "../store";

const SUGGESTIONS = [
  "Что модели ждут на неделю?",
  "Какой модели здесь доверять больше?",
  "Почему модели не обгоняют Naive?",
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Выдвижная панель ИИ-аналитика: сводка по выбранной бумаге и чат. */
export function mountAiPanel(el: HTMLElement, toggle: HTMLElement): void {
  el.innerHTML = `
    <header class="ph"><span class="ph-idx">06</span><h2 class="label">ИИ-аналитик</h2>
      <span class="num ai-ticker"></span>
      <div class="ph-aux"><button class="modal-x" aria-label="Закрыть">✕</button></div></header>
    <section class="ai-summary">
      <div class="mp-row"><span class="label">Сводка</span><span class="ai-src"></span></div>
      <p class="ai-summary-text"></p>
    </section>
    <section class="ai-chat">
      <div class="ai-log" aria-live="polite"></div>
      <div class="ai-lock" hidden></div>
      <form class="ai-form">
        <textarea rows="2" maxlength="3000" placeholder="Спросите про выбранную бумагу…  Enter — отправить"></textarea>
        <button class="btn btn-primary" type="submit">Отправить</button>
      </form>
    </section>`;
  const $ = (s: string) => el.querySelector(s) as HTMLElement;
  const log = $(".ai-log");
  const lock = $(".ai-lock");
  const form = $(".ai-form") as HTMLFormElement;
  const input = form.querySelector("textarea") as HTMLTextAreaElement;
  const sendBtn = form.querySelector("button") as HTMLButtonElement;

  const histories = new Map<string, ChatMessage[]>(); // переписка отдельно по каждой бумаге
  let busy = false;
  let open = false;

  function setOpen(v: boolean): void {
    open = v;
    el.classList.toggle("open", v);
    toggle.setAttribute("aria-pressed", String(v));
    if (v) { loadSummary(); renderChat(); if (isPro()) input.focus(); }
  }
  toggle.addEventListener("click", () => setOpen(!open));
  $(".modal-x").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "i" || e.key === "ш") setOpen(!open);
    if (e.key === "Escape" && open && !document.querySelector("dialog[open]")) setOpen(false);
  });

  // ── Сводка

  let summaryFor = "";
  async function loadSummary(force = false): Promise<void> {
    const t = store.get().ticker;
    if (!open || (!force && summaryFor === `${t}/${getUser()?.plan ?? "anon"}`)) return;
    summaryFor = `${t}/${getUser()?.plan ?? "anon"}`;
    const text = $(".ai-summary-text");
    const src = $(".ai-src");
    text.textContent = "Готовлю сводку…";
    text.classList.add("is-loading");
    src.innerHTML = "";
    try {
      const s = await api.aiSummary(t);
      if (store.get().ticker !== t) return;
      text.textContent = s.text;
      src.innerHTML = s.source === "ai" ? `<span class="tag tag-accent">Claude</span>`
        : `<span class="tag tag-muted" title="Сводка собрана из чисел терминала без языковой модели">Шаблон</span>`;
    } catch (e) {
      text.textContent = (e as ApiError).message;
      summaryFor = "";
    } finally {
      text.classList.remove("is-loading");
    }
  }

  // ── Чат

  function bubble(role: "user" | "assistant", text: string): HTMLElement {
    const div = document.createElement("div");
    div.className = `ai-msg ai-${role}`;
    div.innerHTML = `<span class="ai-who label">${role === "user" ? "Вы" : "ИИ"}</span><p></p>`;
    (div.querySelector("p") as HTMLElement).textContent = text;
    log.append(div);
    return div.querySelector("p") as HTMLElement;
  }

  function renderChat(): void {
    const t = store.get().ticker;
    $(".ai-ticker").textContent = t;
    const hist = histories.get(t) ?? [];
    log.innerHTML = "";
    if (!hist.length) {
      log.innerHTML = `<div class="ai-empty"><span class="label">Например</span>${SUGGESTIONS
        .map((s) => `<button class="ai-chip" type="button">${esc(s)}</button>`).join("")}</div>`;
    }
    hist.forEach((m) => bubble(m.role, m.content));
    log.scrollTop = log.scrollHeight;

    const u = getUser();
    lock.hidden = isPro();
    form.hidden = !isPro();
    if (!u) {
      lock.innerHTML = `<p>Чат с ИИ-аналитиком доступен в тарифе Про.</p><button class="btn btn-primary" data-lock="login">Войти</button>`;
    } else if (!isPro()) {
      lock.innerHTML = `<p>Чат с ИИ-аналитиком доступен в тарифе Про.</p><button class="btn btn-primary" data-lock="upgrade">Подключить Про</button>`;
    }
  }

  lock.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-lock]")?.dataset.lock;
    if (a === "login") openAuth("login", "Войдите, чтобы пользоваться ИИ-аналитиком");
    if (a === "upgrade") openUpgrade("ИИ-аналитик доступен в тарифе Про");
  });
  log.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".ai-chip");
    if (!chip) return;
    if (!isPro()) { openUpgrade("ИИ-аналитик доступен в тарифе Про"); return; }
    void ask(chip.textContent ?? "");
  });

  async function ask(question: string): Promise<void> {
    question = question.trim();
    if (!question || busy) return;
    const t = store.get().ticker;
    const hist = histories.get(t) ?? [];
    const messages: ChatMessage[] = [...hist, { role: "user", content: question }];
    histories.set(t, messages);
    renderChat();
    input.value = "";
    busy = true;
    sendBtn.disabled = true;
    const out = bubble("assistant", "");
    out.classList.add("is-typing");
    try {
      const answer = await api.chatStream(t, messages, (chunk) => {
        out.textContent += chunk;
        log.scrollTop = log.scrollHeight;
      });
      histories.set(t, [...messages, { role: "assistant", content: answer || "…" }]);
    } catch (e) {
      out.textContent = (e as ApiError).message;
      out.classList.add("ai-error");
      histories.set(t, hist); // неудачный вопрос не попадает в историю
      if ((e as ApiError).status === 403) openUpgrade("ИИ-аналитик доступен в тарифе Про");
    } finally {
      out.classList.remove("is-typing");
      busy = false;
      sendBtn.disabled = false;
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); void ask(input.value); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(input.value); }
  });

  store.subscribe((_s, changed) => {
    if (!changed.has("ticker")) return;
    if (store.get().ticker !== summaryFor.split("/")[0]) summaryFor = "";
    if (open) { loadSummary(); renderChat(); }
  });
  onUser(() => { summaryFor = ""; if (open) { loadSummary(); renderChat(); } });
}
