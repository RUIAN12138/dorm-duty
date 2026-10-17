"""Owner-run SMTP setup. Passwords and authorization codes never enter arguments/logs."""
import argparse
import getpass
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import smtplib
import ssl
import stat
import sys
import tempfile
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description="私密配置轮到邮箱验证码与提醒")
    parser.add_argument("--directory", type=Path, default=Path("/var/lib/dorm-duty"))
    parser.add_argument("--owner", default="dorm-duty")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        directory = args.directory.resolve(strict=True)
        target = directory / "email.json"
        if target.is_symlink():
            raise ValueError()
        old = {}
        if target.exists():
            meta = target.stat()
            if not stat.S_ISREG(meta.st_mode) or meta.st_mode & 0o077:
                raise ValueError()
            old = json.loads(target.read_text())
        if args.check:
            print(json.dumps({"configured": bool(old)}, ensure_ascii=False))
            return
        if not sys.stdin.isatty():
            raise ValueError()
        host = input("SMTP 主机（如 smtp.qq.com）：").strip()
        port = int(input("TLS 端口（465 或 587）：").strip())
        user = input("SMTP 登录名（QQ / 163 通常为完整邮箱）：").strip()
        sender = input("发信邮箱（留空使用登录邮箱）：").strip() or user
        origin = input("网站源地址（留空 https://8.148.190.114）：").strip() or "https://8.148.190.114"
        password = getpass.getpass("SMTP 密码/授权码（不显示）：")
        confirm = getpass.getpass("再次输入 SMTP 密码/授权码：")
        parsed = urlparse(origin)
        address = r"[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+"
        if (not re.fullmatch(r"[A-Za-z0-9.-]+", host) or port not in (465, 587)
                or not re.fullmatch(address, sender) or not user or re.search(r"[\s\r\n]", user)
                or not password or password != confirm or "\r" in password or "\n" in password
                or parsed.scheme != "https" or not parsed.hostname or parsed.path or parsed.query
                or parsed.fragment or parsed.username or parsed.password):
            raise ValueError()
        # Check TLS and authentication before enabling registration. No email is sent.
        context = ssl.create_default_context()
        if port == 465:
            connection = smtplib.SMTP_SSL(host, port, timeout=15, context=context)
        else:
            connection = smtplib.SMTP(host, port, timeout=15)
            connection.starttls(context=context)
        try:
            connection.login(user, password)
        finally:
            connection.close()
        config = dict(host=host, port=port, user=user, password=password, **{"from": sender},
                      publicOrigin=origin, otpSecret=old.get("otpSecret") or secrets.token_hex(32))
        identity = pwd.getpwnam(args.owner)
        fd, temporary = tempfile.mkstemp(prefix=".email-", dir=directory)
        try:
            os.fchmod(fd, 0o600)
            os.fchown(fd, identity.pw_uid, identity.pw_gid)
            with os.fdopen(fd, "w") as output:
                fd = -1
                json.dump(config, output, separators=(",", ":"))
                output.write("\n")
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, target)
        finally:
            if fd >= 0:
                os.close(fd)
            if os.path.exists(temporary):
                os.unlink(temporary)
        print("邮件配置已保存（600）。请重启 dorm-duty.service，再用本人邮箱验收验证码和提醒。")
    except (OSError, smtplib.SMTPException, ValueError, KeyError, TypeError, EOFError, KeyboardInterrupt):
        print("配置未完成：请检查邮箱、TLS 端口、服务账号、授权码及交互终端。凭据未输出。", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
