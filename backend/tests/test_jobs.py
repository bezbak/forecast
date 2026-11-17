import threading
import time

import pytest

from forecast.jobs import JobManager
from forecast.results import load_result, save_result
from tests.conftest import make_close
from tests.test_pipeline import FAST


def wait_done(jobs: JobManager, job_id: str, timeout: float = 20) -> dict:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        job = jobs.get(job_id)
        if job["status"] != "running":
            return job
        time.sleep(0.05)
    raise TimeoutError(job_id)


OLD = {"ticker": "AAA", "asof": "2000-01-01", "last_close": 1.0, "status": "ok", "models": {}}


def test_job_done_updates_file(tmp_data):
    save_result(OLD)
    jobs = JobManager(load_close=lambda t: make_close(), models=FAST)
    job = wait_done(jobs, jobs.start("AAA"))
    assert job["status"] == "done"
    assert job["progress"] == 1.0
    res = load_result("AAA")
    assert res["asof"] != "2000-01-01"
    assert set(res["models"]) == {"naive", "arima", "boosting"}


def test_job_failure_keeps_old_file(tmp_data):
    save_result(OLD)

    def boom(*args, **kwargs):
        raise RuntimeError("нет памяти")

    jobs = JobManager(load_close=lambda t: make_close(), models=FAST, train=boom)
    job = wait_done(jobs, jobs.start("AAA"))
    assert job["status"] == "failed"
    assert "нет памяти" in job["error"]
    assert load_result("AAA") == OLD


def test_same_ticker_same_job(tmp_data):
    gate = threading.Event()

    def slow(ticker, close, models=None, on_progress=None):
        gate.wait(5)
        return {**OLD, "asof": "2001-01-01"}

    jobs = JobManager(load_close=lambda t: make_close(), train=slow)
    first = jobs.start("AAA")
    assert jobs.start("AAA") == first
    assert jobs.get(first)["status"] == "running"
    gate.set()
    assert wait_done(jobs, first)["status"] == "done"
    assert jobs.start("AAA") != first


def test_unknown_job():
    assert JobManager().get("nope") is None


@pytest.mark.parametrize("seen", [["naive", "arima", "boosting"]])
def test_progress_reports_model(tmp_data, seen):
    jobs = JobManager(load_close=lambda t: make_close(), models=FAST)
    job = wait_done(jobs, jobs.start("AAA"))
    assert job["model"] == seen[-1]
