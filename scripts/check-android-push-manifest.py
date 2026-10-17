"""Check the merged Android manifest, not merely source XML or compilation."""
import argparse
import re
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument("manifest")
parser.add_argument("--require-app-key", action="store_true")
args = parser.parse_args()
root = ET.parse(args.manifest).getroot()
android = "{http://schemas.android.com/apk/res/android}"
application = root.find("application")
package = root.get("package")
assert package == "cn.lundao.dorm", "Android package does not match the push application"


def component(kind, name):
    for node in application.findall(kind):
        actual = node.get(android + "name", "")
        actual = package + actual if actual.startswith(".") else actual
        if actual == name:
            return node
    raise AssertionError("Missing required component: " + name)


service = component("service", "cn.lundao.dorm.DormPushService")
assert service.get(android + "enabled", "true") == "true", "Push service is disabled"
assert service.get(android + "exported") == "false", "Push service must remain internal"
assert service.get(android + "process") == ":pushcore", "Push service process is missing"
assert any(action.get(android + "name") == "cn.jiguang.user.service.action" for action in service.findall("intent-filter/action")), "JCore discovery action is missing"
receiver = component("receiver", "cn.lundao.dorm.PushReceiver")
assert receiver.get(android + "exported") == "false", "App receiver must remain internal"
assert any(action.get(android + "name") == "cn.jpush.android.intent.RECEIVER_MESSAGE" for action in receiver.findall("intent-filter/action")), "Documented JPush receiver discovery action is missing"
metadata = {item.get(android + "name"): item.get(android + "value", "") for item in application.findall("meta-data")}
key = metadata.get("JPUSH_APPKEY", "")
if args.require_app_key:
    assert re.fullmatch(r"[a-fA-F0-9]{24}", key), "Configured APK is missing a valid public AppKey"
assert root.find(f"uses-permission[@{android}name='android.permission.POST_NOTIFICATIONS']") is not None, "Notification permission is missing"
print("Merged push manifest checks passed; no credentials printed")
