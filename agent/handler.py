import os

import boto3
from botocore.exceptions import ClientError

from lumina_agent import host

s3 = boto3.client("s3")
BUCKET, KEY = os.environ["AGENT_DB"].removeprefix("s3://").split("/", 1)
FOLDER = KEY.rsplit("/", 1)[0]
FILES = ("rosa.db", "state.json")


def handler(event, context):
    host.DATA.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        try:
            s3.download_file(BUCKET, f"{FOLDER}/{name}", str(host.DATA / name))
        except ClientError:
            pass
    if (event or {}).get("action") == "reset":
        result = host.reset()
        for name in FILES:
            s3.delete_object(Bucket=BUCKET, Key=f"{FOLDER}/{name}")
        return result
    result = host.tick()
    for name in FILES:
        if (host.DATA / name).exists():
            s3.upload_file(str(host.DATA / name), BUCKET, f"{FOLDER}/{name}")
    return result
