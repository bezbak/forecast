# AI Forecast Terminal — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сайт-терминал, который показывает дневные свечи акций Nasdaq-100, прогноз четырёх моделей (Naive, ARIMA, бустинг, LSTM) с интервалом и честное сравнение их точности.

**Architecture:** Python-пакет `forecast` (данные → признаки → модели → бэктест → JSON-результаты) с офлайн-скриптами `fetch_data.py` и `train_all.py`; FastAPI отдаёт готовые результаты и собранный фронтенд. Фронтенд — Vite + TypeScript без UI-китов, графики на Lightweight Charts, вся вёрстка вручную на CSS Grid.

**Tech Stack:** Python 3.14, pandas, pyarrow, yfinance, statsmodels 0.15, scikit-learn (HistGradientBoostingRegressor), torch 2.15 (CPU), FastAPI, uvicorn, pytest; Node 26, Vite, TypeScript, vitest, lightweight-charts 5.3, @fontsource (JetBrains Mono, IBM Plex Sans Condensed).

**Spec:** `docs/specs/2026-11-17-forecast-terminal-design.md`

## Global Constraints

- Интерфейс только на русском; тикеры и названия компаний — латиницей.
- Нигде в коде, тексте и коммитах не упоминаются конкретные люди (студент, руководитель).
- Демо работает без интернета: сайт читает только `data/`; шрифты подключаются локально через `@fontsource`, не из Google Fonts/CDN.
- Никаких UI-китов (Tailwind-компоненты, MUI, shadcn и т.п.). Скругления 0–2px, разделители — линии 1px, не тени. Не Inter/Roboto. Никаких градиентов-«подложек» и эмодзи.
- Никаких фейковых «живых» тиков: все цифры — из реальных дневных данных или из результатов моделей.
- Рядом с каждым прогнозом — метрики модели. На экране всегда виден дисклеймер: «Учебный проект. Не является инвестиционной рекомендацией.»
- Модели учатся на CPU. Целевая переменная моделей — дневная лог-доходность, не цена.
- Константы (`backend/forecast/config.py`): `HISTORY_YEARS = 10`, `HOLDOUT_DAYS = 252`, `MAX_HORIZON = 30`, `LSTM_WINDOW = 60`, `INTERVAL_Z = 1.2816` (80%-интервал), `MIN_ROWS = LSTM_WINDOW + HOLDOUT_DAYS + 100`.
- Имена моделей в API и файлах: `naive`, `arima`, `boosting`, `lstm`. Подписи в UI: «Naive», «ARIMA», «Бустинг», «LSTM».
- Каждый коммит заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Тикер с короткой историей (недавнее IPO, < `MIN_ROWS` строк) — модели не обучаются, в результатах `status: "insufficient_data"`, UI пишет «Недостаточно истории для прогноза», ничего не падает. → тест в Task 6.
2. Одна модель падает при обучении (ARIMA не сходится, исключение) — у неё `status: "failed"`, остальные модели тикера сохраняются и показываются. → тест в Task 6.
3. yfinance не отдал данные по части тикеров — `fetch_data.py` продолжает, в конце печатает список неудачных, остальные файлы записаны. → тест в Task 2.
4. Запрос неизвестного тикера или тикера без рассчитанных результатов — API отвечает 404 с русским `detail`, UI показывает пустое состояние панели, а не белый экран. → тесты в Task 7 и Task 9.
5. Бэкенд недоступен / запрос упал — каждая панель показывает «Нет связи с сервером» и кнопку «Повторить». → тест в Task 9.

---

## Структура файлов

