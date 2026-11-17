"""LSTM-сеть по окну последних дневных лог-доходностей."""
import copy

import numpy as np
import pandas as pd
import torch
from torch import nn

from forecast.config import LSTM_WINDOW


class _Net(nn.Module):
    def __init__(self, hidden: int):
        super().__init__()
        self.lstm = nn.LSTM(1, hidden, num_layers=1, batch_first=True)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(x)
        return self.head(out[:, -1]).squeeze(-1)


class LstmForecaster:
    name = "lstm"

    def __init__(self, window: int = LSTM_WINDOW, hidden: int = 32, epochs: int = 30,
                 lr: float = 1e-3, seed: int = 0, patience: int = 5, batch: int = 64):
        self.window, self.hidden, self.epochs = window, hidden, epochs
        self.lr, self.seed, self.patience, self.batch = lr, seed, patience, batch
        self.net: _Net | None = None
        self.mu = 0.0
        self.sd = 1.0

    def _returns(self, close: pd.Series) -> np.ndarray:
        return np.diff(np.log(close.to_numpy(dtype=float)))

    def fit(self, close: pd.Series) -> None:
        torch.manual_seed(self.seed)
        r = self._returns(close)
        self.mu, self.sd = float(r.mean()), float(r.std() or 1.0)
        z = ((r - self.mu) / self.sd).astype(np.float32)
        w = self.window
        x = np.lib.stride_tricks.sliding_window_view(z[:-1], w)
        y = z[w:]
        x_t = torch.from_numpy(x.copy()).unsqueeze(-1)
        y_t = torch.from_numpy(y.copy())
        n_val = max(1, len(y) // 10)
        xtr, ytr, xva, yva = x_t[:-n_val], y_t[:-n_val], x_t[-n_val:], y_t[-n_val:]

        self.net = _Net(self.hidden)
        opt = torch.optim.Adam(self.net.parameters(), lr=self.lr)
        loss_fn = nn.MSELoss()
        gen = torch.Generator().manual_seed(self.seed)
        best, best_state, bad = float("inf"), copy.deepcopy(self.net.state_dict()), 0
        for _ in range(self.epochs):
            self.net.train()
            perm = torch.randperm(len(ytr), generator=gen)
            for i in range(0, len(perm), self.batch):
                idx = perm[i : i + self.batch]
                opt.zero_grad()
                loss = loss_fn(self.net(xtr[idx]), ytr[idx])
                loss.backward()
                opt.step()
            self.net.eval()
            with torch.no_grad():
                val = loss_fn(self.net(xva), yva).item()
            if val < best:
                best, best_state, bad = val, copy.deepcopy(self.net.state_dict()), 0
            else:
                bad += 1
                if bad >= self.patience:
                    break
        self.net.load_state_dict(best_state)
        self.net.eval()

    def _step(self, z_window: np.ndarray) -> float:
        with torch.no_grad():
            x = torch.from_numpy(z_window.astype(np.float32)).view(1, -1, 1)
            return float(self.net(x).item())

    def predict_next(self, close: pd.Series) -> float:
        r = self._returns(close.iloc[-(self.window + 1):])
        return self._step((r - self.mu) / self.sd) * self.sd + self.mu

    def forecast(self, close: pd.Series, horizon: int) -> np.ndarray:
        r = self._returns(close.iloc[-(self.window + 1):])
        z = list((r - self.mu) / self.sd)
        out = np.empty(horizon)
        for i in range(horizon):
            zn = self._step(np.array(z[-self.window:]))
            z.append(zn)
            out[i] = zn * self.sd + self.mu
        return out

    def interval(self, close: pd.Series, horizon: int, sigma: float):
        return None
