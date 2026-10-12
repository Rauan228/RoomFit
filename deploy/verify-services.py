"""Read-only checks of the pre-existing processes and the isolated API."""

import subprocess, urllib.request, urllib.error

for port in [3001, 3002, 3044, 4182]:
    url = f"http://127.0.0.1:{port}/" + ("api/health" if port == 4182 else "")
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    print(f"Port {port}: HTTP {code}")
subprocess.run(
    ["systemctl", "is-active", "roomfit-api", "nginx", "pm2-root", "fail2ban"],
    check=True,
)
subprocess.run(["ps", "-p", "1243,1244,1250", "-o", "pid=,comm="], check=True)
