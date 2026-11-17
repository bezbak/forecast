import * as api from "./api";
import type { ApiError, Plan, User } from "./api";
import { dateRu } from "./format";

/** Текущий пользователь и окна входа / демо-оплаты. */

let user: User | null = null;
const listeners = new Set<(u: User | null) => void>();

export const getUser = () => user;
export const isPro = () => user?.plan === "pro";

export function onUser(fn: (u: User | null) => void): void {
  listeners.add(fn);
  fn(user);
}

function setUser(u: User | null): void {
  user = u;
  listeners.forEach((fn) => fn(u));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ── Модальное окно (одно на всё приложение)

let dialog: HTMLDialogElement;

function modal(idx: string, title: string, body: string): HTMLElement {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "modal";
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  dialog.innerHTML = `
    <header class="ph"><span class="ph-idx">${idx}</span><h2 class="label">${title}</h2>
      <button class="modal-x" aria-label="Закрыть">✕</button></header>
    <div class="modal-body">${body}</div>`;
  dialog.querySelector(".modal-x")!.addEventListener("click", () => dialog.close());
  if (!dialog.open) dialog.showModal();
  return dialog.querySelector(".modal-body") as HTMLElement;
}

function fail(box: HTMLElement, e: unknown): void {
  const el = box.querySelector(".form-error") as HTMLElement;
  el.textContent = (e as ApiError).message ?? "Ошибка";
  el.hidden = false;
}

// ── Вход и регистрация

export function openAuth(mode: "login" | "register" = "login", reason = "", then?: () => void): void {
  const isLogin = mode === "login";
  const box = modal("A1", isLogin ? "Вход" : "Регистрация", `
    ${reason ? `<p class="modal-reason">${esc(reason)}</p>` : ""}
    <form class="form" novalidate>
      <label><span class="label">Почта</span><input name="email" type="email" autocomplete="email" required /></label>
      <label><span class="label">Пароль</span><input name="password" type="password" minlength="8"
        autocomplete="${isLogin ? "current-password" : "new-password"}" required />
        ${isLogin ? "" : `<small>Не короче 8 символов</small>`}</label>
      <p class="form-error" hidden></p>
      <button class="btn btn-primary" type="submit">${isLogin ? "Войти" : "Создать аккаунт"}</button>
    </form>
    <p class="modal-alt">${isLogin ? "Нет аккаунта?" : "Уже есть аккаунт?"}
      <button class="link" type="button">${isLogin ? "Зарегистрироваться" : "Войти"}</button></p>`);
  const form = box.querySelector("form") as HTMLFormElement;
  (form.elements.namedItem("email") as HTMLInputElement).focus();
  box.querySelector(".link")!.addEventListener("click", () => openAuth(isLogin ? "register" : "login", reason, then));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]") as HTMLButtonElement;
    btn.disabled = true;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    try {
      setUser(await (isLogin ? api.login : api.register)(email, password));
      dialog.close();
      then?.();
    } catch (err) {
      fail(box, err);
      btn.disabled = false;
    }
  });
}

// ── Тариф «Про» и демо-оплата

export async function openUpgrade(reason = ""): Promise<void> {
  if (!user) {
    openAuth("register", reason || "Создайте аккаунт, чтобы подключить тариф Про", () => openUpgrade());
    return;
  }
  if (isPro()) {
    modal("P1", "Тариф Про", `<p class="modal-reason">Тариф Про активен до ${dateRu(user.pro_until!.slice(0, 10))}.</p>
      <button class="btn btn-primary" data-close>Готово</button>`).querySelector("[data-close]")!
      .addEventListener("click", () => dialog.close());
    return;
  }
  let plan: Plan;
  try {
    plan = (await api.getPlans())[0];
  } catch (e) {
    modal("P1", "Тариф Про", `<p class="form-error">${esc((e as ApiError).message)}</p>`);
    return;
  }
  const box = modal("P1", "Тариф Про", `
    ${reason ? `<p class="modal-reason">${esc(reason)}</p>` : ""}
    <div class="plan">
      <div class="plan-head"><span class="plan-name">${esc(plan.name)}</span>
        <span class="plan-price num">${plan.amount}&nbsp;<small>сом / ${plan.days} дн.</small></span></div>
      <ul class="plan-list">${plan.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    </div>
    <p class="form-error" hidden></p>
    <button class="btn btn-primary" data-go>Перейти к оплате</button>`);
  box.querySelector("[data-go]")!.addEventListener("click", async () => {
    try {
      openGateway(await api.checkout(plan.id), plan);
    } catch (e) {
      fail(box, e);
    }
  });
}

function openGateway(payment: api.Payment, plan: Plan): void {
  const box = modal("P2", "Оплата", `
    <div class="gateway-banner">ДЕМО · реальные деньги не списываются</div>
    <dl class="gateway num">
      <dt>Получатель</dt><dd>Терминал прогноза</dd>
      <dt>Заказ</dt><dd>${esc(payment.id)}</dd>
      <dt>Тариф</dt><dd>${esc(plan.name)} · ${plan.days} дней</dd>
      <dt>К оплате</dt><dd class="gateway-sum">${payment.amount} ${payment.currency === "KGS" ? "сом" : esc(payment.currency)}</dd>
    </dl>
    <p class="modal-note">Это имитация платёжного шлюза для учебной защиты: данные карты не запрашиваются,
      оплата подтверждается кнопкой ниже.</p>
    <p class="form-error" hidden></p>
    <div class="btn-row">
      <button class="btn" data-cancel>Отмена</button>
      <button class="btn btn-primary" data-pay>Подтвердить оплату</button>
    </div>`);
  box.querySelector("[data-cancel]")!.addEventListener("click", async () => {
    await api.cancelPayment(payment.id).catch(() => undefined);
    dialog.close();
  });
  box.querySelector("[data-pay]")!.addEventListener("click", async (e) => {
    (e.currentTarget as HTMLButtonElement).disabled = true;
    try {
      const { user: u } = await api.payDemo(payment.id);
      setUser(u);
      const done = modal("P3", "Оплата прошла", `
        <p class="modal-reason">Тариф Про активен до <b class="num">${dateRu(u.pro_until!.slice(0, 10))}</b>.
          ИИ-аналитик и переобучение моделей открыты.</p>
        <button class="btn btn-primary" data-close>Готово</button>`);
      done.querySelector("[data-close]")!.addEventListener("click", () => dialog.close());
    } catch (err) {
      fail(box, err);
    }
  });
}

// ── Виджет в верхней панели

export function mountAccount(slot: HTMLElement): void {
  slot.addEventListener("click", async (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "login") openAuth("login");
    else if (action === "upgrade") openUpgrade();
    else if (action === "logout") { await api.logout().catch(() => undefined); setUser(null); }
  });
  onUser((u) => {
    slot.innerHTML = u
      ? `<span class="acct-email" title="${esc(u.email)}">${esc(u.email)}</span>
         <button class="plan-badge ${u.plan}" data-action="upgrade">${u.plan === "pro" ? "ПРО" : "FREE · Подключить Про"}</button>
         <button class="acct-btn" data-action="logout">Выйти</button>`
      : `<button class="acct-btn" data-action="login">Войти</button>
         <button class="plan-badge free" data-action="upgrade">Тариф Про</button>`;
  });
  api.me().then(setUser, () => undefined);
}
