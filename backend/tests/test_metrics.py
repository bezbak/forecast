import numpy as np
import pytest

from forecast.metrics import direction_accuracy, mae, mape, rmse


def test_errors():
    y, p = np.array([100.0, 200.0]), np.array([110.0, 190.0])
    assert mae(y, p) == 10.0
    assert rmse(y, p) == 10.0
    assert mape(y, p) == pytest.approx(7.5)


def test_direction_accuracy():
    assert direction_accuracy(np.array([0.1, -0.2, 0.3]), np.array([0.2, 0.1, 0.0])) == 50.0


def test_direction_accuracy_none_for_flat_predictions():
    assert direction_accuracy(np.array([0.1, -0.2]), np.zeros(2)) is None
