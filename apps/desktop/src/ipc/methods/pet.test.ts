import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { DesktopPetGalleryFetchError, fetchPetGallery, isAllowedPetGalleryUrl } from "./pet.ts";

function makeHttpClientLayer(
  handler: (
    request: HttpClientRequest.HttpClientRequest,
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, never>,
) {
  return Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => handler(request)),
  );
}

describe("pet gallery fetch IPC", () => {
  it("allows only https URLs on the known gallery hosts", () => {
    assert.isTrue(isAllowedPetGalleryUrl("https://openpets.sh/api/pets?page=1"));
    assert.isTrue(
      isAllowedPetGalleryUrl(
        "https://raw.githubusercontent.com/legeling/awesome-codex-pet/main/pets.json",
      ),
    );
    assert.isFalse(isAllowedPetGalleryUrl("http://openpets.sh/api/pets"));
    assert.isFalse(isAllowedPetGalleryUrl("https://evil.example/openpets.sh"));
    assert.isFalse(isAllowedPetGalleryUrl("not a url"));
  });

  it.effect("returns status, content type and body bytes", () => {
    const requestUrls: string[] = [];
    const layer = makeHttpClientLayer((request) =>
      Effect.sync(() => {
        requestUrls.push(request.url);
        return HttpClientResponse.fromWeb(
          request,
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "content-type": "image/webp" },
          }),
        );
      }),
    );

    return Effect.gen(function* () {
      // The method handler hands back the encoded result, typed as unknown.
      const result = (yield* fetchPetGallery.handler(
        "https://openpets.sh/api/pets/tater/spritesheet",
      )) as { status: number; contentType: string | null; body: Uint8Array };
      assert.equal(result.status, 200);
      assert.equal(result.contentType, "image/webp");
      assert.deepEqual(Array.from(result.body), [1, 2, 3]);
      assert.deepEqual(requestUrls, ["https://openpets.sh/api/pets/tater/spritesheet"]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("rejects hosts outside the allowlist without making a request", () => {
    let requests = 0;
    const layer = makeHttpClientLayer((request) =>
      Effect.sync(() => {
        requests += 1;
        return HttpClientResponse.fromWeb(request, new Response("", { status: 200 }));
      }),
    );

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(fetchPetGallery.handler("https://example.com/pets.json"));
      assert(Exit.isFailure(exit));
      const failure = Cause.findErrorOption(exit.cause);
      assert(Option.isSome(failure));
      assert.instanceOf(failure.value, DesktopPetGalleryFetchError);
      assert.equal(failure.value.reason, "host-not-allowed");
      assert.equal(requests, 0);
    }).pipe(Effect.provide(layer));
  });
});
