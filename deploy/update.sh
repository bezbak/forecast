#!/usr/bin/env bash
# Ежедневное обновление: свежие котировки, затем переобучение всех моделей.
# Сайт подхватывает новые файлы сам, перезапуск сервиса не нужен.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONIOENCODING=utf-8
echo "== $(date -Is) загрузка котировок"
.venv/bin/python backend/scripts/fetch_data.py
echo "== $(date -Is) обучение моделей"
nice -n 10 .venv/bin/python backend/scripts/train_all.py
echo "== $(date -Is) готово"
