"""Пути и константы проекта."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
CANDLES_DIR = DATA_DIR / "candles"
RESULTS_DIR = DATA_DIR / "results"
UNIVERSE_FILE = DATA_DIR / "nasdaq100.json"
FRONTEND_DIST = ROOT / "frontend" / "dist"
DB_FILE = DATA_DIR / "app.db"  # пользователи, сессии, платежи
SESSION_DAYS = 30

HISTORY_YEARS = 10
HOLDOUT_DAYS = 252
MAX_HORIZON = 30
LSTM_WINDOW = 60
INTERVAL_Z = 1.2816  # 80%-интервал
MIN_ROWS = LSTM_WINDOW + HOLDOUT_DAYS + 100

MODEL_NAMES = ("naive", "arima", "boosting", "lstm")
