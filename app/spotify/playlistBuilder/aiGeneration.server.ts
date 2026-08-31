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

export const playlistGenerationModel = openai.responses(
  PLAYLIST_GENERATION_MODEL_ID
);

export type StructuredGenerationRequest<Result> = {
  instructions: string;
  prompt: string;
  schema: ZodType<Result>;
  onPartialOutput?: (partialOutput: DeepPartial<Result>) => void;
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
