#!/usr/bin/env python3
"""
Vultr SSH 명령 실행 + 파일 전송 헬퍼.

자격증명은 .env 의 VULTR_HOST / VULTR_USER / VULTR_PASSWORD 에서 로드.

사용법:
  python scripts/vultr-exec.py "ls -la /opt/betman/"
  echo "긴 명령" | python scripts/vultr-exec.py
  python scripts/vultr-exec.py --file diag.sh
  python scripts/vultr-exec.py --upload local.sh /opt/betman/remote.sh
  python scripts/vultr-exec.py --download /opt/betman/log.log local-log.log
"""

import argparse
import os
import sys

import paramiko


def load_env(path: str = ".env") -> dict:
    out: dict = {}
    if not os.path.exists(path):
        return out
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k] = v
    return out


def connect(env: dict, timeout: int) -> paramiko.SSHClient:
    host = env.get("VULTR_HOST") or os.environ.get("VULTR_HOST")
    user = env.get("VULTR_USER") or os.environ.get("VULTR_USER")
    pw = env.get("VULTR_PASSWORD") or os.environ.get("VULTR_PASSWORD")
    if not (host and user and pw):
        print("VULTR_HOST/VULTR_USER/VULTR_PASSWORD 가 .env 에 없음", file=sys.stderr)
        sys.exit(2)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host,
        username=user,
        password=pw,
        timeout=timeout,
        look_for_keys=False,
        allow_agent=False,
    )
    return client


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", nargs="?", help="실행할 명령 (없으면 stdin 에서 읽음)")
    ap.add_argument("--file", help="로컬 파일 내용을 명령으로 사용")
    ap.add_argument("--upload", nargs=2, metavar=("LOCAL", "REMOTE"), help="로컬→VPS 업로드")
    ap.add_argument("--download", nargs=2, metavar=("REMOTE", "LOCAL"), help="VPS→로컬 다운로드")
    ap.add_argument("--timeout", type=int, default=30)
    args = ap.parse_args()

    env = load_env()

    if args.upload or args.download:
        client = connect(env, args.timeout)
        try:
            sftp = client.open_sftp()
            try:
                if args.upload:
                    local, remote = args.upload
                    sftp.put(local, remote)
                    print(f"uploaded: {local} -> {remote}", file=sys.stderr)
                if args.download:
                    remote, local = args.download
                    sftp.get(remote, local)
                    print(f"downloaded: {remote} -> {local}", file=sys.stderr)
            finally:
                sftp.close()
        finally:
            client.close()
        return 0

    if args.file:
        cmd = open(args.file, encoding="utf-8").read()
    elif args.command:
        cmd = args.command
    else:
        cmd = sys.stdin.buffer.read().decode("utf-8")

    if not cmd.strip():
        print("실행할 명령이 비어있습니다.", file=sys.stderr)
        return 2

    client = connect(env, args.timeout)
    try:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=args.timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
    finally:
        client.close()

    # Windows console 이 cp949 라 emoji/em-dash 출력 시 fail.
    # binary 로 직접 써서 콘솔 인코딩 우회.
    sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
    if err:
        sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
    return rc


if __name__ == "__main__":
    sys.exit(main())
