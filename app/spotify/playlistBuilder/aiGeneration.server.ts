import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai";
import { generateText, Output, streamText, type DeepPartial } from "ai";
import type { ZodType } from "zod";

export const PLAYLIST_GENERATION_MODEL_ID = "gpt-5.6-luna" as const;

export const PLAYLIST_GENERATION_PROVIDER_OPTIONS = {
  openai: {
    reasoningEffort: "medium",
    store: false,
  } satisfies OpenAILanguageModelResponsesOptions,
};

export const WEB_RESEARCH_MAX_TOOL_CALLS = 2;
export const WEB_RESEARCH_TIMEOUT_MS = 30_000;

export const WEB_RESEARCH_PROVIDER_OPTIONS = {
  openai: {
    ...PLAYLIST_GENERATION_PROVIDER_OPTIONS.openai,
    maxToolCalls: WEB_RESEARCH_MAX_TOOL_CALLS,
  } satisfies OpenAILanguageModelResponsesOptions,
};

export const playlistGenerationModel = openai.responses(
  PLAYLIST_GENERATION_MODEL_ID
);

export type StructuredGenerationRequest<Result> = {
  instructions: string;
  prompt: string;
  schema: ZodType<Result>;
  onPartialOutput?: (partialOutput: DeepPartial<Result>) => void;
};

export type WebResearchGenerationResult<Result> = {
  output: Result;
  sourceUrls: string[];
};

export async function generateStructuredObject<Result>({
  instructions,
  prompt,
  schema,
  onPartialOutput,
}: StructuredGenerationRequest<Result>): Promise<Result> {
  if (onPartialOutput) {
    const result = streamText({
      model: playlistGenerationModel,
      instructions,
      prompt,
      output: Output.object({ schema }),
      providerOptions: PLAYLIST_GENERATION_PROVIDER_OPTIONS,
    });

    for await (const partialOutput of result.partialOutputStream) {
      onPartialOutput(partialOutput as DeepPartial<Result>);
    }

    return result.output;
  }

  const result = await generateText({
    model: playlistGenerationModel,
    instructions,
    prompt,
    output: Output.object({ schema }),
    providerOptions: PLAYLIST_GENERATION_PROVIDER_OPTIONS,
  });

  return result.output;
}

export async function generateWebResearchObject<Result>({
  instructions,
  prompt,
  schema,
}: StructuredGenerationRequest<Result>,
model: typeof playlistGenerationModel = playlistGenerationModel): Promise<
  WebResearchGenerationResult<Result>
> {
  const result = await generateText(
    createWebResearchGenerationOptions({ instructions, prompt, schema }, model)
  );

  const sourceUrls = result.sources.flatMap((source) =>
    source.sourceType === "url" ? [source.url] : []
  );
  sourceUrls.push(...webSearchToolSourceUrls(result.toolResults));

  return {
    output: result.output,
    sourceUrls: [...new Set(sourceUrls)],
  };
}

export function createWebResearchGenerationOptions<Result>({
  instructions,
  prompt,
  schema,
}: StructuredGenerationRequest<Result>,
model: typeof playlistGenerationModel = playlistGenerationModel) {
  return {
    model,
    instructions,
    prompt,
    tools: {
      web_search: openai.tools.webSearch({
        externalWebAccess: true,
        searchContextSize: "low",
      }),
    },
    toolChoice: { type: "tool", toolName: "web_search" } as const,
    output: Output.object({ schema }),
    maxRetries: 0,
    timeout: WEB_RESEARCH_TIMEOUT_MS,
    providerOptions: WEB_RESEARCH_PROVIDER_OPTIONS,
  };
}

function webSearchToolSourceUrls(toolResults: readonly unknown[]): string[] {
  return toolResults.flatMap((toolResult) => {
    if (!isRecord(toolResult) || toolResult.toolName !== "web_search") return [];
    const output = toolResult.output;
    if (!isRecord(output) || !Array.isArray(output.sources)) return [];
    return output.sources.flatMap((source) =>
      isRecord(source) && source.type === "url" && typeof source.url === "string"
        ? [source.url]
        : []
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
