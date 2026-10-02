import { workspaceFor } from "./nonprofit_access.ts";

const result = workspaceFor({
  member_id: "member_1042",
  role: "campaign_manager",
  campaign_id: "winter-shelter-2026"
});

console.log(JSON.stringify(result, null, 2));