```
ai-forecast-terminal/
  backend/
    requirements.txt
    forecast/
      config.py            # пути и константы
      universe.py          # список Nasdaq-100
      store.py             # чтение/запись свечей (parquet)
      metrics.py           # MAE, RMSE, MAPE, точность направления
      features.py          # лог-доходности и признаки для бустинга
      models/
        base.py            # протокол Forecaster, ForecastPath
        naive.py  arima.py  boosting.py  lstm.py
      backtest.py          # оценка модели на отложенной выборке + путь прогноза
      results.py           # JSON-результаты по тикеру
      pipeline.py          # обучение всех моделей одного тикера
      jobs.py              # фоновое переобучение (Task 12)
      api/app.py           # FastAPI
    scripts/fetch_data.py  scripts/train_all.py
    tests/                 # pytest, фикстуры на синтетических рядах
  frontend/
    index.html  vite.config.ts  package.json
    src/
      main.ts  api.ts  format.ts  store.ts
      panels/ watchlist.ts chart.ts modelPanel.ts comparison.ts tickerTape.ts heatmap.ts status.ts
      styles/ tokens.css layout.css panels.css
    tests/ format.test.ts api.test.ts
  data/
    nasdaq100.json  candles/<TICKER>.parquet  results/<TICKER>.json
  run.ps1                  # один запуск для защиты
  README.md
```

---

### Task 1: Каркас бэкенда, конфиг и метрики

**Files:**
- Create: `backend/requirements.txt`, `backend/forecast/__init__.py`, `backend/forecast/config.py`, `backend/forecast/metrics.py`, `backend/tests/test_metrics.py`, `.gitignore`

**Interfaces:**
- Produces:
  - `config`: `ROOT: Path`, `DATA_DIR`, `CANDLES_DIR`, `RESULTS_DIR`, `UNIVERSE_FILE`, константы из Global Constraints, `MODEL_NAMES = ("naive","arima","boosting","lstm")`.
  - `mae(y_true: np.ndarray, y_pred: np.ndarray) -> float`, `rmse(...)`, `mape(...) -> float` (в процентах), `direction_accuracy(r_true: np.ndarray, r_pred: np.ndarray) -> float | None` — доля совпавших знаков в процентах среди `r_pred != 0`; `None`, если все `r_pred == 0` (Naive).

- [ ] **Step 1:** `git init` в `ai-forecast-terminal/`; `.gitignore`: `.venv/`, `node_modules/`, `frontend/dist/`, `__pycache__/`, `data/candles/`, `data/results/`. Создать `.venv` на Python 3.14, `requirements.txt`: pandas, pyarrow, numpy, yfinance, statsmodels==0.15.*, scikit-learn, torch==2.15.* (CPU), fastapi, uvicorn, httpx, pytest. Установить.
- [ ] **Step 2: Тесты**

```python
def test_errors():
    y, p = np.array([100.0, 200.0]), np.array([110.0, 190.0])
    assert mae(y, p) == 10.0
    assert rmse(y, p) == 10.0
    assert mape(y, p) == pytest.approx(7.5)

def test_direction_accuracy():
    assert direction_accuracy(np.array([0.1, -0.2, 0.3]), np.array([0.2, 0.1, 0.0])) == 50.0
    assert direction_accuracy(np.array([0.1, -0.2]), np.zeros(2)) is None
```

- [ ] **Step 3:** `pytest backend/tests/test_metrics.py -v` → FAIL (нет модуля).
- [ ] **Step 4:** Реализовать `config.py` и `metrics.py`.
- [ ] **Step 5:** `pytest backend/tests -v` → PASS. Коммит `feat: backend skeleton, config and metrics`.

---

### Task 2: Состав индекса, хранилище свечей и загрузка данных

**Files:**
- Create: `data/nasdaq100.json`, `backend/forecast/universe.py`, `backend/forecast/store.py`, `backend/scripts/fetch_data.py`, `backend/tests/test_store.py`, `backend/tests/test_fetch.py`

