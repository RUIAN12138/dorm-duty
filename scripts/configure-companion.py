"""Private terminal-only AI setup; credentials never enter arguments or logs."""
import argparse, getpass, json, os, pwd, sys, tempfile, urllib.request, urllib.error
from pathlib import Path

PROVIDERS = {
    'siliconflow': ('硅基流动', 'https://api.siliconflow.cn/v1', 'Qwen/Qwen2.5-7B-Instruct'),
    'bigmodel': ('智谱', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4.7-flash'),
}

def main():
    parser = argparse.ArgumentParser(description='私密配置球球AI')
    parser.add_argument('--directory', type=Path, default=Path('/var/lib/dorm-duty'))
    parser.add_argument('--owner', default='dorm-duty')
    parser.add_argument('--provider', choices=PROVIDERS, default='siliconflow')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    target = directory / 'companion-ai.json'
    if target.is_symlink(): raise ValueError('配置文件不能为链接')
    if args.check:
        config = json.loads(target.read_text()) if target.is_file() else {}
        print(json.dumps({'configured': bool(config), 'base_url': config.get('base_url'), 'model': config.get('model')}, ensure_ascii=False)); return
    if not sys.stdin.isatty(): raise ValueError('请在本人终端执行')
    label, origin, model = PROVIDERS[args.provider]
    print(label + ' · ' + model)
    key = getpass.getpass(label + ' API Key（不显示）：').strip()
    again = getpass.getpass('再次输入 API Key：').strip()
    if not key or key != again or any(c.isspace() for c in key):
        raise ValueError('两次输入不一致或格式错误')
    config = {'base_url': origin, 'model': model, 'api_key': key, 'asr_model': None}
    body = {'model': model, 'messages': [{'role': 'system', 'content': '只输出JSON对象。'},
        {'role': 'user', 'content': '回复JSON：{"messages":["你好"],"emotion":"10","reminder":null}'}],
        'stream': False, 'max_tokens': 100, 'response_format': {'type': 'json_object'}}
    if args.provider == 'bigmodel': body['thinking'] = {'type': 'disabled'}
    request = urllib.request.Request(origin + '/chat/completions', data=json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.loads(response.read(100001))
        content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
        parsed = json.loads(content)
        if not isinstance(parsed, dict) or not parsed.get('messages'):
            raise ValueError('模型未返回有效短句JSON，原有配置保留')
    except urllib.error.HTTPError as error:
        raise ValueError('AI鉴权/调用失败，HTTP ' + str(error.code) + '，原有配置保留') from None
    except (OSError, TimeoutError, json.JSONDecodeError):
        raise ValueError('AI连接或响应校验失败，原有配置保留') from None
    uid = pwd.getpwnam(args.owner).pw_uid if args.owner else os.getuid()
    gid = pwd.getpwnam(args.owner).pw_gid if args.owner else os.getgid()
    fd, temp = tempfile.mkstemp(prefix='.companion-', dir=directory)
    try:
        os.fchmod(fd, 0o600); os.fchown(fd, uid, gid)
        with os.fdopen(fd, 'w') as handle:
            json.dump(config, handle); handle.flush(); os.fsync(handle.fileno())
        os.replace(temp, target)
    finally:
        if os.path.exists(temp): os.unlink(temp)
    print('AI配置已保存。模型调用与JSON校验通过；重启新版服务后生效。')

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else '配置失败，原有配置保留', file=sys.stderr)
        sys.exit(1)
