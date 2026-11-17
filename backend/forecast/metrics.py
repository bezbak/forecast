"""Метрики точности прогноза."""
import numpy as np


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(np.asarray(y_true) - np.asarray(y_pred))))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2)))


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Средняя абсолютная ошибка в процентах."""
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    return float(np.mean(np.abs((y_true - y_pred) / y_true)) * 100)


def direction_accuracy(r_true: np.ndarray, r_pred: np.ndarray) -> float | None:
    """Доля угаданных знаков доходности (в %) среди ненулевых прогнозов.

    None, если модель ни разу не предсказала направление (например, Naive).
    """
    r_true, r_pred = np.asarray(r_true), np.asarray(r_pred)
    mask = r_pred != 0
    if not mask.any():
        return None
    return float(np.mean(np.sign(r_true[mask]) == np.sign(r_pred[mask])) * 100)
