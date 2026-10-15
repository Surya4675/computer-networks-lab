"""Integration tests for the NetLab Flask API."""

import pytest

import executor
from app import app


@pytest.fixture
def client():
    app.config.update(TESTING=True)
    with app.test_client() as test_client:
        test_client.post("/api/reset", json={})
        yield test_client


# --------------------------------------------------------------------------- #
# Pages and metadata
# --------------------------------------------------------------------------- #
def test_index_page_renders(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"NetLab" in response.data


def test_host_endpoint(client):
    response = client.get("/api/host")
    assert response.status_code == 200
    assert response.get_json()["hostname"]


def test_commands_endpoint(client):
    response = client.get("/api/commands")
    assert response.status_code == 200
    names = {command["name"] for command in response.get_json()["commands"]}
    assert {"ping", "curl", "route"} <= names


# --------------------------------------------------------------------------- #
# Real command execution endpoint
# --------------------------------------------------------------------------- #
def test_execute_help(client):
    response = client.post("/api/execute", json={"command": "help"})
    assert response.status_code == 200
    body = response.get_json()
    assert body["ok"] is True
    assert "ping" in body["output"]


def test_execute_unknown_command_is_rejected(client):
    response = client.post("/api/execute", json={"command": "rm -rf /"})
    assert response.status_code == 400
    assert "not an allowed command" in response.get_json()["output"].lower()


def test_execute_rejects_dhcp_renew(client):
    response = client.post("/api/execute", json={"command": "dhcp renew"})
    assert response.status_code == 400
    assert "disabled" in response.get_json()["output"].lower()


def test_execute_rejects_bad_arguments(client):
    response = client.post("/api/execute", json={"command": "ping"})
    assert response.status_code == 400
    assert "usage" in response.get_json()["output"].lower()


def test_execute_endpoint_delegates_to_executor(client, monkeypatch):
    monkeypatch.setattr(executor, "run", lambda raw: {"ok": True, "command": raw, "output": "REAL-OUTPUT", "error": "", "returncode": 0})
    response = client.post("/api/execute", json={"command": "ping 1.1.1.1"})
    assert response.status_code == 200
    assert response.get_json()["output"] == "REAL-OUTPUT"


def test_command_alias_matches_execute(client):
    response = client.post("/api/command", json={"command": "help"})
    assert response.status_code == 200
    assert response.get_json()["ok"] is True


# --------------------------------------------------------------------------- #
# LAN model endpoints
# --------------------------------------------------------------------------- #
def test_state_endpoint(client):
    body = client.get("/api/state").get_json()
    assert "PC1" in body["hosts"]
    assert body["hosts"]["PC1"]["ip"] == "192.168.1.10"


def test_device_ip_update(client):
    response = client.post("/api/device", json={"device": "PC1", "field": "ip", "value": "192.168.1.20"})
    assert response.status_code == 200
    assert response.get_json()["state"]["hosts"]["PC1"]["ip"] == "192.168.1.20"


def test_device_rejects_invalid_ip(client):
    response = client.post("/api/device", json={"device": "PC1", "field": "ip", "value": "not-an-ip"})
    assert response.status_code == 400


def test_device_rejects_ipv6(client):
    response = client.post("/api/device", json={"device": "PC1", "field": "ip", "value": "::1"})
    assert response.status_code == 400
    assert "IPv4" in response.get_json()["message"]


def test_device_rejects_duplicate_ip(client):
    response = client.post("/api/device", json={"device": "PC1", "field": "ip", "value": "192.168.1.11"})
    assert response.status_code == 409


def test_device_rejects_unknown_device(client):
    response = client.post("/api/device", json={"device": "Nope", "field": "online", "value": False})
    assert response.status_code == 400


def test_device_rejects_unsupported_field(client):
    response = client.post("/api/device", json={"device": "PC1", "field": "warp", "value": True})
    assert response.status_code == 400


def test_device_online_toggle(client):
    response = client.post("/api/device", json={"device": "PC2", "field": "online", "value": False})
    assert response.status_code == 200
    assert response.get_json()["state"]["hosts"]["PC2"]["online"] is False


def test_reset_restores_defaults(client):
    client.post("/api/device", json={"device": "PC1", "field": "ip", "value": "192.168.1.20"})
    client.post("/api/reset", json={})
    body = client.get("/api/state").get_json()
    assert body["hosts"]["PC1"]["ip"] == "192.168.1.10"


# --------------------------------------------------------------------------- #
# Protocol model endpoint
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("scenario", ["tcp", "udp", "http", "dns", "dhcp", "arp"])
def test_simulate_known_scenarios(client, scenario):
    response = client.post("/api/simulate", json={"scenario": scenario})
    assert response.status_code == 200
    assert response.get_json()["events"]


def test_simulate_unknown_scenario(client):
    response = client.post("/api/simulate", json={"scenario": "nope"})
    assert response.status_code == 400
