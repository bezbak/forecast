import type { ApiError } from "../api";

function state(el: HTMLElement, cls: string, code: string, text: string): HTMLElement {
  el.innerHTML = "";
  const box = document.createElement("div");
  box.className = `state ${cls}`;
  const c = document.createElement("div");
  c.className = "state-code";
  c.textContent = code;
  const t = document.createElement("div");
  t.textContent = text;
  box.append(c, t);
  el.append(box);
  return box;
}

export function renderLoading(el: HTMLElement): void {
  state(el, "state-loading", "ЗАГРУЗКА", "");
}

export function renderEmpty(el: HTMLElement, text: string): void {
  state(el, "state-empty", "НЕТ ДАННЫХ", text);
}

export function renderError(el: HTMLElement, err: ApiError, retry: () => void): void {
  const code = err.status == null ? "ОФЛАЙН" : `ОШИБКА ${err.status}`;
  const box = state(el, "state-error", code, err.message);
  const b = document.createElement("button");
  b.textContent = "Повторить";
  b.addEventListener("click", retry);
  box.append(b);
}

/** Заголовок панели: номер, название, место под элементы управления; возвращает тело. */
export function panelShell(el: HTMLElement, idx: string, title: string): { body: HTMLElement; aux: HTMLElement } {
  el.innerHTML = `<header class="ph"><span class="ph-idx">${idx}</span><h2 class="label">${title}</h2><div class="ph-aux"></div></header><div class="pb"></div>`;
  return { body: el.querySelector(".pb") as HTMLElement, aux: el.querySelector(".ph-aux") as HTMLElement };
}