**Interfaces:**
- Produces:
  - `data/nasdaq100.json`: `{"asof": "YYYY-MM-DD", "companies": [{"ticker": "AAPL", "name": "Apple Inc.", "sector": "Technology"}, ...]}` — актуальный состав Nasdaq-100 (≈100 записей), секторы по GICS на английском.
  - `Company` (dataclass: `ticker, name, sector`), `load_universe() -> list[Company]`, `universe_asof() -> str`.
  - `save_candles(ticker: str, df: pd.DataFrame) -> None`, `load_candles(ticker: str) -> pd.DataFrame` — индекс `DatetimeIndex` (без времени, по возрастанию), колонки `open high low close volume` (float). `load_candles` бросает `FileNotFoundError` если файла нет.
  - `fetch_all(tickers: list[str], download: Callable[[str], pd.DataFrame]) -> list[str]` — возвращает тикеры, которые не удалось скачать; `download` по умолчанию оборачивает `yfinance.Ticker(t).history(period="10y", auto_adjust=True)`.

- [ ] **Step 1: Тесты**
  - `test_roundtrip`: сохранить синтетический DataFrame в `tmp_path` (через monkeypatch `CANDLES_DIR`) и загрузить — равны, индекс отсортирован, колонки ровно `open high low close volume`.
  - `test_drops_nan_rows`: строки с NaN в `close` при сохранении выкидываются.
  - `test_fetch_continues_on_failure`: `download` бросает исключение для `"BAD"` и возвращает пустой DataFrame для `"EMPTY"`; `fetch_all(["AAA","BAD","EMPTY"], download)` возвращает `["BAD","EMPTY"]`, файл `AAA.parquet` существует.
  - `test_universe_loads`: `len(load_universe()) >= 95`, тикеры уникальны.
- [ ] **Step 2:** Запустить → FAIL.
- [ ] **Step 3:** Реализовать. Колонки yfinance переименовать в нижний регистр, таймзону индекса убрать. `fetch_data.py` — CLI: без аргументов качает весь состав, с аргументами — указанные тикеры; печатает прогресс `[12/101] NVDA ok` и в конце список неудачных.
- [ ] **Step 4:** Запустить → PASS. Коммит `feat: nasdaq-100 universe, candle store, fetch script`.

---

### Task 3: Признаки, протокол модели, Naive и бэктест

**Files:**
- Create: `backend/forecast/features.py`, `backend/forecast/models/__init__.py`, `models/base.py`, `models/naive.py`, `backend/forecast/backtest.py`, `backend/tests/conftest.py`, `backend/tests/test_backtest.py`

**Interfaces:**
- Produces:
  - `log_returns(close: pd.Series) -> pd.Series` (первое значение отброшено).
  - `Forecaster` (Protocol):
    - `name: str`
    - `fit(close: pd.Series) -> None` — обучение на истории цен закрытия.
    - `predict_next(close: pd.Series) -> float` — лог-доходность на следующий день по истории `close` (модель уже обучена; используется в бэктесте, без переобучения).
    - `forecast(close: pd.Series, horizon: int) -> np.ndarray` — `horizon` лог-доходностей вперёд (рекурсивно, если модель одношаговая).
    - `interval(close: pd.Series, horizon: int, sigma: float) -> tuple[np.ndarray, np.ndarray] | None` — свой интервал цен (lo, hi) или `None`, тогда используется остаточный.
  - `ForecastPoint` (dataclass: `date: str, value: float, lo: float, hi: float`).
  - `BacktestResult` (dataclass: `mae, rmse, mape: float; direction: float | None; sigma: float`).
  - `evaluate(model: Forecaster, close: pd.Series, holdout: int = HOLDOUT_DAYS) -> BacktestResult` — `fit` на `close[:-holdout]`, затем для каждого дня `t` отложенной выборки `r̂ = predict_next(close[:t])`, `p̂ = close[t-1]·exp(r̂)`; метрики по ценам, направление по доходностям; `sigma` = std ошибок лог-доходности.
  - `forecast_path(model: Forecaster, close: pd.Series, horizon: int, sigma: float) -> list[ForecastPoint]` — `fit` на всей истории; цены `close[-1]·exp(cumsum(r̂))`; интервал из `model.interval` или `value·exp(±INTERVAL_Z·sigma·√k)`; даты — следующие рабочие дни (`pd.bdate_range`, праздники не учитываются).
  - `NaiveForecaster` — всегда доходность 0.
  - фикстура `synthetic_close(n=1200, seed=0) -> pd.Series` — геометрическое случайное блуждание с небольшим трендом, рабочие дни.

