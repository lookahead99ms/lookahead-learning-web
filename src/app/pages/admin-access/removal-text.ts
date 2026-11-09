/**
 * The words beside Disable, Enable and Delete (DLV-969, user 2026-11-03), on Manage DEV admission in the person panel
 * and on Reject under Review requests (DLV-971, owner 2026-11-06), so both places say the same thing about the same
 * action. Owner, 2026-11-08: Disable is a ban on the email account; Delete is not, they can ask again.
 */
export const REMOVAL_TEXT = {
  disable: 'Strongest. Bans this email account from the platform: every sign-in, with email or Google, is blocked and their open DEV session closes within 5 minutes. They cannot ask for access again until you enable them.',
  enable: 'Lifts the ban. Lets them sign in again with the same account, roles and progress.',
  remove: 'Removes the account with its plans and progress, but does not ban them: they can sign in and ask for access again at any time, and then appear in Review requests as a new person.',
} as const;

/** The same two actions on a request that was never admitted: no session to close, no progress to erase. */
export const REJECT_TEXT = {
  disable: 'Strongest. Bans this email account from DEV: every sign-in, with email or Google, is blocked. They cannot ask for access again until you enable them on People.',
  remove: 'Removes the request and their sign-in, but does not ban them: they can sign in and ask again at any time, and then appear here as a new person.',
} as const;
