"""Unit tests for the allow-listed command executor."""

import sys

import pytest

import executor


# --------------------------------------------------------------------------- #
# Metadata
# --------------------------------------------------------------------------- #
def test_registry_contains_expected_commands():
    assert set(executor.REGISTRY) == {"ping", "ipconfig", "tracert", "nslookup", "arp", "route", "netstat", "curl"}


def test_list_commands_shape():
    commands = executor.list_commands()
    assert isinstance(commands, list)
    names = {command["name"] for command in commands}
    assert "ping" in names
    for command in commands:
        assert set(command) == {"name", "usage", "summary", "category"}


def test_help_text_lists_commands():
    text = executor.help_text()
    assert "ping" in text and "curl" in text


def test_host_info_reports_platform():
    info = executor.host_info()
    assert info["hostname"]
    assert info["os"]
    assert info["python"]


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #
def test_parse_handles_quotes():
    assert executor.parse('ping "example.com"') == ["ping", "example.com"]


def test_parse_rejects_unbalanced_quotes():
    with pytest.raises(executor.CommandError):
        executor.parse('ping "example.com')


# --------------------------------------------------------------------------- #
# Rejection paths
# --------------------------------------------------------------------------- #
def test_run_rejects_unknown_command():
    with pytest.raises(executor.CommandError):
        executor.run("rm -rf /")


def test_run_rejects_empty_command():
    with pytest.raises(executor.CommandError):
        executor.run("   ")


def test_run_disables_dhcp_renew():
    with pytest.raises(executor.CommandError) as error:
        executor.run("dhcp renew")
    assert "disabled" in str(error.value).lower()


def test_help_command_is_allowed():
    result = executor.run("help")
    assert result["ok"] is True
    assert "ping" in result["output"]


# --------------------------------------------------------------------------- #
# Argument validation
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("bad_host", ["-c", "; rm", "a b", "", "$(whoami)", "x|y"])
def test_ping_rejects_bad_hosts(bad_host):
    with pytest.raises(executor.CommandError):
        executor._build_ping([bad_host])


def test_ping_requires_arguments():
    with pytest.raises(executor.CommandError):
        executor._build_ping([])


def test_ping_rejects_bad_count():
    with pytest.raises(executor.CommandError):
        executor._build_ping(["1.1.1.1", "999"])


@pytest.mark.parametrize("bad_url", ["file:///etc/passwd", "ftp://x/y", "http://user:pass@example.com", "not-a-url"])
def test_curl_rejects_unsafe_urls(bad_url):
    with pytest.raises(executor.CommandError):
        executor._build_curl([bad_url])


def test_curl_accepts_https():
    argv = executor._build_curl(["https://example.com/path"])
    assert argv[-1] == "https://example.com/path"
    assert argv[0] == "curl"


# --------------------------------------------------------------------------- #
# Cross-platform argv building
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("windows,expected", [(True, ["ping", "-n", "2"]), (False, ["ping", "-c", "2"])])
def test_ping_builds_for_platform(monkeypatch, windows, expected):
    monkeypatch.setattr(executor, "IS_WINDOWS", windows)
    argv = executor._build_ping(["1.1.1.1", "2"])
    assert argv[:3] == expected
    assert "1.1.1.1" in argv


def test_ipconfig_windows(monkeypatch):
    monkeypatch.setattr(executor, "IS_WINDOWS", True)
    assert executor._build_ipconfig([]) == ["ipconfig", "/all"]


def test_ipconfig_linux_uses_ip(monkeypatch):
    monkeypatch.setattr(executor, "IS_WINDOWS", False)
    monkeypatch.setattr(executor, "_first_available", lambda candidates: "ip")
    assert executor._build_ipconfig([]) == ["ip", "addr"]


def test_tracert_windows(monkeypatch):
    monkeypatch.setattr(executor, "IS_WINDOWS", True)
    argv = executor._build_tracert(["8.8.8.8"])
    assert argv[:2] == ["tracert", "-d"]


def test_tracert_linux(monkeypatch):
    monkeypatch.setattr(executor, "IS_WINDOWS", False)
    monkeypatch.setattr(executor, "_first_available", lambda candidates: "traceroute")
    argv = executor._build_tracert(["8.8.8.8", "5"])
    assert argv[0] == "traceroute"
    assert "-m" in argv


def test_route_lookup_windows_and_linux(monkeypatch):
    monkeypatch.setattr(executor, "IS_WINDOWS", True)
    assert executor._build_route(["print"]) == ["route", "print"]
    monkeypatch.setattr(executor, "IS_WINDOWS", False)
    monkeypatch.setattr(executor, "_first_available", lambda candidates: "ip")
    assert executor._build_route(["print"]) == ["ip", "route"]


def test_netstat_windows_and_linux(monkeypatch):
    monkeypatch.setattr(executor, "IS_WINDOWS", True)
    assert executor._build_netstat([]) == ["netstat", "-an"]
    monkeypatch.setattr(executor, "IS_WINDOWS", False)
    monkeypatch.setattr(executor, "_first_available", lambda candidates: "ss")
    assert executor._build_netstat([]) == ["ss", "-tuna"]


def test_missing_tool_raises(monkeypatch):
    monkeypatch.setattr(executor, "IS_WINDOWS", False)
    monkeypatch.setattr(executor, "_first_available", lambda candidates: None)
    with pytest.raises(executor.CommandError):
        executor._build_netstat([])


# --------------------------------------------------------------------------- #
# Real subprocess execution (using a hermetic, offline command)
# --------------------------------------------------------------------------- #
def _register(monkeypatch, name, argv, timeout=executor.DEFAULT_TIMEOUT):
    command = executor.Command(name, name, "test", "test", lambda args: argv, timeout)
    monkeypatch.setitem(executor.REGISTRY, name, command)


def test_execute_runs_real_subprocess(monkeypatch):
    _register(monkeypatch, "realtest", [sys.executable, "-c", "print('netlab-ok')"])
    result = executor.execute("realtest", [])
    assert result["ok"] is True
    assert "netlab-ok" in result["output"]
    assert result["returncode"] == 0


def test_execute_reports_nonzero_exit(monkeypatch):
    _register(monkeypatch, "realtest", [sys.executable, "-c", "import sys; sys.exit(3)"])
    result = executor.execute("realtest", [])
    assert result["ok"] is False
    assert result["returncode"] == 3


def test_execute_reports_missing_binary(monkeypatch):
    _register(monkeypatch, "realtest", ["definitely-not-a-real-binary-netlab"])
    result = executor.execute("realtest", [])
    assert result["ok"] is False
    assert "not available" in result["error"].lower()


def test_execute_enforces_timeout(monkeypatch):
    _register(monkeypatch, "realtest", [sys.executable, "-c", "import time; time.sleep(5)"], timeout=1)
    result = executor.execute("realtest", [])
    assert result["ok"] is False
    assert "time limit" in result["error"].lower()