- [ ] **Step 1: Тесты**
  - `test_naive_backtest`: на `synthetic_close` `evaluate(NaiveForecaster(), close)` → `direction is None`, `mae > 0`, `sigma > 0`.
  - `test_naive_path_is_flat`: `forecast_path(..., horizon=5, sigma=0.01)` → 5 точек, все `value == close[-1]`, `lo < value < hi`, ширина интервала растёт с `k`, первая дата > последней даты истории и не выходной.
  - `test_evaluate_no_lookahead`: модель-шпион записывает длину `close` в каждом `predict_next`; максимальная длина = `len(close) - 1`.
- [ ] **Step 2:** Запустить → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Запустить → PASS. Коммит `feat: forecaster protocol, naive model, backtest`.

---

### Task 4: ARIMA и бустинг

**Files:**
- Create: `backend/forecast/models/arima.py`, `models/boosting.py`, `backend/tests/test_models_classic.py`
- Modify: `backend/forecast/features.py`

**Interfaces:**
- Consumes: `Forecaster`, `log_returns`, `evaluate`, `forecast_path` из Task 3.
- Produces:
  - `ArimaForecaster(order=(1,0,1))` — `statsmodels.tsa.arima.model.ARIMA` по лог-доходностям; `predict_next` через `results.apply(new_returns)` без переобучения параметров; `interval` возвращает 80%-интервал из `get_forecast(...).conf_int(alpha=0.2)`, переведённый в цены.
  - `build_features(close: pd.Series) -> pd.DataFrame` — лаги доходности 1..10, скользящие средние доходности 5/20, волатильность 5/20, RSI(14), отношение цены к SMA20; строки с NaN отброшены. Объём в признаки не входит: протокол моделей работает только с ценой закрытия (решение исполнителя, набор признаков спека оставляет ему).
  - `BoostingForecaster()` — `HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, random_state=0)`, цель — доходность следующего дня; `forecast` рекурсивный (дописывает предсказанную цену и пересчитывает признаки); `interval` → `None`.

- [ ] **Step 1: Тесты** (для каждой из двух моделей, параметризовано):
  - `test_runs_and_shapes`: `evaluate` на `synthetic_close` даёт конечные метрики; `forecast(close, 30)` — массив длины 30, всё конечно.
  - `test_deterministic`: два запуска `forecast` с одинаковыми данными дают одинаковый результат.
  - `test_features_no_nan_and_no_future`: `build_features` без NaN; значение признаков в строке `t` не меняется, если изменить `close[t+1:]`.
  - `test_arima_interval`: `ArimaForecaster().interval(close, 5, sigma)` → `lo < hi` поэлементно.
- [ ] **Step 2:** Запустить → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Запустить → PASS. Коммит `feat: arima and gradient boosting forecasters`.

---

### Task 5: LSTM

**Files:**
- Create: `backend/forecast/models/lstm.py`, `backend/tests/test_lstm.py`

**Interfaces:**
- Consumes: `Forecaster`, `log_returns` из Task 3.
- Produces: `LstmForecaster(window=LSTM_WINDOW, hidden=32, epochs=30, lr=1e-3, seed=0)` — вход: окно стандартизованных лог-доходностей длины `window`; `nn.LSTM(1, hidden, num_layers=1)` → `nn.Linear(hidden, 1)`; Adam, MSE, батч 64; последние 10% train — валидация с ранней остановкой (patience 5); `torch.manual_seed(seed)`, `torch.set_num_threads` не трогать; `forecast` рекурсивный; `interval` → `None`.

- [ ] **Step 1: Тесты**
  - `test_lstm_runs`: на `synthetic_close(n=600)` c `epochs=2` — `evaluate` даёт конечные метрики, `forecast(close, 30)` длины 30.
  - `test_lstm_deterministic`: два обучения с `seed=0` дают одинаковый `forecast` (`np.allclose`).
  - `test_lstm_learns_sine`: на ряду, где лог-доходность = `0.01·sin(2πt/20)`, после `epochs=30` MAE доходности на последних 100 точках меньше, чем у Naive, минимум в 2 раза.
