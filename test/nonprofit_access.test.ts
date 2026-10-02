import assert from "node:assert/strict";
import test from "node:test";
import { workspaceFor } from "../src/nonprofit_access.ts";

test("a volunteer sees reminders without donor receipts", () => {
  const workspace = workspaceFor({
    member_id: "volunteer_7",
    role: "volunteer",
    campaign_id: "food-drive"
  });

  assert.deepEqual(workspace.availableActions, ["view_volunteer_reminders"]);
  assert.equal(workspace.landingView, "reminders");
});

test("a campaign manager receives reporting access", () => {
  const workspace = workspaceFor({
    member_id: "manager_2",
    role: "campaign_manager",
    campaign_id: "food-drive"
  });

  assert.deepEqual(workspace.availableActions, [
    "view_volunteer_reminders",
    "view_campaign_report"
  ]);
  assert.equal(workspace.landingView, "campaign_report");
});
