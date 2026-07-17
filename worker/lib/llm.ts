import type { Env } from "../types";

// ────────────────────────────────────────────────────────────────
// AI 调用：OpenAI 兼容 relay（inroi.shop），复用 hb_agent 的 key
// ────────────────────────────────────────────────────────────────

const LLM_TIMEOUT_MS = 120_000; // gpt-5.5 是 reasoning 模型，结构化生成可能 30-90s

export function llmStubMode(env: Env): boolean {
  return !env.OPENAI_CHAT_API_KEY;
}

// ────────────────────────────────────────────────────────────────
// 流式 chat（SSE）：逐 token 返回
// ────────────────────────────────────────────────────────────────

export async function llmChatStream(
  params: {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  },
  env: Env
): Promise<ReadableStream<Uint8Array>> {
  if (llmStubMode(env)) {
    throw new Error("LLM stub mode: no OPENAI_CHAT_API_KEY configured");
  }

  const baseUrl = env.OPENAI_BASE_URL ?? "https://www.inroi.shop/v1";
  const model = env.DEFAULT_LLM_MODEL ?? "gpt-5.5";

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_CHAT_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: params.system }, ...params.messages],
      temperature: 0.7,
      stream: true
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
  });

  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`LLM stream failed: ${resp.status} ${detail.slice(0, 300)}`);
  }

  const contentType = resp.headers.get("content-type") ?? "";

  // 非 SSE 响应：解析为 JSON，返回完整 content
  if (!contentType.includes("text/event-stream")) {
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      }
    });
  }

  // SSE 响应：逐 chunk 解析
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = resp.body.getReader();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          controller.close();
          return;
        }
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        } catch {
          // skip invalid JSON
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    }
  });
}

export async function llmChatJSON<T>(
  params: {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    schemaDescription?: string;
  },
  env: Env
): Promise<T> {
  if (llmStubMode(env)) {
    throw new Error("LLM stub mode: no OPENAI_CHAT_API_KEY configured");
  }

  const baseUrl = env.OPENAI_BASE_URL ?? "https://www.inroi.shop/v1";
  const model = env.DEFAULT_LLM_MODEL ?? "gpt-5.5";

  // 在 system 后追加 schema 描述，要求模型只返回 JSON
  const systemPrompt =
    params.schemaDescription != null
      ? `${params.system}\n\n只返回 JSON，schema 如下：\n${params.schemaDescription}\n不要返回任何额外文本或 markdown 代码块标记。`
      : params.system;

  const body = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...params.messages],
    temperature: 0.7,
    response_format: { type: "json_object" }
  };

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_CHAT_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`LLM call failed: ${resp.status} ${detail.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty content");
  }

  // 兼容模型偶尔返回带 markdown 代码块的 JSON
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`LLM returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
}
