#!/usr/bin/env python3
"""SQLite online backup; always creates a new destination, never overwrites a file."""
import argparse
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser(description='SQLite 在线备份：源数据库 目标备份路径')
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
if not args.source.is_file():
    parser.error('源数据库不存在')
args.destination.parent.mkdir(parents=True, exist_ok=True)
# Reserve a new filename, refusing overwrite even if two backup commands race.
with args.destination.open('xb'):
    pass
with sqlite3.connect(args.source.resolve().as_uri() + '?mode=ro', uri=True) as source:
    with sqlite3.connect(args.destination) as target:
        source.backup(target)
        if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('备份完整性检查失败')
print(f'备份已创建：{args.destination.resolve()}')
