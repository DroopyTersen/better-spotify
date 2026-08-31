import { describe, expect, test } from "bun:test";
import { createAbortError } from "./syncContext";
import {
  describeSpotifySyncFailure,
  getSpotifySyncFailureMessage,
  runSpotifySyncStage,
  SpotifySyncStageError,
} from "./syncFailure";

describe("Spotify sync failure diagnostics", () => {
  test("records a stable stage without exposing the original message", async () => {
    const rawMessage = "private provider response body";
    const error = await runSpotifySyncStage("saved_tracks", async () => {
      throw new Error(rawMessage);
    }).catch((failure) => failure);

    expect(error).toBeInstanceOf(SpotifySyncStageError);
    expect(error.message).not.toContain(rawMessage);
    expect(describeSpotifySyncFailure(error)).toEqual({
      stage: "saved_tracks",
      kind: "unexpected",
      status: null,
    });
  });

  test("preserves cancellation and classifies known provider failures", async () => {
    const abort = createAbortError();
    expect(
      await runSpotifySyncStage("play_history", async () => {
        throw abort;
      }).catch((failure) => failure)
    ).toBe(abort);

    expect(
      describeSpotifySyncFailure(
        new SpotifySyncStageError(
          "top_tracks",
          new Error("The app has exceeded its rate limits.")
        )
      )
    ).toEqual({
      stage: "top_tracks",
      kind: "rate_limited",
      status: 429,
    });
  });

  test("uses a useful user message without raw failure details", () => {
    expect(
      getSpotifySyncFailureMessage({
        stage: "play_history",
        kind: "provider_data",
        status: null,
      })
    ).toBe(
      "Your saved library is available, but background Spotify sync failed while loading play history."
    );
  });
});
