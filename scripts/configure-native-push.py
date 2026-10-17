"""Interactive, server-local native push setup; never print credentials."""
import argparse
import getpass
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys
import tempfile


def validate(config):
    if not isinstance(config, dict):
        raise ValueError("配置必须是对象")
    for platform, value in config.items():
        if platform not in ("android", "harmony") or not isinstance(value, dict):
            raise ValueError("配置平台无效")
        if not re.fullmatch(r"[A-Fa-f0-9]{24}", value.get("appKey", "")):
            raise ValueError("AppKey 格式无效")
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", value.get("masterSecret", "")):
            raise ValueError("Master Secret 格式无效")


def load(directory):
    target = directory / "native-push.json"
    if directory.is_symlink() or target.is_symlink():
        raise ValueError("拒绝使用符号链接配置目录或配置文件")
    if not target.exists():
        return {}
    metadata = target.stat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_mode & 0o077:
        raise ValueError("已有配置必须是普通文件，权限为 600 或更严格")
    try:
        config = json.loads(target.read_text())
    except (ValueError, UnicodeError):
        raise ValueError("已有配置无法解析；未作修改") from None
    validate(config)
    return config


def save(directory, platform, app_key, secret, owner=None):
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("配置目录必须是已存在的真实目录")
    lock = os.open(directory / ".native-push.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        save_locked(directory, platform, app_key, secret, owner)
    finally:
        os.close(lock)


def save_locked(directory, platform, app_key, secret, owner):
    # The lock covers read/merge/replace so concurrent platform setup is retained.
    config = load(directory)
    config[platform] = {"appKey": app_key, "masterSecret": secret}
    validate(config)
    if not directory.is_dir():
        raise ValueError("请先创建服务数据目录")
    target = directory / "native-push.json"
    old = target.stat() if target.exists() else None
    identity = pwd.getpwnam(owner) if owner else None
    descriptor, temporary = tempfile.mkstemp(prefix=".native-push-", dir=directory)
    try:
        os.fchmod(descriptor, 0o600)
        if identity:
            os.fchown(descriptor, identity.pw_uid, identity.pw_gid)
        elif old:
            os.fchown(descriptor, old.st_uid, old.st_gid)
        with os.fdopen(descriptor, "w") as output:
            descriptor = -1
            json.dump(config, output, separators=(",", ":"))
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description="在服务器终端私密配置原生推送")
    parser.add_argument("platform", nargs="?", choices=("android", "harmony"))
    parser.add_argument("--directory", type=Path, default=Path("/var/lib/dorm-duty"))
    parser.add_argument("--app-key", default="", help="极光公开 AppKey；不要传 Master Secret")
    parser.add_argument("--owner", help="配置文件所属服务账号，例如 dorm-duty")
    parser.add_argument("--check", action="store_true", help="仅输出配置状态，不输出凭据")
    args = parser.parse_args()
    try:
        # systemd StateDirectory may expose /var/lib/name as a managed link to
        # /var/lib/private/name. Resolve the chosen directory, never the file.
        args.directory = args.directory.resolve(strict=True)
        config = load(args.directory)
        if args.check:
            print(json.dumps({platform: platform in config for platform in ("android", "harmony")}))
            return
        if not args.platform or not re.fullmatch(r"[A-Fa-f0-9]{24}", args.app_key):
            raise ValueError("请指定平台与公开的 24 位 --app-key")
        if not sys.stdin.isatty():
            raise ValueError("请在交互终端输入密钥；不接受命令参数、管道或聊天内容")
        secret = getpass.getpass("Master Secret（输入不显示）：")
        confirmation = getpass.getpass("再次输入 Master Secret：")
        if secret != confirmation:
            raise ValueError("两次输入不同；未作修改")
        save(args.directory, args.platform, args.app_key, secret, args.owner)
        print("配置已保存，其他平台配置保留。请重启 dorm-duty.service 后验收设备推送。")
    except (ValueError, KeyError, OSError, TypeError, EOFError, KeyboardInterrupt):
        # Raw filesystem/JSON errors can accidentally include config contents.
        print("配置未完成：请检查平台、格式、文件权限、服务账号与终端输入；凭据未输出。", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