- [ ] **Step 2:** Запустить → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Запустить → PASS. Коммит `feat: lstm forecaster`.

---

### Task 6: Пайплайн обучения и JSON-результаты

**Files:**
- Create: `backend/forecast/results.py`, `backend/forecast/pipeline.py`, `backend/scripts/train_all.py`, `backend/tests/test_pipeline.py`

**Interfaces:**
- Consumes: всё из Tasks 2–5.
- Produces:
  - Формат `data/results/<TICKER>.json`:
    ```json
    {"ticker": "NVDA", "asof": "2026-11-16", "last_close": 142.31,
     "status": "ok" | "insufficient_data",
     "models": {"lstm": {"status": "ok" | "failed", "error": "…"?,
                          "metrics": {"mae": 0, "rmse": 0, "mape": 0, "direction": 0 | null},
                          "beats_naive": true,
                          "path": [{"date": "2026-11-17", "value": 0, "lo": 0, "hi": 0}]}}}
    ```
    `path` всегда длины `MAX_HORIZON`; `beats_naive` = MAE модели < MAE Naive (у самой Naive — `null`).
  - `save_result(result: dict) -> None`, `load_result(ticker: str) -> dict` (`FileNotFoundError`, если нет).
  - `train_ticker(ticker: str, close: pd.Series, models: dict[str, Callable[[], Forecaster]] | None = None, on_progress: Callable[[str], None] | None = None) -> dict` — обучает каждую модель в `try/except`; при `len(close) < MIN_ROWS` возвращает `status: "insufficient_data"` и пустой `models`; `on_progress(model_name)` перед каждой моделью.
  - `train_all.py` — CLI: все тикеры с файлами свечей или указанные; `--fast` (LSTM `epochs=5`) для отладки; печатает время по тикеру.

- [ ] **Step 1: Тесты**
  - `test_short_history`: ряд из 200 точек → `status == "insufficient_data"`, `models == {}`.
  - `test_failed_model_isolated`: фабрика, модель которой бросает `RuntimeError` в `fit`, под именем `arima` + настоящая Naive → `models.arima.status == "failed"`, `models.naive.status == "ok"`, `len(path) == 30`.
  - `test_beats_naive_flag`: у Naive `beats_naive is None`, у остальных — bool.
  - `test_result_roundtrip`: `save_result` → `load_result` равны; JSON без NaN (`allow_nan=False`).
- [ ] **Step 2:** Запустить → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Запустить → PASS. Коммит `feat: training pipeline and result files`.

---

### Task 7: API

