#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
TYPE="${INSTANCE_TYPE:-c7i.2xlarge}"
NAME="lumina-vega-tmp-$(date +%s)"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/../shots"
WORK="$(mktemp -d)"
KEY="$WORK/key.pem"
SG="" ID=""

cleanup() {
  [ "${KEEP:-}" = "1" ] && { echo "KEEP=1: instance $ID left running (ssh -i $KEY ubuntu@$IP). Delete later with: aws ec2 terminate-instances --instance-ids $ID"; return; }
  echo "Cleaning up…"
  [ -n "$ID" ] && aws ec2 terminate-instances --region "$REGION" --instance-ids "$ID" >/dev/null && aws ec2 wait instance-terminated --region "$REGION" --instance-ids "$ID"
  [ -n "$SG" ] && aws ec2 delete-security-group --region "$REGION" --group-id "$SG" || true
  aws ec2 delete-key-pair --region "$REGION" --key-name "$NAME" >/dev/null 2>&1 || true
  echo "Deleted: instance, security group, key pair."
}
trap cleanup EXIT

AMI=$(aws ssm get-parameter --region "$REGION" --name /aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id --query Parameter.Value --output text)
VPC=$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text)
MYIP=$(curl -s https://checkip.amazonaws.com)

aws ec2 create-key-pair --region "$REGION" --key-name "$NAME" --key-type ed25519 --query KeyMaterial --output text > "$KEY"; chmod 600 "$KEY"
SG=$(aws ec2 create-security-group --region "$REGION" --group-name "$NAME" --description "Temporary Lumina Vega test, SSH from one IP" --vpc-id "$VPC" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG" --protocol tcp --port 22 --cidr "$MYIP/32" >/dev/null
printf '#!/bin/bash\nshutdown -h +180\n' > "$WORK/userdata.sh"
ID=$(aws ec2 run-instances --region "$REGION" --image-id "$AMI" --instance-type "$TYPE" --cpu-options "NestedVirtualization=enabled" \
  --key-name "$NAME" --security-group-ids "$SG" --instance-initiated-shutdown-behavior terminate --user-data "file://$WORK/userdata.sh" \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=80,VolumeType=gp3,DeleteOnTermination=true}' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" --query "Instances[0].InstanceId" --output text)
aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$ID"
IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$ID" --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 "ubuntu@$IP")
echo "Instance $ID at $IP"

rsync -az -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" --exclude node_modules --exclude .venv --exclude build --exclude dist \
  --exclude .data --exclude tv/android --exclude infra --exclude '.env*' --exclude .git "$REPO/" "ubuntu@$IP:lumina/"
"${SSH[@]}" bash -s <<'REMOTE'
set -euo pipefail
sudo apt-get update -y && sudo apt-get install -y docker.io docker-compose-v2 netcat-openbsd
sudo usermod -aG docker ubuntu
cd ~/lumina && sudo LLM=offline docker compose up -d --build
until curl -sf localhost:8787/api/health >/dev/null; do sleep 2; done
export VEGA_HEADLESS=1
bash scripts/windows/vega-ubuntu.sh
REMOTE

mkdir -p "$OUT"
"${SSH[@]}" bash -s <<'REMOTE'
set -e
# The Vega CLI has no screenshot command. The emulator console's "screenrecord screenshot" captures the GPU-rendered
# display (QEMU's screendump only sees a black framebuffer).
shot() {
  rm -rf /tmp/shots && mkdir -p /tmp/shots
  { echo "auth $(cat ~/.emulator_console_auth_token)"; echo "screenrecord screenshot /tmp/shots"; sleep 4; echo quit; } | nc -q 5 localhost 5554 >/dev/null
  cp "$(ls -t /tmp/shots/*.png | head -1)" "$HOME/$1"
}
H=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
curl -s -X POST localhost:8787/api/demo/clock -H 'content-type: application/json' -d '{"at":"13:47"}' >/dev/null
sleep 6; shot vega-today.png
curl -s localhost:8787/mcp "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"show_memory","arguments":{"query":"our house in Porto"}}}' >/dev/null
sleep 6; shot vega-memory.png
REMOTE
scp -i "$KEY" "ubuntu@$IP:vega-*.png" "$OUT/" && echo "Screenshots in $OUT: vega-today.png, vega-memory.png"
