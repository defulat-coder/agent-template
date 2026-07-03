export type AgentJobAccepted = {
  id?: string;
  queue: string;
};

type SubmitAgentJobOptions = {
  prompt: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export async function submitAgentJob({
  prompt,
  baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  fetcher = fetch
}: SubmitAgentJobOptions): Promise<AgentJobAccepted> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error("Prompt is required");
  }

  let response: Response;

  try {
    response = await fetcher(`${baseUrl}/agent/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: trimmedPrompt,
        requestedAt: new Date().toISOString()
      })
    });
  } catch {
    throw new Error("Unable to reach Agent job intake API");
  }

  if (!response.ok) {
    throw new Error(`Agent job intake rejected the request with status ${response.status}`);
  }

  return (await response.json()) as AgentJobAccepted;
}