**Files:**
- Create: `backend/forecast/api/__init__.py`, `backend/forecast/api/app.py`, `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `load_universe`, `load_candles`, `load_result`.
- Produces (все ответы JSON, ошибки — `{"detail": "<по-русски>"}`):
  - `GET /api/tickers` → `[{ticker, name, sector, last, change_pct, spark: number[30]}]` (тикеры без свечей пропускаются).
  - `GET /api/candles/{ticker}?range=1M|3M|6M|1Y|5Y|ALL` (по умолчанию `1Y`) → `[{time: "YYYY-MM-DD", open, high, low, close, volume}]`.
  - `GET /api/forecast/{ticker}?model=naive|arima|boosting|lstm&horizon=1..30` → `{ticker, model, asof, last_close, status, points: ForecastPoint[horizon]}`.
  - `GET /api/metrics/{ticker}` → `{ticker, status, models: [{model, status, mae, rmse, mape, direction, beats_naive}]}` в порядке `MODEL_NAMES`.
  - `GET /api/overview` → `[{ticker, sector, change_pct, forecast_pct}]`, `forecast_pct` — изменение к 7-му дню у модели с наименьшим MAE (`null`, если результатов нет).
  - `GET /api/meta` → `{universe_asof, data_asof}`.
  - Если существует `frontend/dist`, он раздаётся на `/` (SPA).
  - Неизвестный тикер → 404 «Тикер не найден»; нет результатов → 404 «Прогноз для этого тикера ещё не рассчитан»; неверные `model`/`horizon`/`range` → 422.

- [ ] **Step 1: Тесты** (`TestClient`, фикстура пишет 2 тикера свечей и результаты в `tmp_path`, monkeypatch путей):
  - `test_tickers_shape`, `test_candles_range` (1M ≤ 23 строк, по возрастанию дат), `test_forecast_horizon` (`horizon=7` → 7 точек), `test_metrics_order`, `test_overview`.
  - `test_unknown_ticker_404`, `test_no_results_404` (текст `detail` проверяется), `test_bad_horizon_422` (`horizon=31`), `test_bad_model_422`.
- [ ] **Step 2:** Запустить → FAIL.
- [ ] **Step 3:** Реализовать (Pydantic-модели ответов, `Literal` для model/range, `Query(ge=1, le=30)` для horizon).
- [ ] **Step 4:** Запустить → PASS. Коммит `feat: forecast api`.

---

### Task 8: Реальные данные и обучение

**Files:**
- Modify: `README.md` (раздел «Данные»)

- [ ] **Step 1:** `python backend/scripts/fetch_data.py` → в конце не более нескольких неудачных тикеров; если их больше 5 — разобраться с причиной, а не идти дальше.
- [ ] **Step 2:** `python backend/scripts/train_all.py --fast AAPL NVDA` → два JSON в `data/results`, в каждом 4 модели со `status: "ok"`.
- [ ] **Step 3:** `python backend/scripts/train_all.py` в фоне (может занять долго) → файлов результатов столько же, сколько свечей.
- [ ] **Step 4:** Сводка: доля тикеров, где каждая модель обогнала Naive по MAE, — записать в README (пригодится для текста диплома). Коммит `docs: data and training notes`.

---

### Task 9: Каркас фронтенда, визуальный язык, API-клиент

**Files:**
- Create: `frontend/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/api.ts`, `src/format.ts`, `src/store.ts`, `src/panels/status.ts`, `src/styles/tokens.css`, `src/styles/layout.css`, `src/styles/panels.css`, `tests/format.test.ts`, `tests/api.test.ts`

**Interfaces:**
- Consumes: API из Task 7.
- Produces:
  - `api.ts`: типы `TickerRow`, `Candle`, `ForecastResponse`, `MetricsResponse`, `OverviewRow`, `Meta`; функции `getTickers()`, `getCandles(t, range)`, `getForecast(t, model, horizon)`, `getMetrics(t)`, `getOverview()`, `getMeta()`. Ошибка — `ApiError { status: number | null; message: string }` (`status: null` — нет связи; `message` — `detail` сервера либо «Нет связи с сервером»).
  - `format.ts`: `price(n) → "1 234.56"` (неразрывный пробел для тысяч), `pct(n) → "+1.24%"` / `"−0.40%"` (настоящий минус U+2212), `compact(n) → "12.3 млн"`, `dateRu("2026-11-17") → "17 ноя 2026"`.
  - `store.ts`: простое состояние `{ticker, model, horizon, range}` с `subscribe(fn)` и `set(patch)`; по умолчанию `NVDA`, `lstm`, `7`, `1Y`; состояние сохраняется в `location.hash`.
  - `status.ts`: `renderLoading(el)`, `renderEmpty(el, text)`, `renderError(el, err: ApiError, retry: () => void)` — общие состояния панелей.
  - Сетка экрана из спеки: тикер-лента сверху, вотчлист слева, график в центре, панель модели справа, снизу сравнение моделей и (позже) теплокарта; на ширине < 1100px панели идут в одну колонку без горизонтального скролла.
  - Токены в `tokens.css`: фон почти чёрный с холодным оттенком (не `#000`), 2–3 уровня поверхности, линия 1px, один акцентный цвет, приглушённые зелёный/красный; `--radius: 2px`; шрифты `JetBrains Mono` (цифры, `font-variant-numeric: tabular-nums`) и `IBM Plex Sans Condensed` (подписи), подписи разделов — UPPERCASE с разрядкой ~0.08em.
  - В подвале — дисклеймер и `universe_asof`/`data_asof` из `getMeta()`.

