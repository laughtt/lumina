from __future__ import annotations

import json
import os
import time
from decimal import Decimal
from typing import Any, Optional

from activegraph.llm import LLMResponse
from activegraph.llm.anthropic import _extract_text, _extract_tool_calls, _message_to_anthropic
from activegraph.llm.parsing import parse_structured_response

MODEL = os.environ.get("MODEL_ID", "anthropic.claude-opus-5-5")


class BedrockProvider:
    default_model = MODEL

    def __init__(self, region: Optional[str] = None):
        from anthropic import AnthropicBedrockMantle

        self.client = AnthropicBedrockMantle(aws_region=region or os.environ.get("AWS_REGION", "us-east-1"))

    def complete(self, *, system, messages, model, max_tokens, temperature, top_p, output_schema,
                 timeout_seconds, tools=None, structured_output_mode="prompt") -> LLMResponse:
        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": int(max_tokens),
            "system": system,
            "messages": [_message_to_anthropic(m) for m in messages],
            "output_config": {"effort": "low"},
        }
        if tools:
            kwargs["tools"] = list(tools)
        t0 = time.monotonic()
        raw = self.client.messages.create(timeout=timeout_seconds, **kwargs)
        text = _extract_text(raw)
        calls = _extract_tool_calls(raw, name_map=None)
        parsed = parse_structured_response(text, output_schema) if output_schema is not None and not calls else None
        usage = raw.usage
        return LLMResponse(
            raw_text=text, parsed=parsed,
            input_tokens=usage.input_tokens, output_tokens=usage.output_tokens,
            cost_usd=self.estimate_cost(input_tokens=usage.input_tokens, output_tokens=usage.output_tokens, model=model),
            latency_seconds=time.monotonic() - t0, model=model,
            finish_reason=str(raw.stop_reason or "end_turn"), tool_calls=calls or None,
        )

    def estimate_cost(self, *, input_tokens, output_tokens, model) -> Decimal:
        return (Decimal(input_tokens) * Decimal("4") + Decimal(output_tokens) * Decimal("20")) / Decimal(1_000_000)

    def count_tokens(self, *, system, messages, model) -> int:
        return (len(system) + sum(len(m.content) for m in messages)) // 4

    def recognizes_model(self, name: str) -> bool:
        return name.startswith("anthropic.")

    def supports_native_structured_output(self, model: str) -> bool:
        return False


class OfflineProvider(BedrockProvider):
    def __init__(self):
        pass

    def complete(self, *, system, messages, model, max_tokens, temperature, top_p, output_schema,
                 timeout_seconds, tools=None, structured_output_mode="prompt") -> LLMResponse:
        prompt = " ".join(m.content for m in messages)
        tried = "tv_step#" in prompt
        order = ("call_luis", "bigger_answer") if tried else ("bigger_answer", "calming_memory")
        step = next((s for s in order if f'"{s}"' in prompt), "none")
        reason = ("Offline mode: a TV step was already tried, so a call from family is next." if step == "call_luis"
                  else "Offline mode: the written cue comes first, because written answers reduce repeated questions.")
        text = json.dumps({"step": step, "reason": reason})
        parsed = parse_structured_response(text, output_schema) if output_schema is not None else None
        return LLMResponse(raw_text=text, parsed=parsed, input_tokens=0, output_tokens=0, cost_usd=Decimal(0),
                           latency_seconds=0.0, model=model, finish_reason="end_turn")


def provider():
    return OfflineProvider() if os.environ.get("LLM") == "offline" else BedrockProvider()
