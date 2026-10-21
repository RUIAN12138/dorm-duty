"""Private owner-run BigModel configuration. Keys never enter arguments or logs."""
import argparse, getpass, json, os, pwd, stat, sys, tempfile, urllib.request, urllib.error
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description='私密配置球球智谱AI')
    parser.add_argument('--directory',type=Path,default=Path('/var/lib/dorm-duty'))
    parser.add_argument('--owner',default='dorm-duty')
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args();directory=args.directory.resolve(strict=True);target=directory/'companion-ai.json'
    if target.is_symlink():raise ValueError('配置文件不能为链接')
    if args.check:
        print(json.dumps({'configured':target.is_file()},ensure_ascii=False));return
    if not sys.stdin.isatty():raise ValueError('请在本人终端执行')
    key=getpass.getpass('智谱 API Key（不显示）：').strip()
    again=getpass.getpass('再次输入 API Key：').strip()
    if not key or key!=again or any(c.isspace() for c in key):raise ValueError('两次输入不一致或格式错误')
    config={'base_url':'https://open.bigmodel.cn/api/paas/v4','model':'glm-4.7-flash','api_key':key,'asr_model':'glm-asr-2512'}
    # Only a harmless service probe, no dorm, user or conversation data.
    body=json.dumps({'model':config['model'],'messages':[{'role':'user','content':'请回复：你好'}],'thinking':{'type':'disabled'},'stream':False,'max_tokens':32}).encode()
    request=urllib.request.Request(config['base_url']+'/chat/completions',data=body,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=20) as r: result=json.load(r)
        if not result.get('choices',[{}])[0].get('message',{}).get('content'):raise ValueError('未收到模型回答，未保存配置')
    except urllib.error.HTTPError as error:raise ValueError('AI鉴权/调用失败，HTTP '+str(error.code)+'，未保存配置') from None
    except (OSError,TimeoutError):raise ValueError('AI连接失败，未保存配置') from None
    uid=pwd.getpwnam(args.owner).pw_uid if args.owner else os.getuid();gid=pwd.getpwnam(args.owner).pw_gid if args.owner else os.getgid()
    fd,temp=tempfile.mkstemp(prefix='.companion-',dir=directory)
    try:
        os.fchmod(fd,0o600);os.fchown(fd,uid,gid)
        with os.fdopen(fd,'w') as f:json.dump(config,f);f.flush();os.fsync(f.fileno())
        os.replace(temp,target)
    finally:
        if os.path.exists(temp):os.unlink(temp)
    print('AI配置已保存。聊天鉴权成功；语音模型权限需另行实测。重启服务后生效。')
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,ValueError) else '配置失败，原有配置保留',file=sys.stderr);sys.exit(1)