- [ ] **Step 1:** `npm create vite@latest frontend -- --template vanilla-ts`, удалить демо-файлы; `npm i lightweight-charts@5.3.0 @fontsource/jetbrains-mono @fontsource/ibm-plex-sans-condensed`, `npm i -D vitest`. Прокси `/api` → `http://127.0.0.1:8000` в `vite.config.ts`.
- [ ] **Step 2: Тесты**
  - `format.test.ts`: `pct(1.2345) === "+1.23%"`, `pct(-0.4) === "−0.40%"`, `price(1234.5) === "1 234.50"`, `dateRu("2026-11-17") === "17 ноя 2026"`.
  - `api.test.ts` (мок `fetch`): 404 c `{"detail":"Тикер не найден"}` → `ApiError{status:404, message:"Тикер не найден"}`; `fetch` бросает `TypeError` → `ApiError{status:null, message:"Нет связи с сервером"}`.
- [ ] **Step 3:** `npx vitest run` → FAIL.
- [ ] **Step 4:** Реализовать модули, сетку и токены (панели пока с заголовками-заглушками).
- [ ] **Step 5:** `npx vitest run` → PASS; `npm run build` без ошибок; с запущенным бэкендом открыть страницу в браузере-превью: сетка на месте, шрифты локальные (в Network нет запросов к внешним доменам), дисклеймер виден. Коммит `feat: frontend shell, design tokens, api client`.

---

### Task 10: Ядро интерфейса — вотчлист, график с прогнозом, панель модели, сравнение

**Files:**
- Create: `src/panels/watchlist.ts`, `src/panels/chart.ts`, `src/panels/modelPanel.ts`, `src/panels/comparison.ts`
- Modify: `src/main.ts`, `src/styles/panels.css`

**Interfaces:**
- Consumes: `api.ts`, `format.ts`, `store.ts`, `status.ts` из Task 9.
- Produces: `mountWatchlist(el)`, `mountChart(el)`, `mountModelPanel(el)`, `mountComparison(el)` — каждая подписывается на `store` и сама рисует загрузку/пусто/ошибку через `status.ts`.
  - Вотчлист: поиск по тикеру и названию, строки `тикер · цена · изменение%`, выбранная строка подсвечена, клик → `store.set({ticker})`.
  - График: свечи + гистограмма объёма (Lightweight Charts v5, `addSeries(CandlestickSeries)`), линия прогноза выбранной модели пунктиром, полоса интервала (две линии `lo`/`hi` + заливка между ними), вертикальная отметка «сегодня»; кнопки диапазона `1М 3М 6М 1Г 5Л`; заголовок `тикер · название · цена · изменение`. Цвета графика берутся из CSS-токенов.
  - Панель модели: радиокнопки 4 моделей, ползунок/кнопки горизонта 1–30 дней, итог «прогноз на N дн.: цена (±%)», интервал, MAPE и точность направления выбранной модели; если `beats_naive === false` — пометка «Не лучше базовой модели».
  - Сравнение: таблица `Модель · MAE · RMSE · MAPE · Направление` по 4 моделям, лучшая по MAE выделена, проигравшие Naive помечены; `failed` → «ошибка обучения», `insufficient_data` → «Недостаточно истории для прогноза».

- [ ] **Step 1:** Реализовать панели.
- [ ] **Step 2:** Проверка в браузере-превью (бэкенд + `npm run dev`):
  - выбрать 3 разных тикера из вотчлиста — график, панель модели и таблица обновляются;
  - переключить все 4 модели и горизонты 1, 7, 30 — линия и интервал меняются;
  - тикер без результатов (временно переименовать его JSON) → панели показывают пустое состояние, остальное работает;
  - остановить бэкенд → панели показывают «Нет связи с сервером» и «Повторить»; после запуска «Повторить» восстанавливает данные;
  - консоль без ошибок.
