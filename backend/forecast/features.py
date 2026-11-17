"""Преобразования ряда цен в признаки для моделей."""
import numpy as np
import pandas as pd


def log_returns(close: pd.Series) -> pd.Series:
    """Дневные лог-доходности; первое значение (NaN) отброшено."""
    return np.log(close).diff().iloc[1:]
