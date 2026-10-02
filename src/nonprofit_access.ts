export type MemberContext = {
  member_id: string;
  role: "donor" | "volunteer" | "campaign_manager";
  campaign_id: string;
};

export type NonprofitWorkspace = {
  memberId: string;
  campaignId: string;
  availableActions: Array<
    "view_own_receipts" | "view_volunteer_reminders" | "view_campaign_report"
  >;
  landingView: "receipts" | "reminders" | "campaign_report";
};

export function workspaceFor(member: MemberContext): NonprofitWorkspace {
  if (member.role === "donor") {
    return {
      memberId: member.member_id,
      campaignId: member.campaign_id,
      availableActions: ["view_own_receipts"],
      landingView: "receipts"
    };
  }

  if (member.role === "volunteer") {
    return {
      memberId: member.member_id,
      campaignId: member.campaign_id,
      availableActions: ["view_volunteer_reminders"],
      landingView: "reminders"
    };
  }

  return {
    memberId: member.member_id,
    campaignId: member.campaign_id,
    availableActions: ["view_volunteer_reminders", "view_campaign_report"],
    landingView: "campaign_report"
  };
}