- [ ] **Step 3:** `npx vitest run` и `npm run build` → OK. Коммит `feat: core terminal panels`.

---

### Task 11: Полировка — тикер-лента, анимации, клавиатура, спарклайны

**Files:**
- Create: `src/panels/tickerTape.ts`
- Modify: `src/panels/watchlist.ts`, `src/panels/chart.ts`, `src/styles/panels.css`

**Interfaces:**
- Produces: `mountTickerTape(el)` — бесконечная бегущая строка из `getTickers()` (CSS-анимация, пауза при наведении, `prefers-reduced-motion` → без анимации).

- [ ] **Step 1:** Тикер-лента; спарклайны 30 дней в строках вотчлиста (inline SVG, цвет по знаку изменения).
- [ ] **Step 2:** Клавиатура: `↑/↓` — по вотчлисту, `Enter` — выбрать, `/` — фокус в поиск, `Esc` — очистить поиск, `1–4` — выбор модели.
- [ ] **Step 3:** Микроанимации: короткая подсветка ячеек при смене значения (смена тикера/модели), прорисовка линии прогноза слева направо; всё отключается при `prefers-reduced-motion`.
- [ ] **Step 4:** Проверка в браузере-превью всех сочетаний клавиш и анимаций; консоль без ошибок. Коммит `feat: ticker tape, sparklines, keyboard, motion`.

---

### Task 12: Если успеем — теплокарта и переобучение из интерфейса

**Files:**
- Create: `src/panels/heatmap.ts`, `backend/forecast/jobs.py`, `backend/tests/test_jobs.py`
- Modify: `backend/forecast/api/app.py`, `src/panels/modelPanel.ts`, `src/api.ts`

**Interfaces:**
- Consumes: `train_ticker`, `save_result`, `load_candles` из Tasks 2, 6.
- Produces:
  - `GET /api/overview` уже есть; `mountHeatmap(el)` — плитки по секторам, размер одинаковый, цвет — `forecast_pct` (переключатель «сегодня / прогноз 7 дн.» → `change_pct`/`forecast_pct`), клик → выбор тикера.
  - `JobManager.start(ticker) -> str` (id), `JobManager.get(id) -> {status: "running"|"done"|"failed", progress: 0..1, model: str | None, error: str | None}`; одна задача на тикер одновременно (повторный старт возвращает id текущей); результат записывается через временный файл + `os.replace` только после успешного `train_ticker`.
  - `POST /api/retrain/{ticker}` → `{job_id}`; `GET /api/jobs/{id}` → статус выше; неизвестный id → 404 «Задача не найдена».
  - В панели модели — кнопка «Переобучить» с прогрессом по моделям; по завершении — перезапрос прогноза и метрик.

- [ ] **Step 1: Тесты** `test_jobs.py`: задача с подменённой быстрой фабрикой моделей доходит до `done` и файл обновлён; при исключении — `failed`, старый файл результатов не изменился; повторный `start` того же тикера возвращает тот же id.
- [ ] **Step 2:** Запустить → FAIL; реализовать; → PASS.
- [ ] **Step 3:** Теплокарта и кнопка; проверка в браузере-превью. Коммит `feat: market heatmap and retraining`.

---

### Task 13: Запуск для защиты

**Files:**
- Create: `run.ps1`, `README.md` (дополнить)

- [ ] **Step 1:** `run.ps1`: собирает фронтенд (`npm run build`, если нет `frontend/dist`), запускает `uvicorn forecast.api.app:app --port 8000` и открывает `http://127.0.0.1:8000`.
- [ ] **Step 2:** README: установка, загрузка данных, обучение, запуск, архитектура (схема модулей), описание моделей и метрик.
- [ ] **Step 3:** Проверка с выключенным интернетом: `.\run.ps1` → сайт открывается, все панели с данными, в Network только `127.0.0.1`. Все тесты: `pytest backend/tests` и `npx vitest run` → PASS. Коммит `chore: one-command launch and readme`.
