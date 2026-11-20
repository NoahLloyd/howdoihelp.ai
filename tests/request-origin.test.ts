import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrigin } from "../src/lib/request-origin";

test("origin validation uses the browser-facing host behind Next's internal URL", () => {
  const request = new Request("http://localhost:3000/api/visitor", { headers: { host: "www.howdoihelp.ai" } });
  assert.equal(isSameOrigin(request, "https://www.howdoihelp.ai"), true);
  for (const origin of ["", "null", "https://attacker.invalid", "https://www.howdoihelp.ai.attacker.invalid", "https://www.howdoihelp.ai/path"]) {
    assert.equal(isSameOrigin(request, origin), false);
  }
});
