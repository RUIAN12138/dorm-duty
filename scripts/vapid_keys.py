#!/usr/bin/env python3
"""User-run helper: writes fresh VAPID key values to their terminal, never to files."""
from base64 import urlsafe_b64encode
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

key = ec.generate_private_key(ec.SECP256R1())
private = key.private_numbers().private_value.to_bytes(32, 'big')
public = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
print('将以下值通过部署环境配置。私钥请妥善保管，不要提交仓库：')
print('VAPID_PRIVATE_KEY=' + urlsafe_b64encode(private).rstrip(b'=').decode())
print('VAPID_PUBLIC_KEY=' + urlsafe_b64encode(public).rstrip(b'=').decode())
print('VAPID_SUBJECT=mailto:your-email@example.com')
