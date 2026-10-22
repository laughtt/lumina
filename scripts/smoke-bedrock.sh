#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
MODELS="${*:-anthropic.claude-opus-5-5 anthropic.claude-haiku-5-5}"
uv run --quiet --python 3.12 --with "anthropic[bedrock]" --with "botocore[crt]" python - "$REGION" $MODELS <<'PY'
import sys, time
from anthropic import AnthropicBedrockMantle
client = AnthropicBedrockMantle(aws_region=sys.argv[1])
for model in sys.argv[2:]:
    t = time.time()
    try:
        m = client.messages.create(model=model, max_tokens=40, output_config={"effort": "low"},
                                   messages=[{"role": "user", "content": "Say: Lumina is ready."}])
        text = "".join(b.text for b in m.content if b.type == "text")
        print(f"OK   {model:32} {time.time()-t:5.1f}s  {text!r}")
    except Exception as e:
        print(f"FAIL {model:32} {time.time()-t:5.1f}s  {str(e)[:140]}")
PY
